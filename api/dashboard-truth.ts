declare const process: { env: Record<string, string | undefined> };

type AnyRecord = Record<string, any>;
type RequestLike = any;
type ResponseLike = any;

const DEFAULT_BACKEND_URL = "https://bybit-intraday-backend-608992045433.asia-south1.run.app";
const BACKEND_URL = (process.env.BACKEND_API_URL || DEFAULT_BACKEND_URL).replace(/\/$/, "");
const ADMIN_TOKEN = (process.env.BACKEND_ADMIN_TOKEN || "").trim();
const LOCKED_DAILY_NET_LOSS_PCT = 5;

const EXECUTION_EVENT_MARKERS = [
  "execution_command",
  "submission_intent",
  "order_acknowledged",
  "order_rejected",
  "submission_unknown",
  "resolution_",
  "protection_verified",
  "fill",
  "management_",
  "tp1",
  "tp2",
  "break_even",
  "trailing",
  "position_closed",
  "manual_close",
  "exchange_close",
];

function sendJson(res: ResponseLike, status: number, payload: any): void {
  res.status(status);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.json(payload);
}

function num(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(...values: any[]): number | null {
  const value = values.find((candidate) => candidate !== undefined && candidate !== null && candidate !== "");
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: any, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function first(...values: any[]): any {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function timestampIso(value: any): string {
  const numeric = num(value, 0);
  const millis = numeric > 0 ? (numeric < 10_000_000_000 ? numeric * 1000 : numeric) : Date.now();
  return new Date(millis).toISOString();
}

function availableBalanceFromWallet(account: AnyRecord, equity: number): number {
  const reported = optionalNumber(account?.totalAvailableBalance, account?.totalAvailableBalanceByCoin);
  if (reported !== null && reported > 0) return reported;

  const initialMargin = Math.max(0, num(account?.totalInitialMargin, 0));
  const conservative = Math.max(0, equity - initialMargin);
  return conservative > 0 ? conservative : Math.max(0, reported ?? 0);
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

function positionRows(raw: AnyRecord): AnyRecord[] {
  const rows = raw?.result?.list;
  return Array.isArray(rows) ? rows : [];
}

function executionEvent(entry: AnyRecord): boolean {
  const event = text(entry?.event).trim().toLowerCase();
  return EXECUTION_EVENT_MARKERS.some((marker) => event.includes(marker));
}

function explicitFailure(entry: AnyRecord): boolean {
  const payload = entry?.payload || {};
  const result = payload?.result || {};
  const haystack = `${entry?.event || ""} ${payload?.reason || ""} ${payload?.message || ""} ${result?.retMsg || ""}`.toLowerCase();
  return haystack.includes("error")
    || haystack.includes("failed")
    || haystack.includes("rejected")
    || haystack.includes("cancelled")
    || (result?.retCode !== undefined && num(result.retCode, 0) !== 0);
}

function lifecycleStatus(entry: AnyRecord, hasSuccessEvidence: boolean): "PASS" | "WAIT" | "BLOCKED" | "ERROR" | "DEGRADED" {
  const payload = entry?.payload || {};
  const result = payload?.result || {};
  const haystack = `${entry?.event || ""} ${payload?.reason || ""} ${payload?.message || ""} ${result?.retMsg || ""}`.toLowerCase();
  if (haystack.includes("degraded")) return "DEGRADED";
  if (haystack.includes("blocked") || haystack.includes("cancelled") || haystack.includes("rejected")) return "BLOCKED";
  if (explicitFailure(entry)) return "ERROR";
  if (haystack.includes("unknown") || haystack.includes("pending") || haystack.includes("queued") || haystack.includes("reserved")) return "WAIT";
  return hasSuccessEvidence ? "PASS" : "WAIT";
}

function adaptLifecycle(entry: AnyRecord, index: number): AnyRecord | null {
  if (!executionEvent(entry)) return null;

  const p = entry?.payload || {};
  const evidence = p?.evidence || p?.executionEvidence || p?.sizingEvidence || {};
  const signalEvidence = p?.signalEvidence || p?.signal || p?.setup || evidence?.signal || {};
  const sizing = p?.positionSizing || p?.sizing || evidence?.positionSizing || evidence?.sizing || {};
  const protection = p?.protection || p?.exitPlan || p?.riskPlan || evidence?.protection || {};
  const result = p?.result || {};
  const orderResult = result?.result || p?.order || {};
  const event = text(entry?.event).toLowerCase();
  const orderId = text(first(orderResult?.orderId, p?.orderId, evidence?.orderId), "");
  const orderLinkId = text(first(orderResult?.orderLinkId, p?.orderLinkId, evidence?.orderLinkId), "");
  const symbol = text(first(p?.symbol, p?.requestedSymbol, signalEvidence?.symbol, orderResult?.symbol), "");
  const entryPrice = optionalNumber(p?.price, p?.entryPrice, signalEvidence?.price, signalEvidence?.entryPrice, orderResult?.avgPrice, evidence?.avgPrice);
  const notional = optionalNumber(p?.notionalUsdt, p?.sizeUsdt, sizing?.notionalUsdt, sizing?.positionNotionalUsdt, sizing?.finalNotionalUsdt, evidence?.notionalUsdt, orderResult?.orderValue);
  const leverage = optionalNumber(p?.leverage, sizing?.leverage, evidence?.leverage);
  const stopLoss = optionalNumber(p?.stopLoss, p?.stopLossPrice, protection?.stopLoss, protection?.stopLossPrice, protection?.sl, evidence?.stopLoss);
  const takeProfit = optionalNumber(p?.takeProfit, p?.takeProfitPrice, protection?.takeProfit, protection?.takeProfitPrice, protection?.tp2Price, protection?.tp1Price, evidence?.takeProfit);
  const hasOrderIdentity = Boolean(orderId || orderLinkId);
  const hasFillEvidence = event.includes("fill") || event.includes("resolution_filled") || Boolean(p?.fill || evidence?.fill || evidence?.executions);
  const hasProtectionEvidence = event.includes("protection_verified") && stopLoss !== null && stopLoss > 0 && takeProfit !== null && takeProfit > 0;
  const hasManagementEvidence = ["tp1", "tp2", "break_even", "trailing", "position_closed", "manual_close", "exchange_close"].some((marker) => event.includes(marker));
  const hasSuccessEvidence = hasOrderIdentity && (hasFillEvidence || hasProtectionEvidence || hasManagementEvidence || event.includes("order_acknowledged"));
  const status = lifecycleStatus(entry, hasSuccessEvidence);
  const reason = text(first(p?.reason, p?.message, result?.retMsg, entry?.event), "Backend execution lifecycle event");
  const sideText = text(first(p?.side, signalEvidence?.side, p?.signal, orderResult?.side), "BUY").toUpperCase();

  return {
    id: text(first(orderId, orderLinkId, p?.clientOrderId, entry?.id), `${entry?.time || Date.now()}-${index}`),
    timestamp: timestampIso(first(entry?.time, entry?.timestamp)),
    symbol: symbol || "UNAVAILABLE",
    side: sideText.includes("SELL") || sideText.includes("SHORT") ? "SHORT" : "LONG",
    timeframe: text(first(p?.interval, p?.timeframe, signalEvidence?.timeframe), "5m"),
    signal: {
      price: entryPrice,
      condition: reason,
      confidence: optionalNumber(p?.confidence, p?.confidencePct, signalEvidence?.confidence, signalEvidence?.confidencePct),
      scanScore: optionalNumber(p?.score, p?.scanScore, signalEvidence?.score, signalEvidence?.scanScore),
      grade: text(first(p?.grade, p?.qualityGrade, signalEvidence?.grade, signalEvidence?.qualityGrade), ""),
    },
    guard: {
      status,
      checksPassed: status === "PASS" ? ["Verified backend order/fill/protection evidence"] : [],
      blockedReason: status === "PASS" ? null : reason,
    },
    order: {
      type: text(first(orderResult?.orderType, p?.orderType), "BACKEND_MANAGED"),
      sizeUsdt: notional,
      leverage,
      slippageTolerance: text(first(p?.slippageTolerance, sizing?.slippageTolerance), "Backend controlled"),
    },
    protection: {
      stopLoss,
      takeProfit,
      trailingStop: text(first(protection?.trailingStop, protection?.trailingRule, p?.trailingStop), "Backend managed"),
    },
    finalStatus: status,
    failureReason: status === "PASS" ? null : reason,
    evidenceComplete: hasSuccessEvidence,
    backendEvent: text(entry?.event, "unknown"),
  };
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  try {
    const mode = text(req?.query?.mode || req?.path?.split("/").pop(), "account");
    if (mode === "account") {
      const [wallet, positions, status, policy] = await Promise.all([
        backendJson("/api/bybit/wallet"),
        backendJson("/api/bybit/positions"),
        backendJson("/api/bot/status"),
        backendJson("/api/risk/policy").catch(() => null),
      ]);
      const account = wallet?.result?.list?.[0] || {};
      const bot = status?.bot || status || {};
      const daily = first(bot?.dailyNetLoss, bot?.dailyRisk, status?.dailyNetLoss, status?.dailyRisk, policy?.dailyNetLoss) || {};
      const equity = num(first(account?.totalEquity, account?.totalWalletBalance), 0);
      const availableBalance = availableBalanceFromWallet(account, equity);
      const floatingPnL = num(first(account?.totalPerpUPL, account?.totalUnrealisedPnl), 0);
      const startingEquity = num(first(daily?.startingEquity, daily?.startOfDayEquity, daily?.equityBaseline, equity), equity);
      const realizedNetPnl = num(first(daily?.realizedNetPnl, daily?.netRealizedPnl, daily?.netPnl, bot?.dailyNetPnl), 0);
      const configuredLimit = num(first(daily?.limitPct, daily?.dailyLossCapPct, policy?.dailyNetLossPct, bot?.dailyLossCapPct), LOCKED_DAILY_NET_LOSS_PCT);
      const maxDailyRiskPercent = configuredLimit > 0 ? configuredLimit : LOCKED_DAILY_NET_LOSS_PCT;
      const dailyRiskUsedPercent = startingEquity > 0 && realizedNetPnl < 0 ? (Math.abs(realizedNetPnl) / startingEquity) * 100 : 0;
      const openPositions = positionRows(positions).filter((row) => Math.abs(num(row?.size, 0)) > 0);
      const tradesToday = num(first(daily?.tradesToday, bot?.tradesToday), 0);
      const winsToday = num(first(daily?.winsToday, bot?.winsToday), 0);
      const lossesToday = num(first(daily?.lossesToday, bot?.lossesToday), 0);

      sendJson(res, 200, {
        equity,
        availableBalance,
        floatingPnL,
        floatingPnLPercent: equity ? (floatingPnL / equity) * 100 : 0,
        openTradesCount: openPositions.length,
        maxOpenTrades: num(first(bot?.maxOpenPositions, 3), 3),
        dailyRiskUsedPercent,
        maxDailyRiskPercent,
        dailyRealizedNetPnl: realizedNetPnl,
        dailyStartingEquity: startingEquity,
        dailyLockActive: Boolean(first(daily?.locked, daily?.lockActive, bot?.dailyLockActive, dailyRiskUsedPercent >= maxDailyRiskPercent)),
        tradesTodayCount: tradesToday,
        winsToday,
        lossesToday,
        winRatePercent: tradesToday ? (winsToday / tradesToday) * 100 : 0,
      });
      return;
    }

    if (mode === "lifecycle") {
      const raw = await backendJson("/api/bot/journal?limit=100");
      const entries = Array.isArray(raw?.journal) ? raw.journal : [];
      const lifecycle = entries
        .slice()
        .reverse()
        .map(adaptLifecycle)
        .filter((entry): entry is AnyRecord => entry !== null);
      sendJson(res, 200, lifecycle);
      return;
    }

    sendJson(res, 404, { error: "Unsupported dashboard truth route" });
  } catch (error: any) {
    sendJson(res, 502, { error: text(error?.message, "Unable to read dashboard truth from backend") });
  }
}
