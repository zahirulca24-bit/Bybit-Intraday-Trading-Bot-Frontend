# Top50 direct Node execution UI

The dashboard represents the canonical automatic execution path as:

`1H Top50 -> 15M Classification -> 5M Confirmation -> Entry Safety -> Node Handoff -> Node Live Sizing -> Node Execution -> Trade Management`

The current pipeline point is derived only from those canonical stages.

## Support / diagnostics

The following are rendered separately and never make the canonical pipeline show WAIT by themselves:

- Python Sizing Audit
- PostgreSQL Support
- Journal/Persistence

A support subsystem may show `DEGRADED`, `WAIT`, or `WAIT_RETRY` while Entry Safety approval and direct Node execution eligibility remain unchanged.

## Node truth

When `NODE_EXECUTION_STATUS_URL` is configured on the frontend server, `/api/execution-truth` also reads the Node health/status surface for live sizing codes and the three execution slots. It never treats a PostgreSQL `AVAILABLE` row as proof that Node received or owns a candidate.

Node Live Sizing can expose codes such as `WAITING_FOR_CANDIDATE`, `NODE_SIZING_READY`, `TECHNICAL_PLAN_WAIT`, `WALLET_DATA_WAIT`, `INSTRUMENT_RULE_WAIT`, `INSUFFICIENT_MARGIN`, `CANDIDATE_STALE`, `DUPLICATE_SYMBOL`, and `MAX_ACTIVE_TRADES`.

`NODE_EXECUTION_STATUS_URL` contains no handoff secret. `NODE_HANDOFF_TOKEN` remains backend/Node-only and must never be exposed to browser code.

The UI continues to report all six active strategy engines and the locked execution policy: A+/A at a maximum planned 1% stop risk, B+ non-executable, maximum 10x isolated leverage, maximum three active trades, and the existing Node TP1/TP2/runner lifecycle.
