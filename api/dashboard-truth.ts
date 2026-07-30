declare const process: { env: Record<string, string | undefined> };

type AnyRecord = Record<string, any>;
type RequestLike = any;
type ResponseLike = any;

const BACKEND_URL = (process.env.BACKEND_API_URL || "https://bybit-intraday-trading-bot.onrender.com").replace(/\/$/, "");
const ADMIN_TOKEN = (process.env.BACKEND_ADMIN_TOKEN || "").trim();
const LOCKED_DAILY_NET_LOSS_PCT = 5;

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

function text(value: any, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function first(...values: any[]): any {
  return values.find((value) => value !== undefined && value !== null && value !== "");
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

function lifecycleStatus(entry: AnyRecord): "PASS" | "WAIT" | "BLOCKED" | "ERROR" | "DEGRADED" {
  const payload = entry?.payload || {};
  const result = payload?.result || {};
  const haystack = `${entry?.event || ""} ${payload?.reason || ""} ${payload?.message || ""} ${result?.retMsg || ""}`.toLowerCase();
  if (haystack.includes("degraded")) return "DEGRADED";
  if (haystack.includes("blocked") || haystack.includes("cancelled") || haystack.includes("rejected")) return "BLOCKED";
  if (haystack.includes("wait") || haystack.includes("pending") || haystack.includes("queued")) return "WAIT";
  if (haystack.includes("error") || haystack.includes("failed") || num(result?.retCode, 0) !== 0) return "ERROR";
  return "PASS";
}

function adaptLifecycle(entry: AnyRecord, index: number): AnyRecord {
  const p = entry?.payload || {};
  const evidence = p?.evidence || p?.executionEvidence || p?.sizingEvidence || {};
  const signalEvidence = p?.signalEvidence || p?.signal || p?.setup || evidence?.signal || {};
  const sizing = p?.positionSizing || p?.sizing || evidence?.positionSizing || evidence?.sizing || {};
  const protection = p?.protection || p?.exitPlan || p?.riskPlan || evidence?.protection || {};
  const result = p?.result || {};
  const orderResult = result?.result || p?.order || {};
  const grade = text(first(p?.grade, p?.qualityGrade, signalEvidence?.grade, signalEvidence?.qualityGrade, evidence?.grade), "");
  const confidence = num(first(p?.confidence, p?.confidencePct, signalEvidence?.confidence, signalEvidence?.confidencePct, evidence?.confidence), 0);
  const riskAmount = num(first(p?.riskAmountUsdt, p?.riskBudgetUsdt, sizing?.riskAmountUsdt, sizing?.riskBudgetUsdt, sizing?.actualRiskUsdt, evidence?.riskAmountUsdt, evidence?.actualRiskUsdt), 0);
  const notional = num(first(p?.notionalUsdt, p?.sizeUsdt, sizing?.notionalUsdt, sizing?.positionNotionalUsdt, sizing?.finalNotionalUsdt, evidence?.notionalUsdt, orderResult?.orderValue), 0);
  const stopLoss = num(first(p?.stopLoss, p?.stopLossPrice, protection?.stopLoss, protection?.stopLossPrice, protection?.sl, evidence?.stopLoss), 0);
  const takeProfit = num(first(p?.takeProfit, p?.takeProfitPrice, protection?.takeProfit, protection?.takeProfitPrice, protection?.tp2Price, protection?.tp1Price, evidence?.takeProfit), 0);
  const sideText = text(first(p?.side, signalEvidence?.side, p?.signal, orderResult?.side), "BUY").toUpperCase();
  const status = lifecycleStatus(entry);
  const reason = text(first(p?.reason, p?.message, result?.retMsg, entry?.event), "Canonical backend lifecycle event");

  return {
    id: text(first(orderResult?.orderId, orderResult?.orderLinkId, p?.clientOrderId, entry?.id), `${entry?.time || Date.now()}-${index}`),
    timestamp: new Date(num(first(entry?.time, entry?.timestamp), Date.now())).toISOString(),
    symbol: text(first(p?.symbol, p?.requestedSymbol, signalEvidence?.symbol, orderResult?.symbol), "UNKNOWN"),
    side: sideText.includes("SELL") || sideText.includes("SHORT") ? "SHORT" : "LONG",
    timeframe: text(first(p?.interval, p?.timeframe, signalEvidence?.timeframe), "5m"),
    signal: {
      price: num(first(p?.price, p?.entryPrice, signalEvidence?.price, signalEvidence?.entryPrice, orderResult?.avgPrice), 0),
      condition: grade ? `${grade} grade · ${reason}` : reason,
      confidence,
      scanScore: num(first(p?.score, p?.scanScore, signalEvidence?.score, signalEvidence?.scanScore), 0),
      grade,
      riskAmountUsdt: riskAmount,
    },
    guard: {
      status,
      checksPassed: status === "PASS" ? ["Canonical backend accepted lifecycle event"] : [],
      blockedReason: status === "PASS" ? null : reason,
    },
    order: {
      type: text(first(orderResult?.orderType, p?.orderType), "MARKET"),
      sizeUsdt: notional,
      leverage: num(first(p?.leverage, sizing?.leverage, evidence?.leverage), 0),
      slippageTolerance: text(first(p?.slippageTolerance, sizing?.slippageTolerance), "Backend controlled"),
      riskAmountUsdt: riskAmount,
    },
    protection: {
      stopLoss,
      takeProfit,
      trailingStop: text(first(protection?.trailingStop, protection?.trailingRule, p?.trailingStop), "TP2 verified → 0.5R trail"),
    },
    finalStatus: status,
    failureReason: status === "PASS" ? null : reason,
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
        availableBalance: num(first(account?.totalAvailableBalance, account?.totalAvailableBalanceByCoin), 0),
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
      const raw = await backendJson("/api/bot/journal?limit=50");
      const entries = Array.isArray(raw?.journal) ? raw.journal : [];
      sendJson(res, 200, entries.slice().reverse().map(adaptLifecycle));
      return;
    }

    sendJson(res, 404, { error: "Unsupported dashboard truth route" });
  } catch (error: any) {
    sendJson(res, 502, { error: text(error?.message, "Unable to read dashboard truth from backend") });
  }
}
