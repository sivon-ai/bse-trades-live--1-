import { useMemo } from 'react';
import { num, inr, clock } from '../format.js';

const MAX_ROWS = 200;   // keep the DOM small, the full set stays in memory for the counts and filter

export default function TradeTable({ rows, query, fresh }) {
  const q = query.trim().toLowerCase();
  const hits = useMemo(
    () => (q ? rows.filter(t => `${t.tradeId} ${t.client} ${t.symbol}`.toLowerCase().includes(q)) : rows),
    [rows, q],
  );
  const view = useMemo(() => hits.slice(-MAX_ROWS).reverse(), [hits]);

  return (
    <>
      <div className="tablewrap">
        <table>
          <caption className="sr">Most recent trades first</caption>
          <thead>
            <tr>
              <th>Trade ID</th><th>Client</th><th>Symbol</th>
              <th className="n">Quantity</th><th className="n">Price</th><th className="n">Value</th><th>Time</th>
            </tr>
          </thead>
          <tbody>
            {view.length ? view.map(t => (
              <tr key={t.seq} className={fresh && t.seq >= fresh.from && t.seq <= fresh.to ? 'fresh' : undefined}>
                <td>{t.tradeId}</td>
                <td>{t.client}</td>
                <td>{t.symbol}</td>
                <td className="n">{num.format(t.quantity)}</td>
                <td className="n">{t.price.toFixed(2)}</td>
                <td className="n">{inr.format(t.quantity * t.price)}</td>
                <td>{clock.format(new Date(t.timestamp))}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7} className="empty">
                  {rows.length ? 'No trades match this filter.' : 'No trades yet. The first page from BSE will appear here on its own.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hits.length > MAX_ROWS && (
        <p className="note">Showing the latest {MAX_ROWS} of {num.format(hits.length)} matching trades.</p>
      )}
    </>
  );
}
