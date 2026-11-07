import { useState } from 'react';
import { useTrades } from './useTrades.js';
import PullPanel from './components/PullPanel.jsx';
import Summary from './components/Summary.jsx';
import TradeTable from './components/TradeTable.jsx';

const CONN_LABEL = { live: 'Live', retry: 'Reconnecting', connecting: 'Connecting' };

export default function App() {
  const { rows, pull, conn, fresh, pullNow } = useTrades();
  const [query, setQuery] = useState('');

  return (
    <main>
      <header>
        <div>
          <h1>BSE trade blotter</h1>
          <p className="sub">Trades pulled from the BSE API appear here as they arrive. No refresh needed.</p>
        </div>
        <div className="actions">
          <span className="conn" data-state={conn}><i /><b>{CONN_LABEL[conn]}</b></span>
          <button type="button" onClick={pullNow} disabled={!pull || pull.status === 'running'}>Pull now</button>
        </div>
      </header>

      <PullPanel pull={pull} />

      <section aria-label="Trades">
        <Summary rows={rows} query={query} onQuery={setQuery} />
        <TradeTable rows={rows} query={query} fresh={fresh} />
      </section>
    </main>
  );
}
