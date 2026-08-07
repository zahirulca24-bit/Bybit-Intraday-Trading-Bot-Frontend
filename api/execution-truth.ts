declare const process: { env: Record<string, string | undefined> };

type AnyRecord = Record<string, any>;
type RequestLike = any;
type ResponseLike = any;

const DEFAULT_BACKEND_URL = "https://bybit-intraday-backend-608992045433.asia-south1.run.app";
const BACKEND_URL = (process.env.BACKEND_API_URL || DEFAULT_BACKEND_URL).replace(/\/$/, "");
const ADMIN_TOKEN = (process.env.BACKEND_ADMIN_TOKEN || "").trim();
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
    reason: text(source?.reason || source?.error || status?.durableError, verified ? "PostgreSQL restart-safe persistence verified" : "Durable persistence not fully verified"),
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
    riskPct: numberValue(payload?.riskPct ?? payload?.riskPercent, 0) || null,
    marginMode: text(payload?.marginMode || payload?.nodeExecutionRequirements?.marginMode, "") || null,
    leverage: numberValue(payload?.leverage ?? payload?.nodeExecutionRequirements?.leverage, 0) || null,
    entryReference: numberValue(payload?.entryReference, 0) || null,
    technicalStopLoss: numberValue(payload?.technicalStopLoss, 0) || null,
    takeProfitReference: numberValue(payload?.takeProfitReference, 0) || null,
    qty: numberValue(payload?.qty, 0) || null,
    requiredInitialMarginUsdt: numberValue(payload?.requiredInitialMarginUsdt, 0) || null,
    updatedAt: row?.updatedAt || row?.updated_at || runtime?.updatedAt || null,
    management: runtime?.management || runtime?.tradeManagement || payload?.management || null,
  };
}

function stage(name: string, state: string, count: number | null, detail: string): AnyRecord {
  return { name, state, count, detail };
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (text(req?.method, "GET").toUpperCase() !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const [status, symbols, setups, execution, durableStatus] = await Promise.all([
      backendJson("/api/workers/status"),
      backendJson("/api/workers/symbols"),
      backendJson("/api/workers/setups"),
      backendJson("/api/workers/execution"),
      backendJson("/api/durable-state/status"),
    ]);

    const runtime = status?.runtime || {};
    const oneHour = rowsFrom(runtime?.hourlyWatchlist?.rows, symbols?.oneHourTop20, symbols?.top20, symbols?.activeSymbols, symbols?.rows);
    const classified = rowsFrom(runtime?.fifteenMinuteStrategyClassification?.rows, setups?.classified15m, setups?.classifications, setups?.rows);
    const confirmed = rowsFrom(runtime?.fiveMinuteEntryConfirmation?.rows, setups?.confirmed5m, setups?.confirmed, setups?.pendingHandoff, setups?.queue);

    const riskSnapshot = runtime?.authoritativeEntryRisk || execution?.risk || {};
    const riskRows = rowsFrom(riskSnapshot?.rows, execution?.riskRows, execution?.risk?.rows, execution?.riskApproved);
    const riskApproved = rowsFrom(riskSnapshot?.approvedRiskQueue, execution?.approvedRiskQueue, execution?.riskApprovedQueue);

    const sizingSnapshot = runtime?.positionSizingMargin || execution?.sizing || {};
    const sizingRows = rowsFrom(sizingSnapshot?.rows, execution?.sizingRows, execution?.sizing?.rows);
    const sizingApproved = rowsFrom(sizingSnapshot?.approvedSizingQueue, execution?.approvedSizingQueue);
    const sizingStatus = text(sizingSnapshot?.status, "").toLowerCase();

    const outboxSnapshot = runtime?.executionCommandOutbox || execution?.outbox || {};
    const outboxRows = rowsFrom(outboxSnapshot?.rows, execution?.executionCommands, execution?.commands, execution?.outbox?.rows, execution?.rows);
    const commands = outboxRows.map(normalizeCommand);
    const activeCommands = commands.filter((row) => !["CLOSED", "FAILED"].includes(row.state));
    const durable = normalizeDurable(status, execution, durableStatus);

    const riskDetail = riskRows.length
      ? `${riskRows.length} risk result(s); ${riskApproved.length} approved for sizing`
      : "Risk engine not reached";

    let sizingState = "NOT_REACHED";
    let sizingDetail = "Sizing engine not reached";
    if (sizingRows.length) {
      sizingState = sizingApproved.length ? "PASS" : "WAIT";
      sizingDetail = `${sizingRows.length} sizing result(s); ${sizingApproved.length} approved for outbox`;
    } else if (riskRows.length && riskApproved.length === 0) {
      sizingState = "WAIT";
      sizingDetail = "No risk-approved candidate; sizing correctly idle";
    } else if (riskApproved.length > 0 && ["error", "stale"].includes(sizingStatus)) {
      sizingState = "BLOCKED";
      sizingDetail = text(sizingSnapshot?.lastError, "Sizing snapshot is unavailable");
    } else if (riskApproved.length > 0) {
      sizingState = "RUNNING";
      sizingDetail = `${riskApproved.length} risk-approved candidate(s) awaiting sizing`;
    }

    let outboxState = "NOT_REACHED";
    let outboxDetail = "No sizing-approved candidate for execution command";
    if (commands.length) {
      outboxState = commands.length && durable.verified ? "PASS" : "BLOCKED";
      outboxDetail = durable.verified
        ? `${commands.length} durable command(s)`
        : "Commands exist but PostgreSQL durability is unverified";
    } else if (sizingApproved.length > 0) {
      outboxState = "RUNNING";
      outboxDetail = `${sizingApproved.length} sizing-approved candidate(s) awaiting durable command publish`;
    } else if (sizingRows.length) {
      outboxState = "WAIT";
      outboxDetail = "Sizing completed with no approved execution candidate";
    }

    const stages = [
      stage("1H Top20", oneHour.length ? "PASS" : "RUNNING", oneHour.length || null, oneHour.length ? `${oneHour.length} watchlist symbols` : "Waiting for closed 1H watchlist"),
      stage("15M Classification", classified.length ? "PASS" : oneHour.length ? "RUNNING" : "NOT_REACHED", classified.length || null, classified.length ? `${classified.length} classified setup(s)` : "Waiting for closed 15M classification"),
      stage("5M Confirmation", confirmed.length ? "PASS" : classified.length ? "WAIT" : "NOT_REACHED", confirmed.length || null, confirmed.length ? `${confirmed.length} confirmed candidate(s)` : "Waiting for closed 5M confirmation"),
      stage("Risk Verdict", riskRows.length ? "PASS" : confirmed.length ? "RUNNING" : "NOT_REACHED", riskRows.length || null, riskDetail),
      stage("Sizing Verdict", sizingState, sizingRows.length || null, sizingDetail),
      stage("PostgreSQL Outbox", outboxState, commands.length || null, outboxDetail),
      stage("Node Execution", commands.some((row) => ["ORDER_PENDING", "PARTIALLY_FILLED", "MANAGING", "CLOSING", "CLOSED"].includes(row.state)) ? "PASS" : activeCommands.length ? "RUNNING" : "NOT_REACHED", activeCommands.length || null, activeCommands.length ? `${activeCommands.length} active Node command(s)` : "No active Node command"),
      stage("Trade Management", commands.some((row) => ["MANAGING", "CLOSING", "CLOSED"].includes(row.state)) ? "PASS" : commands.some((row) => row.state === "PARTIALLY_FILLED") ? "RUNNING" : "NOT_REACHED", null, "TP1 40% at 1.5R → break-even → TP2 30% at 2R → 30% runner with 0.5R trail"),
    ];

    sendJson(res, 200, {
      ok: true,
      checkedAt: Date.now(),
      backend: "GOOGLE_CLOUD_RUN",
      bybitMode: "BYBIT_DEMO",
      connected: Boolean(status?.executionConnected ?? status?.ok ?? execution?.ok),
      durable,
      stages,
      commands,
      slots: [1, 2, 3].map((slotId) => ({ slotId, command: activeCommands.find((row) => row.slotId === slotId) || null })),
      policy: {
        marginMode: "ISOLATED",
        leverage: 5,
        gradeRisk: { "A+": 1, "A": 0.75, "B+": "REJECT" },
        maxOpenPositions: 3,
        perTradeMarginCapPct: 25,
        combinedMarginCapPct: 60,
        freeReservePct: 40,
        tp1: { r: 1.5, closePct: 40, next: "BREAK_EVEN" },
        tp2: { r: 2, closePct: 30 },
        runner: { remainingPct: 30, trailingR: 0.5 },
      },
    });
  } catch (error: any) {
    sendJson(res, 502, { error: text(error?.message, "Unable to load canonical execution truth") });
  }
}
