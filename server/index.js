// server/index.js (ESM)
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import AgentApiClient from 'salesforce-agent-api-client';

import { fileURLToPath } from 'url';
import nodePath from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

// Load .env from this folder (override shell vars just in case)
dotenv.config({ path: nodePath.join(__dirname, '.env'), override: true });

// Env
const {
  PORT = 4010,
  HOST = '127.0.0.1',
  instanceUrl,
  clientId,
  clientSecret,
  agentId
} = process.env;

// App
const app = express();
app.use(cors());
app.use(express.json());

// Static UI
const PUBLIC_DIR = nodePath.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));
app.get('/', (_req, res) => res.sendFile(nodePath.join(PUBLIC_DIR, 'index.html')));

// Health
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    instanceUrl,
    hasInstanceUrl: !!instanceUrl,
    hasClientId: !!clientId,
    hasClientSecret: !!clientSecret,
    hasAgentId: !!agentId,
    host: HOST,
    port: Number(PORT)
  });
});

// DIAG: token like Postman
app.get('/diag/token', async (_req, res) => {
  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    });
    const r = await fetch(`${instanceUrl}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const j = await r.json();
    res.status(r.ok ? 200 : 500).json({
      ok: r.ok,
      status: r.status,
      scope: j.scope || '',
      api_instance_url: j.api_instance_url || '',
      access_token_present: Boolean(j.access_token),
      error: j.error || null
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// DIAG: Start Session RAW (mirrors Postman)
async function startSessionRaw(_req, res) {
  try {
    const tRes = await fetch(`${instanceUrl}/services/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      })
    });
    const tok = await tRes.json();
    if (!tRes.ok) {
      return res.status(500).json({ step: 'token', status: tRes.status, body: tok });
    }
    const api = tok.api_instance_url;
    const payload = {
      externalSessionKey: `diag-${Date.now()}`,
      instanceConfig: { endpoint: instanceUrl },
      tz: 'America/Chicago',
      featureSupport: 'Streaming',
      streamingCapabilities: { chunkTypes: ['Text'] },
      bypassUser: true
    };
    const sRes = await fetch(`${api}/einstein/ai-agent/v1/agents/${agentId}/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tok.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const text = await sRes.text();
    res.status(sRes.ok ? 200 : 500).type('application/json').send(text);
  } catch (e) {
    res.status(500).json({ step: 'exception', error: e.message });
  }
}
app.get('/diag/session-raw', startSessionRaw);
app.post('/diag/session-raw', startSessionRaw);

// Agent API client
const cfg = { instanceUrl, clientId, clientSecret, agentId };
let client = null;
let authed = false;
async function ensureAuth(force = false) {
  if (!client) client = new AgentApiClient(cfg);
  if (!authed || force) { await client.authenticate(); authed = true; }
}

// Start Session (library)
app.post('/api/session/start', async (_req, res) => {
  try {
    await ensureAuth(false);
    let sessionId;
    try { sessionId = await client.createSession(); }
    catch { await ensureAuth(true); sessionId = await client.createSession(); }
    res.json({ sessionId });
  } catch (e) {
    res.status(500).json({ error: 'session_start_failed', detail: e?.cause?.message || e.message });
  }
});

// Streaming proxy
app.post('/api/message/stream', async (req, res) => {
  const { sessionId, text, variables = [] } = req.body || {};
  if (!sessionId || !text) return res.status(400).json({ error: 'missing_params' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  try {
    await ensureAuth(false);
    const onMessage = ({ event, data }) => { res.write(`event: ${event}\n`); res.write(`data: ${data || '{}'}\n\n`); };
    // Leave the session open so you can send multiple prompts
    const onDisconnect = () => {res.end(); };

 let es;
    try { es = client.sendStreamingMessage(sessionId, text, variables, onMessage, onDisconnect); }
    catch { await ensureAuth(true); es = client.sendStreamingMessage(sessionId, text, variables, onMessage, onDisconnect); }

    req.on('close', () => { try { es?.close(); } catch {} });
  } catch (e) {
    res.write(`event: ERROR\ndata: ${JSON.stringify({ error: e?.cause?.message || e.message })}\n\n`);
    res.end();
  }
});

// Catch-all LAST
app.get(/.*/, (_req, res) => res.sendFile(nodePath.join(PUBLIC_DIR, 'index.html')));

// Start
const server = app.listen(PORT, HOST, () => {
  console.log('────────────────────────────────────────');
  console.log(`✅ NuRF UI on        → http://${HOST}:${PORT}`);
  console.log(`📁 Serving static    → ${PUBLIC_DIR}`);
  console.log(`🔗 Auth: Client Credentials → ${instanceUrl || '(undefined!)'}`);
  console.log('────────────────────────────────────────');
});
server.on('error', (err) => console.error('Server start error:', err.message));

// server/index.js
app.post('/api/session/end', async (req, res) => {
  const { sessionId } = req.body || {};
  if (!sessionId) return res.status(400).json({ error: 'missing_params' });
  try { await ensureAuth(false); await client.closeSession(sessionId); res.json({ ok:true }); }
  catch (e) { res.status(500).json({ error:'end_failed', detail:e?.cause?.message || e.message }); }
});

