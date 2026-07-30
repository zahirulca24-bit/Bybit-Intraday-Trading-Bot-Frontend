declare const process: { env: Record<string, string | undefined> };

type AnyRecord = Record<string, any>;
type RequestLike = any;
type ResponseLike = any;

const DEFAULT_BACKEND_URL = "https://bybit-intraday-trading-bot.onrender.com";
const BACKEND_URL = (
  process.env.BACKEND_API_URL ||
  process.env.VITE_API_BASE_URL ||
  DEFAULT_BACKEND_URL
).replace(/\/$/, "");
const ADMIN_TOKEN = (process.env.BACKEND_ADMIN_TOKEN || "").trim();

function sendJson(res: ResponseLike, status: number, payload: any): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

function numberValue(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: any, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function timestampIso(value: any): string {
  const numeric = numberValue(value, 0);
  if (numeric > 0) {
    const millis = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function normalizeSignal(value: any): "Buy" | "Sell" | "WAIT" | "Blocked" | "Error" {
  const text = stringValue(value, "WAIT").toLowerCase();
  if (text === "buy" || text === "long") return "Buy";
  if (text === "sell" || text === "short") return "Sell";
  if (text.includes("block")) return "Blocked";
  if (text.includes("error") || text.includes("fail")) return "Error";
  return "WAIT";
}

function percentValue(value: any): number {
  const parsed = numberValue(value, 0);
  return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
}

function costTier(setup: AnyRecord, market: AnyRecord): "LOW" | "MEDIUM" | "HIGH" {
  const rawTier = stringValue(setup?.costGate?.spreadTier || market?.costTier).toLowerCase();
  if (["normal", "low"].includes(rawTier)) return "LOW";
  if (["reduced", "strong_only", "medium"].includes(rawTier)) return "MEDIUM";
  const spread = numberValue(setup?.costGate?.spreadPct ?? market?.spreadPct, 999);
  if (spread <= 0.03) return "LOW";
  if (spread <= 0.05) return "MEDIUM";
  return "HIGH";
}

function executionReadiness(
  setup: AnyRecord,
  executionBlocked: boolean,
): "EXECUTABLE" | "NOT_EXECUTABLE" | "BLOCKED" | "PENDING_RISK" | "ERROR" {
  const status = stringValue(setup?.status).toUpperCase();
  const execution = stringValue(setup?.executionStatus).toUpperCase();
  if (execution.includes("ERROR") || execution.includes("FAIL")) return "ERROR";
  if (execution.includes("BLOCK") || status === "BLOCKED") return "BLOCKED";
  if (status === "CONFIRMED" && executionBlocked) return "BLOCKED";
  if (status === "CONFIRMED" && setup?.queued === true) return "EXECUTABLE";
  if (status === "CONFIRMED") return "PENDING_RISK";
  return "NOT_EXECUTABLE";
}

async function backendJson(path: string): Promise<any> {
  if (!ADMIN_TOKEN) {
    const error = new Error("Vercel server is missing BACKEND_ADMIN_TOKEN");
    (error as any).status = 503;
    throw error;
  }
  const response = await fetch(`${BACKEND_URL}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
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
    const error = new Error(stringValue(payload?.error || payload?.message, `Backend request failed (${response.status})`));
    (error as any).status = response.status;
    (error as any).payload = payload;
    throw error;
  }
  return payload;
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (stringValue(req.method, "GET").toUpperCase() !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const started = Date.now();
  try {
    const [symbolsRaw, setupsRaw, executionRaw] = await Promise.all([
      backendJson("/api/workers/symbols"),
      backendJson("/api/workers/setups"),
      backendJson("/api/workers/execution"),
    ]);

    const executionResult = executionRaw?.lastResult || {};
    const executionBlocked =
      stringValue(executionRaw?.status).toUpperCase() === "BLOCKED" ||
      stringValue(executionResult?.status).toUpperCase() === "BLOCKED";
    const executionBlockReason = stringValue(
      executionResult?.reason || executionRaw?.lastError,
      "Automatic execution is currently blocked by the backend.",
    );

    const marketRows = Array.isArray(symbolsRaw?.rows) ? symbolsRaw.rows : [];
    const setupRows = Array.isArray(setupsRaw?.rows) ? setupsRaw.rows : [];
    const marketBySymbol = new Map<string, AnyRecord>(
      marketRows.map((row: AnyRecord) => [stringValue(row?.symbol).toUpperCase(), row]),
    );

    const signals = setupRows.map((setup: AnyRecord, index: number) => {
      const symbol = stringValue(setup?.symbol, `UNKNOWN-${index + 1}`).toUpperCase();
      const market = marketBySymbol.get(symbol) || {};
      const signal = normalizeSignal(setup?.engineSignal);
      const readiness = executionReadiness(setup, executionBlocked);
      const setupReason = stringValue(
        setup?.reason || setup?.engineReason || setup?.router?.reason,
        "No setup reason supplied",
      );
      const readinessReason = readiness === "BLOCKED" && executionBlocked
        ? executionBlockReason
        : setupReason;
      const indicators = setup?.indicators || {};
      const engineStatus = setup?.engineStatus || {};
      const votes = Array.isArray(setup?.strategyVotes) ? setup.strategyVotes : [];

      return {
        symbol,
        signal: stringValue(setup?.status).toUpperCase() === "CONFIRMED" ? signal : "WAIT",
        routerReason: stringValue(setup?.engineReason || setup?.router?.reason, setupReason),
        change24hPct: numberValue(market?.changePct, 0),
        turnoverUsdt: numberValue(market?.turnover24h, 0),
        spreadPct: numberValue(setup?.costGate?.spreadPct ?? market?.spreadPct, 0),
        atr15m: numberValue(market?.atr15mPct, 0),
        volumeRatio: numberValue(market?.volumeRatio, 0),
        costTier: costTier(setup, market),
        routerConfidencePct: percentValue(setup?.router?.confidence),
        signalCandleTime: setup?.signalCandleTime ?? indicators?.signalCandleTime ?? null,
        executionReadiness: readiness,
        readinessReason,
        strategyVotes: votes.map((vote: AnyRecord, voteIndex: number) => ({
          engineName: stringValue(vote?.engineName || vote?.engine || vote?.name, `Strategy ${voteIndex + 1}`),
          voteSignal: normalizeSignal(vote?.signal || vote?.voteSignal),
          voteReason: stringValue(vote?.reason || vote?.voteReason, "No reason supplied"),
          voteStrengthPct: percentValue(vote?.strength || vote?.confidence || vote?.voteStrengthPct),
        })),
        indicators: {
          trend1h: stringValue(indicators?.trendDirection1H || indicators?.trend1h || setup?.trend, "Unknown"),
          rsi15m: numberValue(indicators?.rsi15M || indicators?.rsi15m, 0),
          rsi5m: numberValue(indicators?.rsi5M || indicators?.rsi5m, 0),
          ema20_1h: numberValue(indicators?.ema20_1H || indicators?.ema20_1h, 0),
          ema50_1h: numberValue(indicators?.ema50_1H || indicators?.ema50_1h, 0),
          entryTimeframe: `${stringValue(indicators?.entryInterval, "15")}m`,
          closedSignalCandleTimestamp: setup?.signalCandleTime ?? indicators?.signalCandleTime ?? null,
        },
        pipelineStatuses: {
          marketDataStatus: stringValue(engineStatus?.marketData, "unknown"),
          indicatorStatus: stringValue(engineStatus?.indicator, "unknown"),
          strategyStatus: stringValue(engineStatus?.strategy, "unknown"),
          routerStatus: stringValue(engineStatus?.router, "unknown"),
          riskStatus: stringValue(engineStatus?.risk, "unknown"),
          tradeManagementStatus: stringValue(engineStatus?.tradeManagement, "unknown"),
          journalStatus: stringValue(engineStatus?.journal, "unknown"),
        },
      };
    });

    const activeSymbols = Array.isArray(symbolsRaw?.activeSymbols) ? symbolsRaw.activeSymbols : [];
    const completed = setupRows.length;
    const lastBatch = setupsRaw?.lastBatch || {};
    const rejected = numberValue(lastBatch?.noSetup, 0) + numberValue(lastBatch?.skipped, 0);

    sendJson(res, 200, {
      summary: {
        totalContracts: numberValue(symbolsRaw?.totalUniverse, activeSymbols.length),
        validUsdtContracts: activeSymbols.length,
        spreadPassed: marketRows.filter((row: AnyRecord) => numberValue(row?.spreadPct, 999) <= 0.14).length,
        liquidityPassed: marketRows.filter((row: AnyRecord) => numberValue(row?.turnover24h, 0) >= 1_500_000).length,
        enriched: marketRows.length,
        shortlisted: activeSymbols.length,
        deepScanned: completed,
        completed,
        rejected,
        timedOut: 0,
        scanDurationMs: Date.now() - started,
        lastUpdated: timestampIso(setupsRaw?.lastRunAt || symbolsRaw?.updatedAt),
        entryTimeframe: "15m",
        routerMode: stringValue(setupRows[0]?.router?.mode, "balanced"),
        universeLabel: "Live worker-selected Bybit Demo universe",
        bybitMode: "Bybit Demo API",
      },
      policy: {
        shortlistSize: activeSymbols.length,
        deepScanSize: numberValue(setupsRaw?.batchSize, completed),
        normalSpreadThresholdPct: 0.03,
        reducedSizeSpreadThresholdPct: 0.05,
        maxSpreadThresholdPct: 0.14,
        minTurnoverUsdt: 1_500_000,
        minAtr15m: 0,
        maxAtr15m: 100,
        minVolumeRatio: 1.2,
        minGrossRR: 1.8,
        minNetRR: 1.5,
        preferredNetRR: 2.2,
        normalCostToRiskLimitPct: 5,
        maxCostToRiskLimitPct: 10,
        refreshIntervalSec: 30,
        scanDeadlineMs: 20_000,
      },
      signals,
    });
  } catch (error: any) {
    const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    sendJson(res, isTimeout ? 504 : numberValue(error?.status, 502), {
      error: isTimeout
        ? "Bybit Demo worker status timed out. Render may be waking up; retry shortly."
        : stringValue(error?.message, "Unable to load live scanner data"),
      upstream: error?.payload,
    });
  }
}
