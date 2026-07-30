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
const ENTRY_INTERVAL_MS = 15 * 60 * 1000;
const MAX_SPREAD_PCT = 0.14;
const MIN_VOLUME_RATIO = 1.2;

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

function optionalNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: any, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function timestampMillis(value: any): number | null {
  const numeric = optionalNumber(value);
  if (numeric === null || numeric <= 0) return null;
  const millis = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  return Number.isFinite(new Date(millis).getTime()) ? millis : null;
}

function timestampIso(value: any): string {
  const millis = timestampMillis(value);
  return millis === null ? new Date().toISOString() : new Date(millis).toISOString();
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
  return Math.abs(parsed) > 0 && Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
}

function optionalPercent(value: any): number | null {
  const parsed = optionalNumber(value);
  if (parsed === null) return null;
  return Math.abs(parsed) > 0 && Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
}

function isClosed15mCandle(value: any, now = Date.now()): boolean {
  const millis = timestampMillis(value);
  if (millis === null) return false;
  const lastClosedBoundary = Math.floor(now / ENTRY_INTERVAL_MS) * ENTRY_INTERVAL_MS;
  return millis <= lastClosedBoundary;
}

function costTier(spreadPct: number | null): "LOW" | "MEDIUM" | "HIGH" {
  if (spreadPct === null) return "HIGH";
  if (spreadPct <= 0.03) return "LOW";
  if (spreadPct <= 0.05) return "MEDIUM";
  return "HIGH";
}

function integrityFailures(params: {
  signalCandleTime: any;
  spreadPct: number | null;
  atr15m: number | null;
  volumeRatio: number | null;
}): string[] {
  const failures: string[] = [];
  if (!isClosed15mCandle(params.signalCandleTime)) failures.push("Missing or unclosed 15m signal candle");
  if (params.spreadPct === null) failures.push("Spread metric unavailable");
  else if (params.spreadPct > MAX_SPREAD_PCT) failures.push(`Spread ${params.spreadPct.toFixed(3)}% exceeds ${MAX_SPREAD_PCT}%`);
  if (params.atr15m === null || params.atr15m <= 0) failures.push("ATR 15m metric unavailable or non-positive");
  if (params.volumeRatio === null || params.volumeRatio < MIN_VOLUME_RATIO) failures.push(`Volume ratio below ${MIN_VOLUME_RATIO.toFixed(1)}x or unavailable`);
  return failures;
}

function executionReadiness(
  setup: AnyRecord,
  executionBlocked: boolean,
  failures: string[],
): "EXECUTABLE" | "NOT_EXECUTABLE" | "BLOCKED" | "PENDING_RISK" | "ERROR" {
  const status = stringValue(setup?.status).toUpperCase();
  const execution = stringValue(setup?.executionStatus).toUpperCase();
  if (execution.includes("ERROR") || execution.includes("FAIL")) return "ERROR";
  if (execution.includes("BLOCK") || status === "BLOCKED") return "BLOCKED";
  if (failures.length > 0) return "BLOCKED";
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
    headers: { Accept: "application/json", Authorization: `Bearer ${ADMIN_TOKEN}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let payload: any = {};
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = { error: text }; }
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
      const indicators = setup?.indicators || {};
      const signalCandleTime = setup?.signalCandleTime ?? indicators?.signalCandleTime ?? null;
      const spreadPct = optionalPercent(setup?.costGate?.spreadPct ?? market?.spreadPct);
      const atr15m = optionalPercent(market?.atr15mPct ?? setup?.atr15mPct ?? indicators?.atr15mPct);
      const volumeRatio = optionalNumber(market?.volumeRatio ?? setup?.volumeRatio ?? indicators?.volumeRatio);
      const failures = integrityFailures({ signalCandleTime, spreadPct, atr15m, volumeRatio });
      const readiness = executionReadiness(setup, executionBlocked, failures);
      const setupReason = stringValue(setup?.reason || setup?.engineReason || setup?.router?.reason, "No setup reason supplied");
      const readinessReason = failures.length > 0
        ? `Scanner integrity blocked: ${failures.join("; ")}`
        : readiness === "BLOCKED" && executionBlocked
          ? executionBlockReason
          : setupReason;
      const engineStatus = setup?.engineStatus || {};
      const votes = Array.isArray(setup?.strategyVotes) ? setup.strategyVotes : [];
      const normalizedSignal = normalizeSignal(setup?.engineSignal);

      return {
        symbol,
        signal: stringValue(setup?.status).toUpperCase() === "CONFIRMED" && failures.length === 0 ? normalizedSignal : "WAIT",
        routerReason: stringValue(setup?.engineReason || setup?.router?.reason, setupReason),
        change24hPct: numberValue(market?.changePct, 0),
        turnoverUsdt: numberValue(market?.turnover24h, 0),
        spreadPct: spreadPct ?? 0,
        atr15m: atr15m ?? 0,
        volumeRatio: volumeRatio ?? 0,
        costTier: costTier(spreadPct),
        routerConfidencePct: percentValue(setup?.router?.confidence),
        signalCandleTime,
        executionReadiness: readiness,
        readinessReason,
        dataQuality: {
          status: failures.length === 0 ? "PASS" : "DEGRADED",
          failures,
          closed15mCandle: isClosed15mCandle(signalCandleTime),
          spreadAvailable: spreadPct !== null,
          atr15mAvailable: atr15m !== null && atr15m > 0,
          volumeRatioAvailable: volumeRatio !== null,
        },
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
          closedSignalCandleTimestamp: signalCandleTime,
        },
        pipelineStatuses: {
          marketDataStatus: failures.length > 0 ? "degraded" : stringValue(engineStatus?.marketData, "unknown"),
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
    const completed = signals.filter((row: AnyRecord) => row.dataQuality.status === "PASS").length;
    const degraded = signals.length - completed;
    const lastBatch = setupsRaw?.lastBatch || {};
    const rejected = numberValue(lastBatch?.noSetup, 0) + numberValue(lastBatch?.skipped, 0) + degraded;
    const normalizedMarketSpreads = marketRows
      .map((row: AnyRecord) => optionalPercent(row?.spreadPct))
      .filter((value: number | null): value is number => value !== null);

    sendJson(res, 200, {
      summary: {
        totalContracts: numberValue(symbolsRaw?.totalUniverse, activeSymbols.length),
        validUsdtContracts: activeSymbols.length,
        spreadPassed: normalizedMarketSpreads.filter((value: number) => value <= MAX_SPREAD_PCT).length,
        liquidityPassed: marketRows.filter((row: AnyRecord) => numberValue(row?.turnover24h, 0) >= 1_500_000).length,
        enriched: marketRows.length,
        shortlisted: activeSymbols.length,
        deepScanned: signals.length,
        completed,
        degraded,
        rejected,
        timedOut: 0,
        scanDurationMs: Date.now() - started,
        lastUpdated: timestampIso(setupsRaw?.lastRunAt || symbolsRaw?.updatedAt),
        entryTimeframe: "15m",
        routerMode: stringValue(setupsRaw?.routerMode || setupsRaw?.mode || setupRows[0]?.router?.mode, "unknown"),
        universeLabel: "Live worker-selected Bybit Demo universe",
        bybitMode: "Bybit Demo API",
      },
      policy: {
        shortlistSize: activeSymbols.length,
        deepScanSize: numberValue(setupsRaw?.batchSize, signals.length),
        normalSpreadThresholdPct: 0.03,
        reducedSizeSpreadThresholdPct: 0.05,
        maxSpreadThresholdPct: MAX_SPREAD_PCT,
        minTurnoverUsdt: 1_500_000,
        minAtr15m: 0.000001,
        maxAtr15m: 100,
        minVolumeRatio: MIN_VOLUME_RATIO,
        minGrossRR: 1.8,
        minNetRR: 1.5,
        preferredNetRR: 2.2,
        normalCostToRiskLimitPct: 5,
        maxCostToRiskLimitPct: 10,
        refreshIntervalSec: 30,
        scanDeadlineMs: 20_000,
        failClosedIntegrity: true,
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
