// Dashboard backend.
//   1. A background puller walks the BSE API page by page and saves each page as it lands.
//   2. GET /api/trades returns what is already saved, instantly.
//   3. WebSocket /ws pushes every newly saved batch to open dashboards (resumable with ?since=<seq>).
// No request ever waits for a pull, so no connection is held anywhere near the 30 s network limit.
const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const Store = require('./store');
const netguard = require('./netguard');

const PORT = +process.env.PORT || 3000;
const BSE_URL = process.env.BSE_URL || 'http://localhost:4001';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'trades.jsonl');
const NETWORK_KILL = +(process.env.NETWORK_KILL_SECONDS ?? 30);
const CALL_TIMEOUT_MS = 25_000;                                   // hard deadline per BSE call, under the 30 s limit
const HEARTBEAT_MS = 15_000;                                      // WebSocket ping, under the 30 s limit
const WS_MAX_AGE = +process.env.WS_MAX_AGE_SECONDS || 0;          // demo only: drop each socket after N s to show resume

const store = new Store(DATA_FILE);
const pull = { status: 'idle', page: 0, pages: 0, fetched: 0, added: 0, startedAt: null, finishedAt: null, error: null };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- Puller -------------------------------------------------------------------------------
async function fetchPage(cursor) {
  const url = new URL('/getTrades', BSE_URL);
  url.searchParams.set('limit', '50');
  if (cursor) url.searchParams.set('cursor', cursor);
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`BSE responded ${res.status}`);
      return await res.json();
    } catch (err) {
      const why = err.cause?.code || err.message;
      if (attempt === 5) throw new Error(`BSE unreachable after 5 attempts (${why})`);
      console.warn(`[app] page fetch failed (${why}), retrying from the same cursor (${attempt}/4)`);
      await sleep(Math.min(1000 * 2 ** attempt, 15_000));
    }
  }
}

async function runPull() {
  if (pull.status === 'running') return false;                    // one pull at a time
  Object.assign(pull, { status: 'running', page: 0, pages: 0, fetched: 0, added: 0, startedAt: Date.now(), finishedAt: null, error: null });
  console.log('[app] pull started');
  broadcast({ type: 'pull', pull });
  let cursor = null;
  try {
    do {                                                          // walks one pull; ends when BSE returns no nextCursor
      const data = await fetchPage(cursor);
      const added = store.add(data.trades);                       // save first ...
      if (!pull.pages) pull.pages = Math.ceil(data.total / Math.max(1, data.trades.length));
      pull.page++;
      pull.fetched += data.trades.length;
      pull.added += added.length;
      cursor = data.nextCursor;
      if (added.length) broadcast({ type: 'trades', trades: added, lastSeq: store.lastSeq });   // ... then push
      broadcast({ type: 'pull', pull });
    } while (cursor);
    pull.status = 'idle';
  } catch (err) {
    pull.status = 'error';
    pull.error = err.message;
  }
  pull.finishedAt = Date.now();
  console.log(`[app] pull ${pull.status === 'error' ? 'failed: ' + pull.error : 'finished'}, ${pull.added} new trades, ${store.lastSeq} stored`);
  broadcast({ type: 'pull', pull });
  return true;
}

// ---- HTTP + WebSocket ---------------------------------------------------------------------
const app = express();
app.use(netguard(NETWORK_KILL, 'network'));
app.use(express.static(path.join(__dirname, '..', 'dist')));            // the built React app (npm run build)

app.get('/api/trades', (req, res) => res.json({ trades: store.since(0), lastSeq: store.lastSeq, pull }));

app.post('/api/pull', (req, res) => {
  if (pull.status === 'running') return res.status(409).json({ error: 'a pull is already running' });
  runPull();                                                      // runs in the background, the response returns at once
  res.status(202).json({ started: true });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const send = (ws, msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
function broadcast(msg) { wss.clients.forEach(ws => send(ws, msg)); }

wss.on('connection', (ws, req) => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  const since = Number(new URL(req.url, 'http://x').searchParams.get('since')) || 0;
  console.log(`[app] dashboard connected (resume after seq ${since}), ${wss.clients.size} open`);
  if (since > store.lastSeq) return send(ws, { type: 'reset' });  // client is ahead of the store (data was wiped)
  send(ws, { type: 'pull', pull });
  const missed = store.since(since);                              // replay anything saved while the client was away
  if (missed.length) send(ws, { type: 'trades', trades: missed, lastSeq: store.lastSeq });
  if (WS_MAX_AGE) setTimeout(() => ws.terminate(), WS_MAX_AGE * 1000);
});

// Transport keep-alive, not data polling: a ping every 15 s keeps idle sockets alive through the 30 s rule.
setInterval(() => wss.clients.forEach(ws => {
  if (!ws.alive) return ws.terminate();
  ws.alive = false;
  ws.ping();
}), HEARTBEAT_MS).unref();

server.listen(PORT, () => {
  console.log(`[app] dashboard on http://localhost:${PORT}, ${store.lastSeq} trades already stored`);
  runPull();                                                      // one pull at boot; more via "Pull now"
});
