import { useMemo } from 'react';
import { num, money } from '../format.js';

export default function Summary({ rows, query, onQuery }) {
  const stats = useMemo(() => {
    let value = 0;
    const clients = new Set(), symbols = new Set();
    for (const t of rows) {
      value += t.quantity * t.price;
      clients.add(t.client);
      symbols.add(t.symbol);
    }
    return { value, clients: clients.size, symbols: symbols.size };
  }, [rows]);

  return (
    <div className="summary">
      <div><b>{num.format(rows.length)}</b> trades</div>
      <div><b>{money(stats.value)}</b> traded</div>
      <div><b>{stats.clients}</b> clients</div>
      <div><b>{stats.symbols}</b> symbols</div>
      <input
        type="search"
        value={query}
        onChange={e => onQuery(e.target.value)}
        placeholder="Filter by trade ID, client or symbol"
        aria-label="Filter trades"
      />
    </div>
  );
}
