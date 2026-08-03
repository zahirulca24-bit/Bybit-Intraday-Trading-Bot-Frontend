declare const process: { env: Record<string, string | undefined> };

type AnyRecord = Record<string, any>;
type RequestLike = any;
type ResponseLike = any;

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

function numberValue(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function timestampIso(value: any): string {
  const numeric = numberValue(value, 0);
  const date = numeric > 0
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(text(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
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

function lifecycleLevel(entry: AnyRecord): "PASS" | "WAIT" | "BLOCKED" | "ERROR" | "DEGRADED" {
  const event = text(entry?.event).toLowerCase();
  const payload = entry?.payload || {};
  const result = payload?.result || {};
  const reason = text(result?.retMsg || payload?.reason || payload?.message).toLowerCase();
  if (event.includes("error") || reason.includes("error") || reason.includes("failed")) return "ERROR";
  if (event.includes("blocked") || event.includes("cancelled") || reason.includes("blocked")) return "BLOCKED";
  if (event.includes("pending") || event.includes("wait") || reason.includes("pending")) return "WAIT";
  if (event.includes("degraded") || reason.includes("degraded")) return "DEGRADED";
  return result?.retCode !== undefined && numberValue(result.retCode) !== 0 ? "ERROR" : "PASS";
}

function executionEvidence(entry: AnyRecord): AnyRecord {
  const payload = entry?.payload || {};
  const result = payload?.result || {};
  const order = result?.result || payload?.order || {};
  const orderId = text(order?.orderId || order?.orderLinkId || payload?.orderId || payload?.orderLinkId);
  const symbol = text(payload?.symbol || payload?.requestedSymbol || order?.symbol);
  const price = numberValue(payload?.price || payload?.entryPrice || order?.avgPrice, 0);
  const sizeUsdt = numberValue(payload?.notionalUsdt || payload?.sizeUsdt || payload?.requiredInitialMarginUsdt, 0);
  const leverage = numberValue(payload?.leverage || payload?.nodeExecutionRequirements?.leverage, 0);
  const stopLoss = numberValue(payload?.stopLoss || payload?.stopLossPrice || payload?.technicalStopLoss, 0);
  const takeProfit = numberValue(payload?.takeProfit || payload?.takeProfitPrice || payload?.takeProfitReference, 0);
  return { orderId, symbol, price, sizeUsdt, leverage, stopLoss, takeProfit };
}

function hasVerifiedPassEvidence(entry: AnyRecord): boolean {
  if (lifecycleLevel(entry) !== "PASS") return true;
  const evidence = executionEvidence(entry);
  return Boolean(
    evidence.orderId &&
    evidence.symbol &&
    evidence.price > 0 &&
    evidence.sizeUsdt > 0 &&
    evidence.leverage === 5 &&
    evidence.stopLoss > 0 &&
    evidence.takeProfit > 0
  );
}

function adaptLifecycle(entry: AnyRecord, index: number): AnyRecord {
  const payload = entry?.payload || {};
  const result = payload?.result || {};
  const order = result?.result || payload?.order || {};
  const finalStatus = lifecycleLevel(entry);
  const evidence = executionEvidence(entry);
  const signal = text(payload?.signal || payload?.side, "Buy");
  const reason = text(result?.retMsg || payload?.reason || entry?.event, "Runtime event");
  return {
    id: evidence.orderId,
    timestamp: timestampIso(entry?.time || entry?.timestamp || Date.now()),
    symbol: evidence.symbol,
    side: signal.toLowerCase().includes("sell") || signal.toLowerCase().includes("short") ? "SHORT" : "LONG",
    timeframe: text(payload?.interval || payload?.timeframe, "5m"),
    signal: {
      price: evidence.price,
      condition: reason,
      confidence: numberValue(payload?.confidence || payload?.router?.confidence, 0),
      scanScore: numberValue(payload?.score, 0),
    },
    guard: {
      status: finalStatus,
      checksPassed: finalStatus === "PASS" ? ["Verified order identity and complete execution evidence"] : [],
      blockedReason: finalStatus === "PASS" ? null : reason,
    },
    order: {
      type: text(order?.orderType || payload?.orderType, "MARKET"),
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
    const lifecycles = entries
      .filter(hasVerifiedPassEvidence)
      .slice()
      .reverse()
      .map(adaptLifecycle)
      .filter((row: AnyRecord) => row.id && row.symbol);
    sendJson(res, 200, lifecycles);
  } catch (error: any) {
    sendJson(res, 502, { error: text(error?.message, "Unable to load verified lifecycle truth") });
  }
}
