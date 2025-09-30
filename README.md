# CLAY COTTAGE — Headless Agent (Agentforce) Web Client

A lightweight retail-style homepage (HTML/CSS/JS) with a floating **headless Agentforce** assistant.  
The web page runs locally via a tiny Node/Express server that proxies to the **Salesforce Agent API** using OAuth credentials from a **Connected App** you control.

**Use case:** Help customers with product questions, order status, and quick styling guidance across multiple furniture & décor categories—fast, on-brand, and easy to demo.

---

## What’s in here

- **Custom Web Page (HTML/CSS/JS):**  
  `server/public/index.html` implements a Pottery Barn–style layout plus a floating “chat” launcher.
- **Headless Agent Client:**  
  `server/public/app.js` opens a streaming (SSE) session to your agent via local endpoints.
- **Agent Proxy (Node/Express):**  
  `server/index.js` exchanges your **Connected App** credentials for an OAuth token and relays messages to the **Agentforce Agent API**.

---

## Prerequisites

- **Node.js 18+**  
- Salesforce org with:  
  - A **Connected App** (client id/secret)  
  - A **Headless Agent** (Agent Id starting with `0Xx`)

---

## Salesforce setup

### 1) Create a Connected App (server-to-server)

1. Setup → App Manager → New Connected App  
2. Enable **OAuth 2.0 Client Credentials Flow**  
3. Assign proper **OAuth scopes** (`api`, `refresh_token`, etc.)  
4. Capture the **Consumer Key** and **Consumer Secret**

### 2) Create / Verify a Headless Agent

1. Agentforce Studio → Create Agent → **Headless**  
2. Configure retrieval/knowledge as needed  
3. Copy the **Agent Id** (starts with `0Xx`)  
4. Ensure your integration user has permission to call the Agent API

---

## Local setup & run

1. Copy env example → `.env`:

```bash
cd server
cp env.example .env
```

2. Edit `server/.env` with your values:

```ini
instanceUrl=https://<your-subdomain>.my.salesforce.com
clientId=<Consumer-Key>
clientSecret=<Consumer-Secret>
agentId=0Xx...
HOST=127.0.0.1
PORT=4012
```

3. Install & start:

```bash
npm ci
npm start
```

4. Open in browser:

```
http://127.0.0.1:4012/
```

Click chat button to start a session with Clay Cottage agent.

---

## GitHub / Team usage

1. Initialize and push:

```bash
git init
git add .
git commit -m "Clay Cottage headless Agentforce client"
git branch -M main
git remote add origin https://github.com/<org>/<repo>.git
git push -u origin main
```

2. Teammates clone & run:

```bash
git clone https://github.com/<org>/<repo>.git
cd repo/server
cp env.example .env
npm ci && npm start
```

---

## .gitignore

We include a root `.gitignore` that excludes secrets and heavy artifacts:

```gitignore
# OS
.DS_Store
Thumbs.db

# Node
node_modules/
npm-debug.log*
yarn.lock
pnpm-lock.yaml

# Env / secrets
.env
.env.*
server/.env
server/.env.*
env/
env/**

# Logs
*.log
server/logs/

# Build outputs
dist/
build/

# Editors
.vscode/
.idea/
```
