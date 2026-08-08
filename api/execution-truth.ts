declare const process: { env: Record<string, string | undefined> };

type AnyRecord = Record<string, any>;
type RequestLike = any;
type ResponseLike = any;

const DEFAULT_BACKEND_URL = "https://bybit-intraday-backend-608992045433.asia-south1.run.app";
const BACKEND_URL = (process.env.BACKEND_API_URL || DEFAULT_BACKEND_URL).replace(/\/$/, "");
const ADMIN_TOKEN = (process.env.BACKEND_ADMIN_TOKEN || "").trim();
const NODE_STATUS_URL = (process.env.NODE_EXECUTION_STATUS_URL || "").trim().replace(/\/$/, "");
const NODE_STATES = ["AVAILABLE", "RESERVED", "ORDER_PENDING", "PARTIALLY_FILLED", "MANAGING", "CLOSING", "CLOSED", "FAILED"];

function sendJson(res: ResponseLike, status: number, payload: any): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

function text(value: any, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function numberValue(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function rowsFrom(...values: any[]): AnyRecord[] {
  for (const value of values) {
    if (Array.isArray(value)) return value.filter((row) => row && typeof row === "object");
  }
  return [];
}

function candidateKey(row: AnyRecord): string {
  return text(row?.candidateKey || row?.candidate_key || row?.key, "");
}

function currentCycleRows(rows: AnyRecord[], upstreamRows: AnyRecord[]): AnyRecord[] {
  const keys = new Set(upstreamRows.map(candidateKey).filter(Boolean));
  if (!keys.size) return rows;
  const filtered = rows.filter((row) => keys.has(candidateKey(row)));
  return filtered.length ? filtered : rows;
}

async function backendJson(path: string): Promise<any> {
  if (!ADMIN_TOKEN) throw new Error("BACKEND_ADMIN_TOKEN is not configured");
  const response = await fetch(`${BACKEND_URL}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${ADMIN_TOKEN}` },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(text(body?.error || body?.message, `Backend request failed (${response.status})`));
  return body;
}

async function nodeStatusJson(): Promise<any | null> {
  if (!NODE_STATUS_URL) return null;
  try {
    const response = await fetch(`${NODE_STATUS_URL}/`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({}));
    return response.ok && body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

function normalizeDurable(status: AnyRecord, execution: AnyRecord, durableStatus: AnyRecord): AnyRecord {
  const source = durableStatus?.durableState || durableStatus?.status || durableStatus
    || execution?.claimStore || status?.execution?.claimStore || status?.claimStore || {};
  const backend = text(source?.backend || source?.store || source?.driver || status?.durableBackend, "UNKNOWN").toUpperCase();
  const degraded = Boolean(source?.degraded ?? status?.stateDegraded ?? status?.durableState === "DEGRADED");
  const restartSafe = Boolean(source?.restartSafe ?? status?.restartSafe);
  const verified = backend === "POSTGRESQL" && restartSafe && !degraded;
  return {
    backend,
    restartSafe,
    degraded,
    verified,
    migrationVersion: source?.migrationVersion ?? null,
    reason: text(source?.reason || source?.error || status?.durableError, verified ? "PostgreSQL restart-safe persistence verified" : "Durable persistence support is degraded or unverified"),
  };
}

function normalizeCommand(row: AnyRecord, index: number): AnyRecord {
  const payload = row?.payload || row?.commandPayload || row?.immutablePayload || {};
  const runtime = row?.runtimeState || row?.runtime_state || payload?.runtimeState || {};
  const stateCandidate = text(row?.state || row?.status || runtime?.state, "AVAILABLE").toUpperCase();
  const state = NODE_STATES.includes(stateCandidate) ? stateCandidate : "AVAILABLE";
  return {
    candidateKey: text(row?.candidateKey || row?.candidate_key || payload?.candidateKey, `command-${index}`),
    symbol: text(row?.symbol || payload?.symbol, "UNAVAILABLE"),
    side: text(row?.side || payload?.side, ""),
    state,
    slotId: numberValue(row?.slotId ?? row?.slot_id ?? runtime?.slotId, 0) || null,
    ownerId: text(row?.ownerId || row?.owner_id || runtime?.ownerId, "") || null,
    grade: text(payload?.grade || payload?.qualityGrade, "") || null,
    riskPct: numberValue(payload?.effectiveRiskPerTradePct ?? payload?.riskPerTradePct ?? payload?.gradeRiskPct, 0) || null,
    marginMode: text(payload?.marginMode, "") || null,
    leverage: numberValue(payload?.leverage, 0) || null,
    entryReference: numberValue(payload?.executableMarkPrice ?? payload?.entryReference, 0) || null,
    technicalStopLoss: numberValue(payload?.technicalStopLoss, 0) || null,
    takeProfitReference: numberValue(payload?.takeProfitReference, 0) || null,
    qty: payload?.qty ?? null,
    requiredInitialMarginUsdt: numberValue(payload?.requiredInitialMarginUsdt, 0) || null,
    nodeSizingStatus: text(payload?.nodeSizingStatus, "") || null,
    sizingAuthority: text(payload?.sizingAuthority, "") || null,
    updatedAt: row?.updatedAt || row?.updated_at || runtime?.updatedAt || null,
    management: runtime?.management || runtime?.tradeManagement || payload?.management || null,
  };
}

function normalizeSlot(slotId: number, raw: AnyRecord | null | undefined): AnyRecord {
  if (!raw) return { slotId, command: null };
  const state = text(raw?.state, "WAITING_FOR_CANDIDATE").toUpperCase();
  if (!raw?.candidateKey) return { slotId, command: null, state };
  return {
    slotId,
    state,
    command: {
      candidateKey: text(raw?.candidateKey),
      symbol: text(raw?.symbol, "UNAVAILABLE"),
      side: text(raw?.side),
      state,
      slotId,
      grade: raw?.grade ?? null,
      riskPct: raw?.riskPct ?? null,
      marginMode: raw?.marginMode ?? null,
      leverage: raw?.leverage ?? null,
      technicalStopLoss: raw?.technicalStopLoss ?? null,
      takeProfitReference: raw?.takeProfitReference ?? null,
      management: raw?.management ?? null,
    },
  };
}

function stage(name: string, state: string, count: number | null, detail: string, code?: string | null): AnyRecord {
  return { name, state, count, detail, code: code || null, supportOnly: false };
}

function support(name: string, state: string, detail: string, count: number | null = null): AnyRecord {
  return { name, state, count, detail, supportOnly: true, tradeRejectionAuthority: false };
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (text(req?.method, "GET").toUpperCase() !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const [status, symbols, setups, execution, durableStatus, nodeStatus] = await Promise.all([
      backendJson("/api/workers/status"),
      backendJson("/api/workers/symbols"),
      backendJson("/api/workers/setups"),
      backendJson("/api/workers/execution"),
      backendJson("/api/durable-state/status"),
      nodeStatusJson(),
    ]);

    const runtime = status?.runtime || {};
    const oneHour = rowsFrom(runtime?.hourlyWatchlist?.rows, symbols?.oneHourTop50, symbols?.top50, symbols?.activeSymbols, symbols?.rows, symbols?.oneHourTop20, symbols?.top20);
    const classified = rowsFrom(runtime?.fifteenMinuteStrategyClassification?.rows, setups?.classified15m, setups?.classifications, setups?.rows);
    const confirmed = rowsFrom(runtime?.fiveMinuteEntryConfirmation?.rows, setups?.confirmed5m, setups?.confirmed, setups?.pendingHandoff, setups?.queue);

    const riskSnapshot = runtime?.authoritativeEntryRisk || execution?.risk || {};
    const allRiskRows = rowsFrom(riskSnapshot?.rows, execution?.riskRows, execution?.risk?.rows, execution?.riskApproved);
    const allRiskApproved = rowsFrom(riskSnapshot?.approvedRiskQueue, execution?.approvedRiskQueue, execution?.riskApprovedQueue);
    const riskRows = currentCycleRows(allRiskRows, confirmed);
    const riskApproved = currentCycleRows(allRiskApproved, confirmed);
    const riskBlocked = riskRows.filter((row) => text(row?.riskStatus).toUpperCase() === "BLOCKED_RISK");

    const sizingSnapshot = runtime?.positionSizingMargin || execution?.sizing || {};
    const allSizingRows = rowsFrom(sizingSnapshot?.rows, execution?.sizingRows, execution?.sizing?.rows);
    const allSizingApproved = rowsFrom(sizingSnapshot?.approvedSizingQueue, execution?.approvedSizingQueue);
    const sizingRows = currentCycleRows(allSizingRows, riskApproved);
    const sizingApproved = currentCycleRows(allSizingApproved, riskApproved);
    const sizingWaiting = sizingRows.filter((row) => text(row?.positionSizingStatus).toUpperCase() === "SIZING_WAIT");
    const sizingStatus = text(sizingSnapshot?.status, "").toLowerCase();

    const outboxRoot = runtime?.executionCommandOutbox || execution?.outbox || {};
    const outbox = outboxRoot?.snapshot || outboxRoot;
    const nodeHandoff = outbox?.nodeHandoff || outboxRoot?.nodeHandoff || {};
    const postgresFromOutbox = outbox?.postgresSupport || outboxRoot?.postgresSupport || {};
    const outboxRows = rowsFrom(postgresFromOutbox?.rows, outbox?.rows, execution?.executionCommands, execution?.commands);
    const postgresCommands = outboxRows.filter((row) => NODE_STATES.includes(text(row?.state || row?.status).toUpperCase())).map(normalizeCommand);
    const durable = normalizeDurable(status, execution, durableStatus);

    const delivered = numberValue(nodeHandoff?.delivered);
    const retrying = numberValue(nodeHandoff?.retrying);
    const invalid = numberValue(nodeHandoff?.rejectedInvalid);
    const nodeSizing = nodeStatus?.nodeLiveSizing || {};
    const nodeExecution = nodeStatus?.nodeExecution || {};
    const nodeSlots = nodeStatus?.slots || {};
    const slots = [1, 2, 3].map((slotId) => normalizeSlot(slotId, nodeSlots?.[slotId] || nodeSlots?.[String(slotId)]));
    const nodeCommands = slots.map((slot) => slot.command).filter(Boolean);

    const entrySafetyState = riskRows.length ? (riskApproved.length ? "PASS" : riskBlocked.length ? "BLOCKED" : "RUNNING") : confirmed.length ? "RUNNING" : "NOT_REACHED";
    const handoffState = delivered > 0 ? "PASS" : retrying > 0 ? "WAIT" : invalid > 0 ? "BLOCKED" : riskApproved.length ? "RUNNING" : "NOT_REACHED";
    const handoffDetail = delivered > 0
      ? `${delivered} Risk-approved candidate(s) delivered directly to Node`
      : retrying > 0
        ? `${retrying} direct Node delivery attempt(s) retrying; Entry Safety approval is preserved`
        : invalid > 0
          ? `${invalid} invalid direct handoff candidate(s) rejected at Node intake`
          : riskApproved.length ? `${riskApproved.length} Entry-Safety-approved candidate(s) awaiting Node delivery` : "No Entry-Safety-approved candidate to deliver";

    const nodeSizingCode = text(nodeSizing?.code, delivered > 0 ? "WAITING_FOR_NODE_STATUS" : "WAITING_FOR_CANDIDATE").toUpperCase();
    const nodeSizingState = nodeSizingCode === "NODE_SIZING_READY" || text(nodeSizing?.status).toUpperCase() === "READY"
      ? "PASS"
      : delivered > 0
        ? "RUNNING"
        : "NOT_REACHED";
    const nodeSizingDetail = text(nodeSizing?.reason, delivered > 0
      ? "Candidate delivered; waiting for authoritative Node live sizing status"
      : "Waiting for a direct execution candidate");

    const nodeExecutionStateText = text(nodeExecution?.status, "WAITING_FOR_CANDIDATE").toUpperCase();
    const nodeExecutionReached = ["RESERVED", "ORDER_PENDING", "PARTIALLY_FILLED", "MANAGING", "CLOSING", "CLOSED", "FAILED"].includes(nodeExecutionStateText);
    const nodeExecutionState = nodeExecutionReached ? (["FAILED"].includes(nodeExecutionStateText) ? "BLOCKED" : "PASS") : nodeSizingState === "PASS" ? "RUNNING" : "NOT_REACHED";
    const managementReached = nodeCommands.some((row: AnyRecord) => ["MANAGING", "CLOSING", "CLOSED"].includes(text(row?.state).toUpperCase())) || ["MANAGING", "CLOSING", "CLOSED"].includes(nodeExecutionStateText);

    const stages = [
      stage("1H Top50", oneHour.length ? "PASS" : "RUNNING", oneHour.length || null, oneHour.length ? `${oneHour.length} current closed-1H watchlist symbols` : "Waiting for closed 1H Top50 watchlist"),
      stage("15M Classification", classified.length ? "PASS" : oneHour.length ? "RUNNING" : "NOT_REACHED", classified.length || null, classified.length ? `${classified.length} current watchlist rows classified` : "Waiting for closed 15M classification"),
      stage("5M Confirmation", confirmed.length ? "PASS" : classified.length ? "WAIT" : "NOT_REACHED", confirmed.length || null, confirmed.length ? `${confirmed.length} confirmed candidate(s)` : "Waiting for later fully closed 5M confirmation"),
      stage("Entry Safety", entrySafetyState, riskRows.length || null, riskRows.length ? `${riskApproved.length} approved; ${riskBlocked.length} blocked` : "Entry Safety not reached"),
      stage("Node Handoff", handoffState, delivered || retrying || invalid || null, handoffDetail, retrying ? "NODE_HANDOFF_RETRY" : delivered ? "NODE_HANDOFF_DELIVERED" : null),
      stage("Node Live Sizing", nodeSizingState, nodeSizing?.candidateKey ? 1 : null, nodeSizingDetail, nodeSizingCode),
      stage("Node Execution", nodeExecutionState, nodeExecutionReached ? 1 : null, nodeExecutionReached ? `${text(nodeExecution?.symbol, "Candidate")} ${text(nodeExecution?.side)} · ${nodeExecutionStateText}` : "Waiting for Node live sizing/execution", nodeExecutionStateText),
      stage("Trade Management", managementReached ? "PASS" : nodeExecutionReached ? "RUNNING" : "NOT_REACHED", null, "Node owns entry fill, protection, TP1/TP2, runner trailing, close, and reconciliation"),
    ];

    let pythonSizingState = "WAIT";
    let pythonSizingDetail = "Diagnostic sizing has not produced current-cycle evidence.";
    if (sizingApproved.length) {
      pythonSizingState = "PASS";
      pythonSizingDetail = `${sizingApproved.length} diagnostic sizing calculation(s) passed; Node live sizing remains authoritative.`;
    } else if (sizingWaiting.length || ["degraded", "error", "stale"].includes(sizingStatus)) {
      pythonSizingState = "DEGRADED";
      pythonSizingDetail = "Diagnostic sizing unavailable or waiting; Node live sizing remains authoritative.";
    } else if (riskApproved.length) {
      pythonSizingState = "WAIT";
      pythonSizingDetail = "Python sizing audit pending; direct Node execution eligibility is unchanged.";
    }

    const postgresStatusRaw = text(postgresFromOutbox?.status || nodeStatus?.postgresSupport?.status, durable.verified ? "PASS" : "DEGRADED").toUpperCase();
    const postgresState = ["PASS", "READY"].includes(postgresStatusRaw) ? "PASS" : postgresStatusRaw.includes("WAIT") ? "WAIT_RETRY" : "DEGRADED";
    const supportSystems = [
      support("Python Sizing Audit", pythonSizingState, pythonSizingDetail, sizingRows.length || null),
      support("PostgreSQL Support", postgresState, postgresState === "PASS" ? "Persistence/reconciliation support is healthy; execution eligibility does not depend on it." : "Persistence unavailable or retrying; execution eligibility unchanged.", postgresCommands.length || null),
      support("Journal/Persistence", durable.verified ? "PASS" : "DEGRADED", durable.reason),
    ];

    sendJson(res, 200, {
      ok: true,
      checkedAt: Date.now(),
      backend: "GOOGLE_CLOUD_RUN",
      bybitMode: "BYBIT_DEMO",
      connected: Boolean(status?.executionConnected ?? status?.ok),
      nodeConnected: Boolean(nodeStatus),
      durable,
      stages,
      supportSystems,
      commands: nodeCommands,
      postgresSupportCommands: postgresCommands,
      slots,
      entrySafety: { approved: riskApproved.length, blocked: riskBlocked.length },
      nodeHandoff: { delivered, retrying, rejectedInvalid: invalid, rows: rowsFrom(nodeHandoff?.rows) },
      nodeLiveSizing: {
        status: text(nodeSizing?.status, delivered > 0 ? "WAIT" : "WAITING_FOR_CANDIDATE"),
        code: nodeSizingCode,
        candidateKey: nodeSizing?.candidateKey ?? null,
        symbol: nodeSizing?.symbol ?? null,
        reason: nodeSizingDetail,
      },
      nodeExecution: {
        status: nodeExecutionStateText,
        candidateKey: nodeExecution?.candidateKey ?? null,
        symbol: nodeExecution?.symbol ?? null,
        side: nodeExecution?.side ?? null,
        slotId: nodeExecution?.slotId ?? null,
      },
      pythonSizingDiagnostic: { status: pythonSizingState, tradeRejectionAuthority: false },
      postgresSupport: { status: postgresState, tradeRejectionAuthority: false, supportOnly: true },
      policy: {
        marginMode: "ISOLATED",
        maximumLeverage: 10,
        leverage: 10,
        gradeRisk: { "A+": 1, "A": 1, "B+": "REJECT" },
        maxOpenPositions: 3,
        strategyEngines: 6,
        fixedPerTradeMarginCapEnabled: false,
        fixedCombinedMarginCapEnabled: false,
        fixedFreeReserveEnabled: false,
        riskOwnsTradeEligibility: true,
        sizingIsTradeRejectionGate: false,
        outboxIsTradeRejectionGate: false,
        journalIsTradeRejectionGate: false,
        pythonSizingRole: "SUPPORT_DIAGNOSTIC_ONLY",
        postgresRole: "SUPPORT_RECONCILIATION_ONLY",
        sizingMethod: "NODE_LIVE_CURRENT_EQUITY_1PCT_STRUCTURAL_STOP_BYBIT_RULES",
        canonicalExecutionPath: ["1H Top50", "15M Classification", "5M Confirmation", "Entry Safety", "Node Handoff", "Node Live Sizing", "Node Execution", "Trade Management"],
        tp1: { r: 1.5, closePct: 40, next: "BREAK_EVEN" },
        tp2: { r: 2, closePct: 30 },
        runner: { remainingPct: 30, trailingR: 0.5 },
      },
    });
  } catch (error: any) {
    sendJson(res, 502, { error: text(error?.message, "Unable to load canonical execution truth") });
  }
}
