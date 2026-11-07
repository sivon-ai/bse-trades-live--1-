import { num, clock } from '../format.js';

function describe(p) {
  if (!p) return { title: 'Loading trades', note: '' };
  if (p.status === 'running') {
    return {
      title: p.pages ? `Pulling from BSE, page ${Math.min(p.page + 1, p.pages)} of ${p.pages}` : 'Waiting for the first page from BSE',
      note: `${num.format(p.fetched)} trades received in this pull so far.`,
    };
  }
  if (p.status === 'error') {
    return {
      title: 'The last pull stopped early',
      note: `${p.error}. Trades received before the failure are kept. Use Pull now to try again.`,
    };
  }
  if (p.finishedAt) {
    return {
      title: `Last pull finished at ${clock.format(new Date(p.finishedAt))}`,
      note: p.added ? `${num.format(p.added)} new trades were added.` : 'No new trades since the previous pull.',
    };
  }
  return { title: 'No pull has run yet', note: 'Use Pull now to fetch trades from BSE.' };
}

export default function PullPanel({ pull }) {
  const { title, note } = describe(pull);
  const running = pull?.status === 'running';

  return (
    <section className="pull" aria-labelledby="pullTitle">
      <h2 id="pullTitle">{title}</h2>
      <p className="note">{note}</p>
      <div className="ribbon" role="img" aria-label="Pull progress, one segment per page">
        {Array.from({ length: pull?.pages || 0 }, (_, i) => (
          <i key={i} className={i < pull.page ? 'done' : running && i === pull.page ? 'now' : undefined} />
        ))}
      </div>
      {/* Screen readers hear changes of state, not every page. */}
      <p className="sr" aria-live="polite">{running ? 'Pull in progress' : title}</p>
    </section>
  );
}
