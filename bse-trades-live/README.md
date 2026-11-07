# BSE trades, live

A mock BSE Exchange API whose full pull takes 15 minutes, and a React trades dashboard (Node.js backend) that opens instantly, shows what has been pulled so far, and updates itself as new trades arrive. It works under the rule that the network kills any HTTP connection held open for more than 30 seconds.

Design write-up with diagrams: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Run it

You need Node.js 18 or newer. Stack: React (Vite) on the front, Node.js with Express and `ws` on the back.

```bash
npm install
npm run demo      # 60-second pull, good for trying things out
# or
npm run dev       # real timing: a full pull takes 15 minutes
```

Open http://localhost:5173 (the React dev server, which forwards `/api` and `/ws` to the Node server on port 3000). The dashboard loads immediately. Trades fill in page by page while the pull runs, with no refresh. The strip at the top shows one segment per page.

On Windows PowerShell, set a variable like this: `$env:PULL_DURATION_SECONDS=120; npm run demo`. If PowerShell blocks `npm`, use `npm.cmd` instead.

Production-style run, with Node serving the built React app on one port:

```bash
npm run build
npm run mock      # terminal 1
npm start         # terminal 2, then open http://localhost:3000
```

### Things worth trying

| Try this | What you should see |
| --- | --- |
| Open the dashboard while a pull is running | It paints at once with the trades already saved, then keeps filling in. |
| Click **Pull now** after a pull finishes | 100 new trades arrive and flash in. The mock reveals 100 more trades after each completed pull. |
| Open the browser's Network tab | One WebSocket and no repeating requests. |
| `curl -m 40 "http://localhost:4001/getTrades?limit=all"` | The one-shot full pull is cut off after 30 seconds. This is why pulls are paged. |
| `WS_MAX_AGE_SECONDS=10 npm run demo` | The server drops every dashboard socket every 10 seconds. The badge flips to Reconnecting and back, and no trade is lost or duplicated. |
| Stop and restart `npm run demo` | Saved trades show up instantly, and the new pull adds only trades it has not seen. |

Run the automated check with `npm test`. It takes about 15 seconds and covers partial data mid-pull, push in batches, resume after a dropped connection, and the one-shot call being killed.

## What is in here

```
src/mock-bse.js    Mock BSE API: GET /getTrades (seeded, slow by design)
src/server.js      Background puller, REST snapshot, WebSocket push
src/store.js       Trade store: de-duplicated, sequence-numbered, saved to data/trades.jsonl
src/netguard.js    Simulates the network's 30-second rule
client/            React dashboard (Vite)
  src/useTrades.js   snapshot, WebSocket, reconnect and resume
  src/components/   PullPanel, Summary, TradeTable
scripts/           dev launcher and smoke test
docs/              architecture note and video script
```

## How the requirements are met

| Requirement | How |
| --- | --- |
| `GET /getTrades` with a few thousand seeded trades | 3,000 trades (trade ID, client, symbol, quantity, price, timestamp), generated from a fixed seed so they are identical on every run. |
| Configurable 15-minute pull | `PULL_DURATION_SECONDS`, default 900. The delay is spread across pages, so the whole walk takes 15 minutes but no single call does. |
| Network kills connections over 30 s | The mock and the app both enforce it (`NETWORK_KILL_SECONDS=30`). Each BSE call takes about 15 s and has a 25 s client deadline. |
| Dashboard opens instantly, even mid-pull | `GET /api/trades` returns what is already saved. Each page is saved as soon as it lands. |
| New trades appear without refresh, polling or a scheduler | The server pushes each saved batch over a WebSocket. The browser sends no periodic requests, and no timer starts pulls. |

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PULL_DURATION_SECONDS` | 900 | Time for one full pull (mock) |
| `TRADE_COUNT` | 3000 | Seeded trades (mock) |
| `GROWTH_PER_PULL` | 100 | New trades revealed after each completed pull (mock) |
| `NETWORK_KILL_SECONDS` | 30 | Kill any HTTP request open longer than this, `0` to disable |
| `BSE_PORT` / `PORT` | 4001 / 3000 | Mock API and dashboard ports |
| `BSE_URL` | http://localhost:4001 | Where the app pulls from |
| `WS_MAX_AGE_SECONDS` | off | Demo only: drop each WebSocket after this many seconds |
| `DATA_FILE` | data/trades.jsonl | Where saved trades live. Delete it to start clean. |

## API

Mock BSE, port 4001

- `GET /getTrades?cursor=<c>&limit=<n>` returns `{ trades, nextCursor, total }`. `nextCursor` is `null` on the last page.
- `GET /getTrades?limit=all` returns everything in one response after the full pull time. It exists to show why that approach fails.

Dashboard server, port 3000

- `GET /api/trades` returns `{ trades, lastSeq, pull }`.
- `POST /api/pull` starts a pull in the background and answers `202` at once, or `409` if one is already running.
- `WS /ws?since=<seq>` replays anything saved after `seq`, then pushes `trades` and `pull` messages live.

## Submitting

```bash
git init && git add . && git commit -m "BSE trades dashboard"
```

Push to your own remote, add the architecture note and video link to the email, and send it to the address in the assessment.
