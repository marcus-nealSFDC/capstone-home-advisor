// NuRF floating chat client (streaming SSE, linkify, multi-turn, snappy UI)

var sessionId = null;
var controller = null;
var sessionStarted = false;

// Elements
var win         = document.getElementById('chatWindow');
var fab         = document.getElementById('chatFab');
var closeX      = document.getElementById('chatClose');
var elHistory   = document.getElementById('history');
var elInput     = document.getElementById('input');
var elSend      = document.getElementById('send');
var statusBadge = document.getElementById('status');

// ===== Helpers: safe HTML + linkify =====
function escHtml(s){
  return s.replace(/[&<>"]/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]);});
}
function escAttr(s){
  return s.replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]);});
}

function renderRich(text){
  // capture markdown/quoted links first so we can escape safely
  var links = [];
  var out = String(text || '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function(_,t,u){
      var id=links.push({t,u})-1; return '\u0000LINK'+id+'\u0001';
    })
    .replace(/"([^"]+)"\s*\((https?:\/\/[^\s)]+)\)/g, function(_,t,u){
      var id=links.push({t,u})-1; return '\u0000LINK'+id+'\u0001';
    });

  // escape everything else; preserve newlines
  out = escHtml(out).replace(/\n/g,'<br/>');

  // linkify bare URLs
  out = out.replace(/(https?:\/\/[^\s<>"')]+)(?=\s|$)/g, function(m){
    return '<a href="'+escAttr(m)+'" target="_blank" rel="noopener noreferrer">'+escHtml(m)+'</a>';
  });

  // restore placeholders
  out = out.replace(/\u0000LINK(\d+)\u0001/g, function(_,i){
    var p = links[Number(i)] || {t:'link',u:'#'};
    return '<a href="'+escAttr(p.u)+'" target="_blank" rel="noopener noreferrer">'+escHtml(p.t)+'</a>';
  });
  return out;
}

// ===== UI helpers =====
function fit(){
  elInput.style.height = 'auto';
  elInput.style.height = Math.min(elInput.scrollHeight, 320) + 'px'; // allow larger input growth
}
elInput.addEventListener('input', fit);
window.addEventListener('load', fit);

function addMessage(role, text, partial){
  var row=document.createElement('div');
  row.className='row '+(role==='user'?'user':role==='agent'?'agent':'system');
  var bubble=document.createElement('div');
  bubble.className='bubble';
  bubble.innerHTML=renderRich(text);
  if(partial) bubble.setAttribute('data-partial','1');
  row.appendChild(bubble);
  elHistory.appendChild(row);
  elHistory.scrollTop=elHistory.scrollHeight;
  return bubble;
}

function setReady(ready, sid){
  elSend.disabled=!ready;
  statusBadge.textContent = ready ? ('Session: ready'+(sid?' ['+sid+']':'')) : 'Session: starting...';
}

// ===== Session controls =====
async function startSession(){
  try{
    setReady(false);
    var r = await fetch('/api/session/start',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:'{}'
    });
    if(!r.ok){
      var t = await r.text();
      addMessage('system','Session error: '+t);
      return;
    }
    var j = await r.json();
    sessionId=j.sessionId;
    sessionStarted=true;
    setReady(true,sessionId);
    addMessage('system','Session ready.');
  }catch(e){
    addMessage('system','Session error: '+(e && e.message?e.message:String(e)));
  }
}

async function ensureSession(){
  if(sessionId) return true;
  await startSession();
  return Boolean(sessionId);
}

// ===== Streaming send =====
async function sendMessage(text){
  controller = new AbortController();
  addMessage('user', text, false);

  var res;
  try{
    res = await fetch('/api/message/stream',{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'text/event-stream'},
      body:JSON.stringify({sessionId:sessionId,text:text}),
      signal:controller.signal
    });
  }catch(e){
    addMessage('system','Stream error: '+(e && e.message?e.message:String(e)));
    return;
  }

  if(!res.ok){
    var errTxt = await res.text().catch(function(){return String(res.status);});
    addMessage('system','Stream error ('+res.status+'): '+errTxt);
    return;
  }
  if(!res.body){ addMessage('system','No stream body'); return; }

  var reader=res.body.getReader();
  var decoder=new TextDecoder();
  var buf='';

  while(true){
    var rd = await reader.read();
    if(rd.done) break;
    buf += decoder.decode(rd.value,{stream:true});

    var idx;
    while((idx = buf.indexOf('\n\n')) >= 0){
      var frame = buf.slice(0,idx);
      buf = buf.slice(idx+2);

      var lines = frame.split('\n');
      var event = 'message';
      var dataStr = '';
      for(var i=0;i<lines.length;i++){
        var line = lines[i];
        if(line.indexOf('event:')===0) event = line.slice(6).trim();
        if(line.indexOf('data:')===0)  dataStr += line.slice(5).trim();
      }
      var data={};
      try{ data = dataStr ? JSON.parse(dataStr) : {}; }catch(_){}

      if(event==='PROGRESS_INDICATOR'){
        // optional: show typing spinner, skipped for simplicity
      }
      if(event==='INFORM'){
        var partial = (data && data.message && data.message.message) ? data.message.message : '';
        var last = elHistory.lastElementChild;
        var needs = !(last && last.querySelector && last.querySelector('[data-partial]'));
        if(needs){
          var b = addMessage('agent','',true);
          b.setAttribute('data-partial','1');
        }
        elHistory.lastElementChild.querySelector('.bubble').innerHTML = renderRich(partial);
      }
      if(event==='END_OF_TURN'){
        var lastPartial = elHistory.lastElementChild && elHistory.lastElementChild.querySelector
          ? elHistory.lastElementChild.querySelector('[data-partial]')
          : null;
        if(lastPartial) lastPartial.removeAttribute('data-partial');
      }
      if(event==='ERROR'){
        addMessage('system','Stream error: '+(data && data.error ? data.error : ''));
      }
    }
  }
}

// ===== Composer actions =====
async function onSend(){
  var text = elInput.value.trim();
  if(!text) return;
  elInput.value='';
  fit();
  var ok = await ensureSession();
  if(!ok){
    addMessage('system','No session. Check /health and .env.');
    return;
  }
  sendMessage(text);
}
elSend.addEventListener('click', onSend);
elInput.addEventListener('keydown', function(e){
  if(e.key==='Enter' && !e.shiftKey){
    e.preventDefault();
    onSend();
  }
});

// ===== Open/Close chat (snappy) =====
function openChat(){
  win.classList.add('open');
  fab.classList.add('hidden');
  if(!sessionStarted){
    startSession().then(function(){ elInput.focus(); });
  }else{
    elInput.focus();
  }
}
function closeChat(){
  win.classList.remove('open');
  fab.classList.remove('hidden');
}
fab.addEventListener('click', openChat);
closeX.addEventListener('click', closeChat);
document.addEventListener('keydown', function(e){
  if(e.key==='Escape' && win.classList.contains('open')) closeChat();
});

// ===== Stop button =====
if(!document.getElementById('stop')){
  var stop = document.createElement('button');
  stop.id='stop';
  stop.className='btn';
  stop.type='button';
  stop.textContent='Stop';
  document.querySelector('.composer').appendChild(stop);
  stop.addEventListener('click', function(){ if(controller) controller.abort(); });
}

// ===== New chat button =====
if(!document.getElementById('newchat')){
  var newBtn = document.createElement('button');
  newBtn.id='newchat';
  newBtn.className='btn';
  newBtn.type='button';
  newBtn.textContent='New chat';
  document.querySelector('.composer').appendChild(newBtn);
  newBtn.addEventListener('click', async function(){
    if(sessionId){
      try{
        await fetch('/api/session/end',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ sessionId: sessionId })
        });
      }catch(_){}
    }
    sessionId=null;
    sessionStarted=false;
    setReady(false);
    elHistory.innerHTML = '<div class="row system"><div class="bubble">New session started.</div></div>';
    startSession();
  });
}

// NOTE: no auto-start. Session begins when the FAB is clicked.
