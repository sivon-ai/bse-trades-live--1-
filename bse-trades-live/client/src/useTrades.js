import { useCallback, useEffect, useRef, useState } from 'react';

// All the live-data logic in one place:
//   1. GET /api/trades for an instant first paint (whatever is already saved, even mid-pull)
//   2. open a WebSocket and append each pushed batch
//   3. if the socket drops for any reason, reconnect with ?since=<last seq seen> and get only what was missed
export function useTrades() {
  const [rows, setRows] = useState([]);
  const [pull, setPull] = useState(null);
  const [conn, setConn] = useState('connecting');   // connecting | live | retry
  const [fresh, setFresh] = useState(null);         // { from, to } seq range of the latest live batch, for the flash
  const lastSeq = useRef(0);

  useEffect(() => {
    let ws, retryTimer, freshTimer, closed = false, retry = 0;

    const ingest = (trades, live) => {
      const next = trades.filter(t => t.seq > lastSeq.current);   // snapshot and replay can overlap
      if (!next.length) return;
      lastSeq.current = next[next.length - 1].seq;
      setRows(prev => prev.concat(next));
      if (live) {
        setFresh({ from: next[0].seq, to: lastSeq.current });
        clearTimeout(freshTimer);
        freshTimer = setTimeout(() => setFresh(null), 2500);
      }
    };

    const connect = () => {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?since=${lastSeq.current}`);
      ws.onopen = () => { retry = 0; setConn('live'); };
      ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.type === 'trades') ingest(m.trades, true);
        else if (m.type === 'pull') setPull(m.pull);
        else if (m.type === 'reset') location.reload();           // server data was wiped, start from a fresh snapshot
      };
      ws.onclose = () => {
        if (closed) return;
        setConn('retry');
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 10000));
      };
    };

    const boot = async () => {
      try {
        const snap = await (await fetch('/api/trades')).json();
        if (closed) return;
        ingest(snap.trades, false);
        setPull(snap.pull);
        connect();
      } catch {
        if (closed) return;
        setConn('retry');
        retryTimer = setTimeout(boot, Math.min(1000 * 2 ** retry++, 10000));
      }
    };

    boot();
    return () => { closed = true; clearTimeout(retryTimer); clearTimeout(freshTimer); ws?.close(); };
  }, []);

  const pullNow = useCallback(() => fetch('/api/pull', { method: 'POST' }), []);

  return { rows, pull, conn, fresh, pullNow };
}
