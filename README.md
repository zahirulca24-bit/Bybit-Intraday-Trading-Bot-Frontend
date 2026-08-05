# Bybit Demo Intraday Trading Bot — Frontend

Production Vite + React control center and same-origin BFF for the Bybit Demo intraday trading system.

> **Environment policy:** Bybit Demo only. Bybit Testnet, paper trading, live-money trading, browser-side credentials, and browser-side trading decisions are unsupported.

## Deployment architecture lock

Locked on **05 August 2026**:

```text
Browser
  → Google Cloud Run frontend/BFF
  → Google Cloud Run Python API
  → PostgreSQL durable state
  → Google Cloud Run Node execution service
  → Bybit V5 Demo API
```

The repository root `Dockerfile` is the only authoritative production build for this frontend. Vercel and Render are not production deployment targets. See `deployment/ARCHITECTURE.md` for the full lock and acceptance rules.

## Runtime truth rules

- The Cloud Run backend is authoritative for scanner policy, signals, risk, execution, durable state, and lifecycle evidence.
- The frontend must not generate candles, balances, positions, signals, or trading outcomes.
- Missing backend evidence is shown as unavailable, blocked, or degraded; fabricated success data is prohibited.
- Bot Start/Stop requires an authenticated operator session and backend verification after mutation.
- The browser never receives the backend administrator token, Bybit credentials, or database credentials.

## Canonical backend

```text
https://bybit-intraday-backend-608992045433.asia-south1.run.app
```

The upstream URL and credentials are server-only Cloud Run environment variables.

## Required frontend environment

```text
BACKEND_API_URL=https://bybit-intraday-backend-608992045433.asia-south1.run.app
BACKEND_ADMIN_TOKEN=<exact Cloud Run ADMIN_TOKEN>
FRONTEND_OPERATOR_PASSWORD_SCRYPT=<scrypt encoded operator password>
FRONTEND_SESSION_SIGNING_SECRET=<independent random signing secret>
NODE_ENV=production
PORT=8080
```

Do not create `VITE_*` variables containing backend URLs, administrator tokens, Bybit credentials, or database values.

## Position controls

Open positions are read from Bybit Demo through the canonical backend. Manual single-position Close and SL/TP mutation remain unavailable until independently verified backend endpoints exist.

## Local development

Requirements:

- Node.js 20 or later
- npm
- server-side environment variables from `.env.example`

```bash
npm install
npm run dev
```

Local development uses the same BFF handlers as production and does not start a mock trading API.

## Verification

```bash
npm run verify
```

The verification suite includes type checks, authentication, scanner integrity, lifecycle truth, execution truth, Cloud Run contract, build, and E2E checks.

## Cloud Run deployment

Build and run locally:

```bash
docker build -t bybit-frontend:local .
docker run --rm -p 8080:8080 --env-file .env bybit-frontend:local
```

After deployment verify:

```text
GET  /healthz
GET  /api/status
GET  /api/account
GET  /api/positions
GET  /api/scanner
GET  /api/execution-truth
GET  /api/orders/lifecycle
POST /api/auth/login
POST /api/bot/toggle
```

## Repository mapping

- Frontend: `zahirulca24-bit/Bybit-Intraday-Trading-Bot-Frontend`
- Backend: `zahirulca24-bit/Bybit-Intraday-Trading-Bot-Backend`
