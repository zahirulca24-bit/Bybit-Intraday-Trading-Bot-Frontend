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
    riskPct: numberValue(payload?.effectiveRiskPerTradePct ?? payload?.gradeRiskPct ?? payload?.riskPct ?? payload?.riskPercent, 0) || null,
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
    const allRiskRows = rowsFrom(riskSnapshot?.rows, execution?.riskRows, execution?.risk?.rows, execution?.riskApproved);
    const allRiskApproved = rowsFrom(riskSnapshot?.approvedRiskQueue, execution?.approvedRiskQueue, execution?.riskApprovedQueue);
    const riskRows = currentCycleRows(allRiskRows, confirmed);
    const riskApproved = currentCycleRows(allRiskApproved, confirmed);

    const sizingSnapshot = runtime?.positionSizingMargin || execution?.sizing || {};
    const allSizingRows = rowsFrom(sizingSnapshot?.rows, execution?.sizingRows, execution?.sizing?.rows);
    const allSizingApproved = rowsFrom(sizingSnapshot?.approvedSizingQueue, execution?.approvedSizingQueue);
    const sizingRows = currentCycleRows(allSizingRows, riskApproved);
    const sizingApproved = currentCycleRows(allSizingApproved, riskApproved);
    const sizingStatus = text(sizingSnapshot?.status, "").toLowerCase();
    const sizingWaiting = sizingRows.filter((row) => text(row?.positionSizingStatus).toUpperCase() === "SIZING_WAIT");

    const outboxSnapshot = runtime?.executionCommandOutbox || execution?.outbox || {};
    const outboxRows = rowsFrom(outboxSnapshot?.rows, execution?.executionCommands, execution?.commands, execution?.outbox?.rows, execution?.rows);
    const nodeCommandRows = outboxRows.filter((row) => NODE_STATES.includes(text(row?.state || row?.status).toUpperCase()));
    const supportWaitRows = outboxRows.filter((row) => text(row?.state || row?.status).toUpperCase() === "WAIT_RETRY");
    const commands = nodeCommandRows.map(normalizeCommand);
    const activeCommands = commands.filter((row) => !["CLOSED", "FAILED"].includes(row.state));
    const durable = normalizeDurable(status, execution, durableStatus);

    const riskDetail = riskRows.length
      ? `${riskRows.length} current-cycle risk result(s); ${riskApproved.length} risk-approved trade(s)`
      : "Risk engine not reached";

    let sizingState = "NOT_REACHED";
    let sizingDetail = "Sizing calculator not reached";
    if (sizingRows.length) {
      sizingState = sizingApproved.length ? "PASS" : "WAIT";
      sizingDetail = sizingApproved.length
        ? `${sizingRows.length} calculation(s); ${sizingApproved.length} ready for execution`
        : `${sizingRows.length} calculation(s); ${sizingWaiting.length || sizingRows.length} waiting for executable order values — no trade rejection`;
    } else if (riskRows.length && riskApproved.length === 0) {
      sizingState = "WAIT";
      sizingDetail = "No Risk-approved trade; sizing correctly idle";
    } else if (riskApproved.length > 0 && ["error", "stale"].includes(sizingStatus)) {
      sizingState = "WAIT";
      sizingDetail = `${text(sizingSnapshot?.lastError, "Sizing calculator temporarily unavailable")} — Risk eligibility unchanged`;
    } else if (riskApproved.length > 0) {
      sizingState = "RUNNING";
      sizingDetail = `${riskApproved.length} Risk-approved trade(s) awaiting quantity calculation`;
    }

    let outboxState = "NOT_REACHED";
    let outboxDetail = "SQL/Outbox support not reached";
    if (commands.length) {
      outboxState = durable.verified ? "PASS" : "WAIT";
      outboxDetail = durable.verified
        ? `${commands.length} execution command(s) persisted; SQL is support infrastructure only`
        : `${commands.length} command(s); SQL degraded/unverified — support retry only, trade eligibility unchanged`;
    } else if (supportWaitRows.length) {
      outboxState = "WAIT";
      outboxDetail = `${supportWaitRows.length} SQL support operation(s) waiting/retrying — not a trade rejection`;
    } else if (sizingApproved.length > 0) {
      outboxState = "RUNNING";
      outboxDetail = `${sizingApproved.length} execution-ready trade(s); SQL support handoff pending`;
    } else if (sizingRows.length) {
      outboxState = "WAIT";
      outboxDetail = "Sizing calculator is waiting; SQL/Outbox has no trade-rejection authority";
    }

    const stages = [
      stage("1H Top20", oneHour.length ? "PASS" : "RUNNING", oneHour.length || null, oneHour.length ? `${oneHour.length} watchlist symbols` : "Waiting for closed 1H watchlist"),
      stage("15M Classification", classified.length ? "PASS" : oneHour.length ? "RUNNING" : "NOT_REACHED", classified.length || null, classified.length ? `${classified.length} classified setup(s)` : "Waiting for closed 15M classification"),
      stage("5M Confirmation", confirmed.length ? "PASS" : classified.length ? "WAIT" : "NOT_REACHED", confirmed.length || null, confirmed.length ? `${confirmed.length} confirmed candidate(s)` : "Waiting for closed 5M confirmation"),
      stage("Risk Verdict", riskRows.length ? "PASS" : confirmed.length ? "RUNNING" : "NOT_REACHED", riskRows.length || null, riskDetail),
      stage("Sizing Calculator", sizingState, sizingRows.length || null, sizingDetail),
      stage("PostgreSQL Support", outboxState, commands.length || supportWaitRows.length || null, outboxDetail),
      stage("Node Execution", commands.some((row) => ["ORDER_PENDING", "PARTIALLY_FILLED", "MANAGING", "CLOSING", "CLOSED"].includes(row.state)) ? "PASS" : activeCommands.length ? "RUNNING" : "NOT_REACHED", activeCommands.length || null, activeCommands.length ? `${activeCommands.length} active Node command(s)` : "No active Node command"),
      stage("Trade Management", commands.some((row) => ["MANAGING", "CLOSING", "CLOSED"].includes(row.state)) ? "PASS" : commands.some((row) => row.state === "PARTIALLY_FILLED") ? "RUNNING" : "NOT_REACHED", null, "Worker owns full trade lifecycle: entry → fill → protection → active management → close → reconciliation"),
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
        maximumLeverage: 10,
        leverage: 10,
        gradeRisk: { "A+": 1, "A": 1, "B+": "REJECT" },
        maxOpenPositions: 3,
        fixedPerTradeMarginCapEnabled: false,
        fixedCombinedMarginCapEnabled: false,
        fixedFreeReserveEnabled: false,
        perTradeMarginCapPct: null,
        combinedMarginCapPct: null,
        freeReservePct: null,
        riskOwnsTradeEligibility: true,
        sizingIsTradeRejectionGate: false,
        outboxIsTradeRejectionGate: false,
        journalIsTradeRejectionGate: false,
        sizingMethod: "CALCULATOR_ONLY_APPROVED_RISK_STRUCTURAL_STOP_REAL_AVAILABLE_MARGIN",
        outboxAndJournalAreSupportInfrastructure: true,
        tp1: { r: 1.5, closePct: 40, next: "BREAK_EVEN" },
        tp2: { r: 2, closePct: 30 },
        runner: { remainingPct: 30, trailingR: 0.5 },
      },
    });
  } catch (error: any) {
    sendJson(res, 502, { error: text(error?.message, "Unable to load canonical execution truth") });
  }
}
