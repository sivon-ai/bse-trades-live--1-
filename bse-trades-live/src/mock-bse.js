// Mock BSE Exchange API.
//
//   GET /getTrades                        first page of trades + nextCursor
//   GET /getTrades?cursor=<c>&limit=<n>   next page
//   GET /getTrades?limit=all              everything in ONE response (the naive call)
//
// A full pull (walking every cursor) takes PULL_DURATION_SECONDS, 15 minutes by default.
// That time is spread across the pages, so no single HTTP request stays open for long.
// The naive limit=all call takes the whole pull time and gets cut off by the simulated network.
const express = require('express');
const netguard = require('./netguard');

const PORT = +process.env.BSE_PORT || 4001;
const PULL_SECONDS = +process.env.PULL_DURATION_SECONDS || 900;   // time for one full pull
const TRADE_COUNT = +process.env.TRADE_COUNT || 3000;             // seeded trades
const GROWTH = +(process.env.GROWTH_PER_PULL ?? 100);             // new trades that appear after each completed pull
const KILL_AFTER = +(process.env.NETWORK_KILL_SECONDS ?? 30);     // simulated network rule, 0 turns it off
const MAX_PAGE_SECONDS = 15;                                      // pages are sized so one call never exceeds this

const BASE_PRICE = { RELIANCE: 2900, TCS: 4100, HDFCBANK: 1650, INFY: 1850, ICICIBANK: 1250, SBIN: 820,
  BHARTIARTL: 1600, ITC: 470, LT: 3600, KOTAKBANK: 1750, AXISBANK: 1150, MARUTI: 12500, TITAN: 3400,
  SUNPHARMA: 1750, WIPRO: 560, ONGC: 270 };
const SYMBOLS = Object.keys(BASE_PRICE);
const CLIENTS = ['Zenith', 'Banyan', 'Kaveri', 'Meru', 'Indus', 'Orchid', 'Sagar', 'Vihaan']
  .flatMap(a => ['Capital', 'Securities', 'Wealth', 'Holdings'].map(b => `${a} ${b}`));

function rng(seed) {                                              // mulberry32: small seeded PRNG
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const START = Date.now() - TRADE_COUNT * 5000;
function trade(i) {                                               // deterministic: trade #i is always the same trade
  const r = rng(i + 1);
  const symbol = SYMBOLS[Math.floor(r() * SYMBOLS.length)];
  return {
    tradeId: `T${String(i + 1).padStart(8, '0')}`,
    client: CLIENTS[Math.floor(r() * CLIENTS.length)],
    symbol,
    quantity: 1 + Math.floor(r() * r() * 500),
    price: Math.round(BASE_PRICE[symbol] * (0.98 + r() * 0.04) * 20) / 20,   // 0.05 tick
    timestamp: new Date(START + i * 5000).toISOString(),
  };
}

let completedPulls = 0;                                           // every completed pull reveals GROWTH more trades
const sleep = ms => new Promise(r => setTimeout(r, ms));
const app = express();
app.use(netguard(KILL_AFTER, 'network'));

app.get('/getTrades', async (req, res) => {
  const bulk = req.query.limit === 'all';
  const [offset, total] = req.query.cursor
    ? String(req.query.cursor).split('.').map(Number)             // cursor = "<offset>.<total at pull start>"
    : [0, TRADE_COUNT + GROWTH * completedPulls];
  if (!(offset >= 0 && total > 0)) return res.status(400).json({ error: 'bad cursor' });

  const pagesNeeded = Math.max(1, Math.ceil(PULL_SECONDS / MAX_PAGE_SECONDS));
  const limit = bulk ? total : Math.min(+req.query.limit || 50, Math.ceil(total / pagesNeeded));
  const end = Math.min(offset + limit, total);
  const trades = Array.from({ length: end - offset }, (_, k) => trade(offset + k));

  const delay = PULL_SECONDS * 1000 * (trades.length / total);    // pages add up to the full pull time
  await sleep(delay);
  if (req.socket.destroyed) return;                               // the network already killed this call

  const nextCursor = end < total ? `${end}.${total}` : null;
  if (!nextCursor) res.on('finish', () => completedPulls++);
  console.log(`[bse] ${bulk ? 'bulk' : 'page'} offset=${offset} -> ${trades.length} trades after ${(delay / 1000).toFixed(1)}s`);
  res.json({ trades, nextCursor, total });
});

app.listen(PORT, () => console.log(
  `[bse] mock BSE API on :${PORT}, full pull ${PULL_SECONDS}s, ${TRADE_COUNT} trades, network kill ${KILL_AFTER || 'off'}s`));
