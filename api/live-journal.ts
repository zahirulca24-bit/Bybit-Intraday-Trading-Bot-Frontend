declare const process: { env: Record<string, string | undefined> };

type AnyRecord = Record<string, any>;
type RequestLike = any;
type ResponseLike = any;
export type JournalLevel = "PASS" | "WAIT" | "BLOCKED" | "ERROR" | "DEGRADED";

export interface LiveJournalRow {
  id: string;
  timestamp: string;
  level: JournalLevel;
  category: string;
  message: string;
  source: "RUNTIME_JOURNAL" | "BYBIT_DEMO_EXECUTION_LIST" | "EXECUTION_LEDGER_STATUS";
  details?: AnyRecord;
}

class UpstreamError extends Error {
  status: number;
  payload: any;

  constructor(status: number, message: string, payload?: any) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
    this.payload = payload;
  }
}

const DEFAULT_BACKEND_URL = "https://bybit-intraday-trading-bot.onrender.com";
const BACKEND_URL = (
  process.env.BACKEND_API_URL ||
  process.env.VITE_API_BASE_URL ||
  DEFAULT_BACKEND_URL
).replace(/\/$/, "");
const ADMIN_TOKEN = (process.env.BACKEND_ADMIN_TOKEN || "").trim();
const LEVELS = new Set<JournalLevel>(["PASS", "WAIT", "BLOCKED", "ERROR", "DEGRADED"]);

function stringValue(value: any, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function numberValue(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function timestampIso(value: any): string {
  const numeric = numberValue(value, 0);
  if (numeric > 0) {
    const millis = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const parsed = new Date(stringValue(value));
  return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
}

function normalizedLevel(value: any): JournalLevel | null {
  const candidate = stringValue(value).trim().toUpperCase() as JournalLevel;
  return LEVELS.has(candidate) ? candidate : null;
}

function resultObject(entry: AnyRecord): AnyRecord {
  const payload = entry?.payload && typeof entry.payload === "object" ? entry.payload : {};
  return payload?.result && typeof payload.result === "object" ? payload.result : {};
}

function journalReason(entry: AnyRecord): string {
  const payload = entry?.payload && typeof entry.payload === "object" ? entry.payload : {};
  const result = resultObject(entry);
  return stringValue(
    payload.reason ||
      result.retMsg ||
      payload.message ||
      payload.error ||
      entry.message ||
      stringValue(entry.event, "runtime").replaceAll("_", " "),
    "Runtime event",
  );
}

export function classifyJournalLevel(entry: AnyRecord): JournalLevel {
  const payload = entry?.payload && typeof entry.payload === "object" ? entry.payload : {};
  const result = resultObject(entry);
  const explicit = normalizedLevel(
    entry.level || entry.status || payload.level || payload.status || payload.severity || result.status,
  );
  if (explicit) return explicit;

  const event = stringValue(entry?.event, "runtime").toLowerCase();
  const reason = journalReason(entry).toLowerCase();
  const combined = `${event} ${reason}`;
  const retCodeRaw = result.retCode ?? payload.retCode;
  const retCode = retCodeRaw === undefined || retCodeRaw === null || retCodeRaw === ""
    ? null
    : numberValue(retCodeRaw, Number.NaN);

  const blockedSemantics = [
    "blocked",
    "cancelled",
    "canceled",
    "max trades/day reached",
    "daily loss cap reached",
    "limit reached",
    "new entries locked",
    "entry lock",
    "execution lock",
    "execution denied",
    "risk denied",
    "cooldown active",
    "position already open",
    "duplicate signal",
    "runtime stopped",
    "kill switch",
    "no executable signal",
  ].some((marker) => combined.includes(marker));

  const waitSemantics = [" wait", "waiting", "pending", "not reached", "confirmation"].some((marker) =>
    combined.includes(marker),
  );
  const degradedSemantics = ["degraded", "persistence unavailable", "store unavailable"].some((marker) =>
    combined.includes(marker),
  );
  const errorSemantics = [
    "error",
    "failed",
    "failure",
    "exception",
    "invalid",
    "timeout",
    "unavailable",
    "rejected",
  ].some((marker) => combined.includes(marker));

  if (blockedSemantics) return "BLOCKED";
  if (degradedSemantics) return "DEGRADED";
  if (retCode !== null && Number.isFinite(retCode) && retCode !== 0) {
    return retCode < 0 ? "BLOCKED" : "ERROR";
  }
  if (errorSemantics) return "ERROR";
  if (waitSemantics) return "WAIT";
  return "PASS";
}

export function adaptRuntimeJournalEntry(entry: AnyRecord, index: number): LiveJournalRow {
  const event = stringValue(entry?.event, "runtime");
  const payload = entry?.payload && typeof entry.payload === "object" ? entry.payload : {};
  return {
    id: `runtime:${stringValue(entry?.id, `${entry?.time || entry?.timestamp || 0}:${event}:${index}`)}`,
    timestamp: timestampIso(entry?.time || entry?.timestamp),
    level: classifyJournalLevel(entry),
    category: event,
    message: journalReason(entry),
    source: "RUNTIME_JOURNAL",
    details: {
      event,
      payload,
    },
  };
}

function executionActionText(action: string): string {
  const labels: Record<string, string> = {
    ENTRY: "opened exposure",
    ADD: "increased exposure",
    PARTIAL_EXIT: "partially closed exposure",
    FULL_EXIT: "closed exposure",
    REVERSAL: "reversed exposure",
  };
  return labels[action] || action.toLowerCase().replaceAll("_", " ");
}

export function adaptExecutionEntry(entry: AnyRecord, index: number): LiveJournalRow {
  const action = stringValue(entry?.action, "EXECUTION").toUpperCase();
  const symbol = stringValue(entry?.symbol, "UNKNOWN").toUpperCase();
  const side = stringValue(entry?.side, "UNKNOWN");
  const qty = stringValue(entry?.execQty, "0");
  const price = stringValue(entry?.execPrice, "0");
  const fee = stringValue(entry?.execFee, "0");
  const feeCurrency = stringValue(entry?.feeCurrency, "USDT");
  const before = stringValue(entry?.positionBefore, "0");
  const after = stringValue(entry?.positionAfter, "0");
  const orderId = stringValue(entry?.orderId || entry?.orderLinkId);
  const orderEvidence = orderId ? `; order ${orderId}` : "";

  return {
    id: `execution:${stringValue(entry?.execId, `${entry?.execTime || 0}:${index}`)}`,
    timestamp: timestampIso(entry?.execTime),
    level: "PASS",
    category: `bybit_${action.toLowerCase()}`,
    message: `${symbol} ${executionActionText(action)}: ${side} ${qty} @ ${price}; fee ${fee} ${feeCurrency}; position ${before} → ${after}${orderEvidence}`,
    source: "BYBIT_DEMO_EXECUTION_LIST",
    details: {
      execId: entry?.execId || null,
      orderId: entry?.orderId || null,
      orderLinkId: entry?.orderLinkId || null,
      symbol,
      side,
      action,
      execType: entry?.execType || null,
      execQty: qty,
      execPrice: price,
      execFee: fee,
      feeCurrency,
      closedSize: stringValue(entry?.closedSize, "0"),
      entrySize: stringValue(entry?.entrySize, "0"),
      positionBefore: before,
      positionAfter: after,
      isMaker: entry?.isMaker ?? null,
      syncedAt: entry?.syncedAt ?? null,
    },
  };
}

export function adaptExecutionSummary(summary: AnyRecord): LiveJournalRow | null {
  const syncedAt = numberValue(summary?.lastSyncedAt, 0);
  if (!summary || typeof summary !== "object" || !syncedAt) return null;
  const available = summary.available === true && summary.stale !== true;
  const feeCurrencies = Array.isArray(summary.feeCurrencies) ? summary.feeCurrencies.join(",") : "USDT";
  return {
    id: `execution-summary:${syncedAt}`,
    timestamp: timestampIso(syncedAt),
    level: available ? "PASS" : "DEGRADED",
    category: "execution_ledger_sync",
    message: available
      ? `Execution ledger synced: ${stringValue(summary.totalExecutions, "0")} fills, ${stringValue(summary.entryExecutions, "0")} entries, ${stringValue(summary.exitExecutions, "0")} exits, ${stringValue(summary.partialCloseExecutions, "0")} partial closes, ${stringValue(summary.completedTrades, "0")} completed trades; net fees ${stringValue(summary.netTradingFees, "0")} ${feeCurrencies}`
      : stringValue(summary.reason || summary.syncError, "Execution ledger truth is stale or unavailable."),
    source: "EXECUTION_LEDGER_STATUS",
    details: { ...summary },
  };
}

export function sourceFailureRow(source: string, reason: string, now = Date.now()): LiveJournalRow {
  return {
    id: `source-failure:${source}:${now}`,
    timestamp: timestampIso(now),
    level: "DEGRADED",
    category: `${source.toLowerCase()}_unavailable`,
    message: reason,
    source: "EXECUTION_LEDGER_STATUS",
    details: { source, reason },
  };
}

export function mergeJournalRows(rows: LiveJournalRow[], limit: number): LiveJournalRow[] {
  const deduped = new Map<string, LiveJournalRow>();
  for (const row of rows) {
    const current = deduped.get(row.id);
    if (!current || Date.parse(row.timestamp) >= Date.parse(current.timestamp)) {
      deduped.set(row.id, row);
    }
  }
  return [...deduped.values()]
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp) || left.id.localeCompare(right.id))
    .slice(0, Math.max(1, Math.min(500, limit)));
}

async function backendJson(path: string): Promise<any> {
  if (!ADMIN_TOKEN) {
    throw new UpstreamError(
      503,
      "Render frontend BFF is missing BACKEND_ADMIN_TOKEN.",
    );
  }
  const response = await fetch(`${BACKEND_URL}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }
  if (!response.ok) {
    throw new UpstreamError(
      response.status,
      stringValue(payload?.error || payload?.message || payload?.retMsg, `Backend request failed (${response.status})`),
      payload,
    );
  }
  return payload;
}

function sendJson(res: ResponseLike, status: number, payload: any): void {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

export default async function liveJournalHandler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (stringValue(req.method, "GET").toUpperCase() !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const requestedLimit = numberValue(req.query?.limit, 100);
  const limit = Math.max(1, Math.min(500, requestedLimit));
  const sourceLimit = Math.max(limit, 200);
  const filter = stringValue(req.query?.filter, "ALL").toUpperCase();

  const [runtimeResult, executionsResult, summaryResult] = await Promise.allSettled([
    backendJson(`/api/bot/journal?limit=${sourceLimit}`),
    backendJson(`/api/live-executions?limit=${sourceLimit}`),
    backendJson("/api/live-executions/summary"),
  ]);

  if (runtimeResult.status === "rejected" && executionsResult.status === "rejected") {
    const runtimeMessage = runtimeResult.reason instanceof Error ? runtimeResult.reason.message : String(runtimeResult.reason);
    const executionMessage = executionsResult.reason instanceof Error ? executionsResult.reason.message : String(executionsResult.reason);
    sendJson(res, 502, {
      error: "Both runtime journal and canonical execution ledger are unavailable.",
      runtimeJournalError: runtimeMessage,
      executionLedgerError: executionMessage,
    });
    return;
  }

  const rows: LiveJournalRow[] = [];
  if (runtimeResult.status === "fulfilled") {
    const runtimeEntries = Array.isArray(runtimeResult.value?.journal) ? runtimeResult.value.journal : [];
    rows.push(...runtimeEntries.map(adaptRuntimeJournalEntry));
  } else {
    rows.push(sourceFailureRow(
      "RUNTIME_JOURNAL",
      runtimeResult.reason instanceof Error ? runtimeResult.reason.message : String(runtimeResult.reason),
    ));
  }

  if (executionsResult.status === "fulfilled") {
    const executionEntries = Array.isArray(executionsResult.value?.entries) ? executionsResult.value.entries : [];
    rows.push(...executionEntries.map(adaptExecutionEntry));
  } else {
    rows.push(sourceFailureRow(
      "BYBIT_EXECUTION_LEDGER",
      executionsResult.reason instanceof Error ? executionsResult.reason.message : String(executionsResult.reason),
    ));
  }

  if (summaryResult.status === "fulfilled") {
    const summaryRow = adaptExecutionSummary(summaryResult.value);
    if (summaryRow) rows.push(summaryRow);
  } else {
    rows.push(sourceFailureRow(
      "EXECUTION_LEDGER_SUMMARY",
      summaryResult.reason instanceof Error ? summaryResult.reason.message : String(summaryResult.reason),
    ));
  }

  let merged = mergeJournalRows(rows, 500);
  if (filter !== "ALL") {
    merged = merged.filter((row) =>
      row.level === filter ||
      row.category.toUpperCase().includes(filter) ||
      row.source.toUpperCase().includes(filter),
    );
  }
  sendJson(res, 200, merged.slice(0, limit));
}
