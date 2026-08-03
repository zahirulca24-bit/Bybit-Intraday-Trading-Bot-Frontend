# Bybit Demo Intraday Trading Bot — Frontend

Production Vite + React control center for the Bybit Demo intraday trading backend.

> **Environment policy:** Bybit Demo only. This project does not support Bybit Testnet, paper trading, live-money trading, or browser-side trading logic.

## Current project update

**Date:** 04 August 2026  
**Day:** Tuesday  
**Status:** Backend runtime recovery verified; frontend truth-consolidation code merged; Vercel production deployment remains pending.

### Verified today

- Backend Cloud Run latest revision is receiving 100% traffic.
- PostgreSQL durable state is healthy: PostgreSQL backend, migration version 5, restart-safe, not degraded.
- Runtime leadership recovery is working and the scanner worker is running.
- Frontend PR #14 was merged to consolidate Settings health, staged pipeline truth, and lifecycle evidence.
- GitHub frontend verification checks passed.

### Remaining blocker

The merged frontend build has not reached the production Vercel site because Vercel fails during the deployment-output phase after a successful build. The current live site therefore still shows the previous UI state:

- Settings & Health displays `UNKNOWN / DEGRADED` instead of the healthy PostgreSQL truth.
- Daily Top100 remains `WAIT` in the authoritative pipeline.
- Legacy zero-value lifecycle rows can still appear as `PASS`.

Do not treat the current production UI as proof that PR #14 failed. Production acceptance is pending a successful Vercel deployment and a new live screenshot verification.

### Next session

1. Confirm the exact Vercel deployment failure reason or account deployment limit.
2. Redeploy the merged `main` branch after the Vercel restriction clears.
3. Verify live `/api/status`, `/api/execution-truth`, and `/api/orders/lifecycle` responses.
4. Recheck Settings & Health, Scanner pipeline, and Dashboard lifecycle cards.
5. Continue Step 12 only after the production frontend matches canonical backend truth.

## Production architecture

```text
Browser
  → Vercel React application
  → Same-origin Vercel BFF routes under /api/*
  → Google Cloud Run backend
  → Bybit V5 Demo API
  → PostgreSQL durable state
```

The browser never receives the Cloud Run administrator token, Bybit API credentials, or the PostgreSQL connection string.

## Canonical backend

```text
https://bybit-intraday-backend-608992045433.asia-south1.run.app
```

Configure the upstream as a **server-only Vercel environment variable**:

```text
BACKEND_API_URL=https://bybit-intraday-backend-608992045433.asia-south1.run.app
BACKEND_ADMIN_TOKEN=<exact Cloud Run ADMIN_TOKEN>
FRONTEND_CONTROL_TOKEN=<separate operator login secret>
```

`vercel.json` contains only build, function and rewrite configuration. It must not contain the Cloud Run URL or credentials because Vercel project configuration can participate in the browser build environment. `.env.example` is the deployment reference for the canonical server-side values.

Do not create any `VITE_*` variable containing backend URLs, administrator tokens, Bybit credentials or database values.

## Runtime truth rules

- The Cloud Run backend is authoritative for scanner policy, signals, risk, execution, durable state and lifecycle evidence.
- The frontend must not generate candles, balances, positions, signals or trading outcomes.
- Local development uses the same BFF route handlers as production; the previous synthetic Express server has been removed.
- Missing backend evidence is shown as unavailable, blocked or degraded rather than replaced with fabricated success data.
- Bot Start/Stop requires an authenticated operator session and is verified against the backend after mutation.
- Cloud Run standby responses are retried safely so the request can reach the elected execution leader.

## Position controls

Open positions are read directly from Bybit Demo through the Cloud Run backend.

Manual single-position Close and SL/TP modification are intentionally read-only in the frontend until the canonical backend exposes independently verified endpoints for those mutations. The frontend does not map those actions to the global kill switch.

## Scanner

The Scanner & Signals page displays the policy returned by the backend, including:

- shortlist and deep-scan size;
- spread and turnover thresholds;
- ATR and volume-ratio gates;
- gross/net risk-reward requirements;
- cost-to-risk limits;
- backend signal, reason, votes and pipeline status.

The frontend does not apply a second scanner policy or convert a backend-approved result into a different trading decision.

## Local development

Requirements:

- Node.js 20 or later
- npm
- server-side environment variables from `.env.example`

```bash
npm install
npm run dev
```

The development command starts a Vite middleware server with the real BFF handlers. It does not start a mock trading API.

## Verification

```bash
npm run typecheck
npm run test:auth
npm run test:scanner
npm run build
```

Full repository verification:

```bash
npm run verify
```

## Vercel deployment

Recommended project settings:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

After deployment, verify:

```text
GET  /api/status
GET  /api/account
GET  /api/positions
GET  /api/scanner
POST /api/auth/login
POST /api/bot/toggle
```

## Repository mapping

- Frontend: `zahirulca24-bit/Bybit-Intraday-Trading-Bot-Frontend`
- Backend: `zahirulca24-bit/Bybit-Intraday-Trading-Bot-Backend`
