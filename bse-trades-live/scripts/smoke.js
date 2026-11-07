// End-to-end check with a short pull:
//   - the snapshot shows partial data while a pull is still running
//   - every trade is pushed over the WebSocket, in several batches
//   - a second pull pushes only the new trades
//   - a client that reconnects with ?since=N gets exactly what it missed
//   - the naive one-shot call is cut off by the simulated 30 s network rule
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const assert = require('assert');
const { WebSocket } = require('ws');

const root = path.join(__dirname, '..');
const env = {
  ...process.env, BSE_PORT: '4101', PORT: '4100', BSE_URL: 'http://localhost:4101',
  DATA_FILE: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bse-')), 'trades.jsonl'),
  PULL_DURATION_SECONDS: '6', TRADE_COUNT: '300', GROWTH_PER_PULL: '100',
  NETWORK_KILL_SECONDS: '3',                                      // stands in for the 30 s rule, scaled down
};
const kids = ['mock-bse.js', 'server.js'].map(f => spawn(process.execPath, [path.join(root, 'src', f)], { env, stdio: 'ignore' }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = async p => (await fetch('http://localhost:4100' + p)).json();

// Collect WebSocket messages until done(msgs) is true.
function listen(since, done) {
  return new Promise((resolve, reject) => {
    const msgs = [];
    const ws = new WebSocket(`ws://localhost:4100/ws?since=${since}`);
    const timer = setTimeout(() => reject(new Error('timed out waiting for WebSocket messages')), 30000);
    ws.on('message', d => {
      msgs.push(JSON.parse(d));
      if (done(msgs)) { clearTimeout(timer); ws.close(); resolve(msgs); }
    });
    ws.on('error', reject);
  });
}
const finishedAfter = t0 => m => m.some(x => x.type === 'pull' && x.pull.status === 'idle' && x.pull.finishedAt && x.pull.startedAt >= t0);
const pushed = msgs => msgs.filter(m => m.type === 'trades');

(async () => {
  try {
    await sleep(1500);                                            // let both servers boot

    const first = listen(0, finishedAfter(0));                    // connect while the first pull is running
    await sleep(2500);
    const mid = await api('/api/trades');
    assert(mid.trades.length > 0 && mid.trades.length < 300, `snapshot mid-pull should be partial, got ${mid.trades.length}`);
    assert.equal(mid.pull.status, 'running');
    console.log(`ok  snapshot during a pull shows ${mid.trades.length} of 300 trades`);

    const msgs = await first;
    assert.equal(pushed(msgs).flatMap(m => m.trades).length, 300);
    assert(pushed(msgs).length > 1, 'trades should arrive in several pushes');
    console.log(`ok  all 300 trades pushed over the WebSocket in ${pushed(msgs).length} batches`);

    const t0 = Date.now();
    const second = listen(300, finishedAfter(t0));
    await sleep(300);
    const r = await fetch('http://localhost:4100/api/pull', { method: 'POST' });
    assert.equal(r.status, 202);
    const more = pushed(await second).flatMap(m => m.trades);
    assert.equal(more.length, 100);
    assert.equal(more[0].seq, 301);
    console.log('ok  second pull pushed only the 100 new trades');

    const replay = await listen(250, m => m.some(x => x.type === 'trades'));
    const missed = replay.find(m => m.type === 'trades').trades;
    assert.equal(missed[0].seq, 251);
    assert.equal(missed.length, 150);
    console.log('ok  reconnecting with since=250 replays exactly the 150 missed trades');

    await assert.rejects(fetch('http://localhost:4101/getTrades?limit=all'));
    console.log('ok  one-shot full pull is killed by the network rule, paged pulls are not');

    console.log('all checks passed');
    kids.forEach(k => k.kill());
    process.exit(0);
  } catch (err) {
    console.error('FAILED:', err.message);
    kids.forEach(k => k.kill());
    process.exit(1);
  }
})();
