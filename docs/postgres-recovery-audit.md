# PostgreSQL Recovery Frontend Audit

The current frontend already polls `/api/execution-truth` every five seconds, rejects stale snapshots after twenty seconds, and fails closed when durable PostgreSQL evidence is unverified or degraded. No frontend behavior change is required for the backend daily-universe store rebind fix.
