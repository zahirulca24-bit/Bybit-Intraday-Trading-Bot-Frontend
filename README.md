# Bybit Demo Intraday Trading Bot — Frontend

Production Vite + React control center for the Bybit Demo intraday trading backend.

> **Environment policy:** Bybit Demo only. This project does not support Bybit Testnet, paper trading, or live-money trading.

## Live application

- Frontend: https://bybit-intraday-trading-bot-frontend.vercel.app
- Backend: https://bybit-intraday-trading-bot.onrender.com

## Current production status

Last verified: **29 July 2026 (Bangladesh Time)**

| Area | Status |
|---|---|
| Vercel frontend | Production deployed |
| Render backend connection | Connected |
| Bot Start/Stop control | Working |
| Durable state | PostgreSQL / persistent |
| Scanner and signals | Connected to live backend data |
| Active trades | Connected to Bybit Demo positions |
| Journal | Connected to durable backend state |
| Strategy Analytics | Live Bybit Demo closed-PnL analytics |
| Historical Replay | Pending backend replay API |

## Architecture

```text
Browser
  → Vercel React application
  → Same-origin Vercel BFF routes under /api/*
  → Render FastAPI backend
  → Bybit V5 Demo API
  → PostgreSQL durable state
```

The browser never receives the backend admin token or Bybit API credentials. Sensitive credentials remain in server-side environment variables.

## Implemented modules

### Dashboard

- Bybit Demo account equity and available balance
- Floating P&L and open-position count
- Live market chart and symbol selection
- Active position summary
- Order lifecycle and runtime-log panels
- Backend, scan, latency, engine, and persistence status

### Scanner & Signals

- Worker-selected Bybit Demo universe
- 1H trend, active-universe, 15M setup, queue, risk, submit, fill, and protection stages
- Liquidity, spread, turnover, volatility, signal, and execution-readiness evidence
- Truthful WAIT, PASS, BLOCKED, ERROR, and DEGRADED states

### Active Trades

- Current Bybit Demo positions
- Position side, size, entry, mark price, value, leverage, floating P&L, SL, and TP
- Protected close and SL/TP actions through authenticated backend routes
- Execution activity log

### Journal

- Durable backend journal events
- Category and event-level filtering
- Persistent-state warning when the backend reports degraded storage

### Strategy Analytics

Strategy Analytics uses only verified Bybit Demo closed-PnL records. No mock trades or fabricated strategy attribution are generated.

Current analytics include:

- Total trades, wins, losses, and win rate
- Net P&L, gross profit, and gross loss
- Profit factor and expectancy
- Average win, average loss, and payoff ratio
- Trade-level non-annualized P&L Sharpe
- Best and worst trade
- Consecutive win/loss streaks
- Maximum and current drawdown
- Cumulative P&L and drawdown chart
- Symbol performance
- LONG versus SHORT performance
- Recent closed trades

The current exchange query window is the latest **7 days**, with a maximum configured sample of **200 closed trades**. Legacy exchange rows without stored strategy identity are marked as **UNATTRIBUTED** rather than assigned fake strategy names.

### Risk & Controls

- Backend-supported risk parameters
- Maximum open positions and trade limits
- Daily-loss, cooldown, stop-loss, and take-profit controls
- Breakeven, partial take-profit, and trailing-stop configuration views
- Backend validation errors are surfaced instead of silently accepted

### Settings & Health

- Backend connectivity and API latency
- Bot engine state
- Router mode and scan intervals
- Authentication state
- PostgreSQL backend identity
- Persistent path configuration
- Degraded-state status
- Restart-safety status
- Startup reconciliation and execution readiness

## Backend API dependencies

The frontend depends on authenticated backend routes, including:

```text
GET  /api/bot/status
POST /api/bot/start
POST /api/bot/stop
GET  /api/workers/execution
GET  /api/analytics/summary
GET  /api/analytics/winrate-breakdown
GET  /api/analytics/drawdown-curve
```

Additional scanner, positions, journal, market-data, risk, and execution routes are proxied through the Vercel BFF layer.

## Environment variables

Copy `.env.example` for local reference.

### Browser build

For production, keep browser requests same-origin. Do not expose secrets through `VITE_*` variables.

Optional local direct-backend configuration:

```bash
VITE_API_BASE_URL=https://bybit-intraday-trading-bot.onrender.com
```

### Vercel server-side variables

```bash
BACKEND_API_URL=https://bybit-intraday-trading-bot.onrender.com
BACKEND_ADMIN_TOKEN=<same admin token configured in Render>
```

Never prefix the admin token with `VITE_`.

### Credentials that belong only in Render

```text
BYBIT_API_KEY
BYBIT_API_SECRET
DATABASE_URL
ADMIN_TOKEN
```

Do not place Bybit credentials or the PostgreSQL connection string in this frontend repository or browser environment.

## Local development

Requirements:

- Node.js 20 or later
- npm

Install and start:

```bash
npm install
npm run dev
```

Default local Vite URL:

```text
http://localhost:5173
```

## Verification

Run before merging frontend changes:

```bash
npm run typecheck
npm run build
```

The repository includes a GitHub Actions workflow for strict TypeScript verification and production build validation.

## Vercel deployment

Recommended project settings:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

`vercel.json` configures the Vite build, SPA fallback, and serverless BFF routes.

Production deployment is triggered automatically when an approved pull request is merged into `main`.

## Operational safety

- The frontend does not contain trading strategy logic.
- The backend remains authoritative for risk, execution, persistence, reconciliation, and order verification.
- Missing backend evidence is displayed as unavailable or degraded; it is not replaced with fake success data.
- Automatic execution must remain blocked when durable state or backend execution readiness is unavailable.
- Start/Stop controls use the backend's canonical risk and runtime contract.

## Known limitations

- Historical Replay remains unavailable until the backend replay/session endpoints are implemented.
- Strategy attribution is unavailable for legacy closed-PnL rows that were not originally persisted with strategy identity.
- Strategy Analytics currently uses Bybit's latest 7-day closed-PnL window.
- The production bundle currently emits a non-blocking warning for a JavaScript chunk larger than 500 kB; code splitting remains an optimization task.

## Repository mapping

- Frontend/UI: `zahirulartisan-ui/Bybit_Intraday_trading_bot_frontend`
- Backend/engine/API: `zahirulartisan-ui/Bybit-Intraday-Trading-Bot`

Do not mix backend trading logic into this frontend repository.