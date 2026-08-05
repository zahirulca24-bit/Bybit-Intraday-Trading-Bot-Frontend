# Deployment Architecture Lock

Locked on: 05 August 2026 (Asia/Dhaka)

## Canonical production topology

```text
Browser
  -> Google Cloud Run frontend/BFF
  -> Google Cloud Run Python API
  -> PostgreSQL durable state
  -> Google Cloud Run Node execution service
  -> Bybit V5 Demo API
```

## Authoritative deployment targets

- Frontend runtime: Google Cloud Run container built from the repository root `Dockerfile`.
- Frontend server: `cloud-run-server.ts` through `npm start`.
- Python API runtime: Google Cloud Run container built from backend `Dockerfile.cloudrun`.
- Node execution runtime: Google Cloud Run container built from backend `node_execution/Dockerfile`.
- Durable database: PostgreSQL shared by the Python and Node services.
- Exchange boundary: `https://api-demo.bybit.com` only.

## Prohibited production paths

- Vercel is not an authoritative production target.
- Render is not an authoritative production target.
- Browser-side backend credentials or trading logic are prohibited.
- `VITE_*` variables must not contain backend URLs, administrator tokens, Bybit credentials, or database credentials.

## Frontend server-only environment

```text
BACKEND_API_URL=<canonical Python Cloud Run URL>
BACKEND_ADMIN_TOKEN=<exact Python API ADMIN_TOKEN>
FRONTEND_OPERATOR_PASSWORD_SCRYPT=<scrypt encoded operator password>
FRONTEND_SESSION_SIGNING_SECRET=<independent random signing secret>
NODE_ENV=production
PORT=8080
```

## Deployment acceptance

A frontend revision is accepted only when:

1. The image is built from the root `Dockerfile`.
2. Cloud Run reports the intended revision at 100% traffic.
3. `GET /healthz` returns HTTP 200.
4. Same-origin BFF routes return canonical backend truth.
5. No protected credential is present in the browser bundle.
6. The deployed revision can be traced to an exact Git commit SHA.
