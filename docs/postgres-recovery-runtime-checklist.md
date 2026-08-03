# PostgreSQL Recovery Runtime Checklist

After the backend recovery patch deploys, verify that `/api/execution-truth` changes from degraded/unverified to PostgreSQL verified without a frontend redeploy. The current UI polls every five seconds and must continue to fail closed on stale or degraded evidence.
