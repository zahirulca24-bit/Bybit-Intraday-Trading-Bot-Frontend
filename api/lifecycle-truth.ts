declare const process: { env: Record<string, string | undefined> };

type AnyRecord = Record<string, any>;
type RequestLike = any;
type ResponseLike = any;
type LifecycleLevel = "PASS" | "WAIT" | "BLOCKED" | "ERROR" | "DEGRADED";

const DEFAULT_BACKEND_URL = "https://bybit-intraday-backend-608992045433.asia-south1.run.app";
const BACKEND_URL = (process.env.BACKEND_API_URL || DEFAULT_BACKEND_URL).replace(/\/$/, "");
const ADMIN_TOKEN = (process.env.BACKEND_ADMIN_TOKEN || "").trim();

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

function optionalNumber(value: any): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function timestampIso(value: any): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const numeric = optionalNumber(value);
  const date = numeric !== undefined
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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

function executionEvidence(entry: AnyRecord): AnyRecord {
  const payload = entry?.payload || {};
  const result = payload?.result || {};
  const order = result?.result || payload?.order || {};
  return {
    orderId: text(order?.orderId || order?.orderLinkId || payload?.orderId || payload?.orderLinkId),
    symbol: text(payload?.symbol || payload?.requestedSymbol || order?.symbol),
    price: optionalNumber(payload?.price ?? payload?.entryPrice ?? order?.avgPrice),
    sizeUsdt: optionalNumber(payload?.notionalUsdt ?? payload?.sizeUsdt ?? payload?.requiredInitialMarginUsdt),
    leverage: optionalNumber(payload?.leverage ?? payload?.nodeExecutionRequirements?.leverage),
    stopLoss: optionalNumber(payload?.stopLoss ?? payload?.stopLossPrice ?? payload?.technicalStopLoss),
    takeProfit: optionalNumber(payload?.takeProfit ?? payload?.takeProfitPrice ?? payload?.takeProfitReference),
  };
}

function hasCompleteExecutionEvidence(entry: AnyRecord): boolean {
  const evidence = executionEvidence(entry);
  return Boolean(
    evidence.orderId && evidence.symbol && evidence.price && evidence.price > 0 &&
    evidence.sizeUsdt && evidence.sizeUsdt > 0 && evidence.leverage === 5 &&
    evidence.stopLoss && evidence.stopLoss > 0 && evidence.takeProfit && evidence.takeProfit > 0
  );
}

function lifecycleLevel(entry: AnyRecord): LifecycleLevel {
  const event = text(entry?.event).toLowerCase();
  const payload = entry?.payload || {};
  const result = payload?.result || {};
  const reason = text(result?.retMsg || payload?.reason || payload?.message).toLowerCase();
  if (event.includes("error") || reason.includes("error") || reason.includes("failed")) return "ERROR";
  if (event.includes("blocked") || event.includes("cancelled") || reason.includes("blocked")) return "BLOCKED";
  if (event.includes("degraded") || reason.includes("degraded")) return "DEGRADED";
  if (event.includes("pending") || event.includes("wait") || reason.includes("pending")) return "WAIT";
  if (result?.retCode !== undefined && optionalNumber(result.retCode) !== 0) return "ERROR";
  return hasCompleteExecutionEvidence(entry) ? "PASS" : "WAIT";
}

function adaptLifecycle(entry: AnyRecord): AnyRecord {
  const payload = entry?.payload || {};
  const result = payload?.result || {};
  const order = result?.result || payload?.order || {};
  const evidence = executionEvidence(entry);
  const finalStatus = lifecycleLevel(entry);
  const signalText = text(payload?.signal || payload?.side);
  const reason = text(result?.retMsg || payload?.reason || entry?.event, "Backend evidence unavailable");
  const evidenceComplete = hasCompleteExecutionEvidence(entry);
  return {
    id: evidence.orderId,
    timestamp: timestampIso(entry?.time || entry?.timestamp),
    symbol: evidence.symbol,
    side: signalText.toLowerCase().includes("sell") || signalText.toLowerCase().includes("short") ? "SHORT" : "LONG",
    timeframe: text(payload?.interval || payload?.timeframe, "UNAVAILABLE"),
    signal: {
      price: evidence.price,
      condition: reason,
      confidence: optionalNumber(payload?.confidence ?? payload?.router?.confidence),
      scanScore: optionalNumber(payload?.score),
    },
    guard: {
      status: finalStatus,
      checksPassed: evidenceComplete ? ["Verified order identity and complete execution evidence"] : [],
      blockedReason: evidenceComplete ? null : "Complete backend execution evidence is unavailable.",
    },
    order: {
      type: text(order?.orderType || payload?.orderType, "UNAVAILABLE"),
      sizeUsdt: evidence.sizeUsdt,
      leverage: evidence.leverage,
      slippageTolerance: text(payload?.slippageTolerance, "Backend controlled"),
    },
    protection: {
      stopLoss: evidence.stopLoss,
      takeProfit: evidence.takeProfit,
      trailingStop: text(payload?.trailingStop, "Backend controlled"),
    },
    finalStatus,
    failureReason: finalStatus === "PASS" ? null : reason,
    evidenceComplete,
  };
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (text(req?.method, "GET").toUpperCase() !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const raw = await backendJson("/api/bot/journal?limit=50");
    const entries = Array.isArray(raw?.journal) ? raw.journal : [];
    const lifecycles = entries.slice().reverse().map(adaptLifecycle).filter((row: AnyRecord) => row.id && row.symbol);
    sendJson(res, 200, lifecycles);
  } catch (error: any) {
    sendJson(res, 502, { error: text(error?.message, "Unable to load verified lifecycle truth") });
  }
}
