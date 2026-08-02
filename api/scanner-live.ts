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

function numberValue(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: any, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function normalizeSignal(value: any): "Buy" | "Sell" | "WAIT" | "Blocked" | "Error" {
  const text = stringValue(value, "WAIT").trim().toLowerCase();
  if (text === "buy" || text === "long") return "Buy";
  if (text === "sell" || text === "short") return "Sell";
  if (text.includes("block")) return "Blocked";
  if (text.includes("error") || text.includes("fail")) return "Error";
  return "WAIT";
}

function executionReadiness(signal: string, row: AnyRecord): "EXECUTABLE" | "NOT_EXECUTABLE" | "BLOCKED" | "PENDING_RISK" | "ERROR" {
  const supplied = stringValue(row?.executionReadiness).toUpperCase();
  if (["EXECUTABLE", "NOT_EXECUTABLE", "BLOCKED", "PENDING_RISK", "ERROR"].includes(supplied)) {
    return supplied as "EXECUTABLE" | "NOT_EXECUTABLE" | "BLOCKED" | "PENDING_RISK" | "ERROR";
  }
  if (signal === "Blocked") return "BLOCKED";
  if (signal === "Error") return "ERROR";
  if (signal === "Buy" || signal === "Sell") return "PENDING_RISK";
  return "NOT_EXECUTABLE";
}

function costTier(value: any): "LOW" | "MEDIUM" | "HIGH" {
  const text = stringValue(value, "blocked").toLowerCase();
  if (["low", "normal"].includes(text)) return "LOW";
  if (["medium", "reduced", "strong_only"].includes(text)) return "MEDIUM";
  return "HIGH";
}

async function backendJson(path: string): Promise<any> {
  if (!ADMIN_TOKEN) {
    const error = new Error("Vercel server is missing BACKEND_ADMIN_TOKEN.");
    (error as any).status = 503;
    throw error;
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
    const error = new Error(
      stringValue(payload?.error || payload?.reason || payload?.message, `Backend request failed (${response.status})`),
    );
    (error as any).status = response.status;
    (error as any).payload = payload;
    throw error;
  }
  return payload;
}

function mapSignal(row: AnyRecord, entryTimeframe: string): AnyRecord {
  const signal = normalizeSignal(row?.signal);
  const router = row?.router || {};
  const indicators = row?.indicators || {};
  const engineStatus = row?.engineStatus || {};
  const votes = Array.isArray(row?.engineVotes) ? row.engineVotes : [];
  const readiness = executionReadiness(signal, row);

  return {
    symbol: stringValue(row?.symbol, "UNKNOWN"),
    signal,
    routerReason: stringValue(row?.reason || router?.reason, "No backend reason supplied"),
    change24hPct: numberValue(row?.changePct),
    turnoverUsdt: numberValue(row?.turnover24h),
    spreadPct: numberValue(row?.spreadPct),
    atr15m: numberValue(row?.atr15mPct),
    volumeRatio: numberValue(row?.volumeRatio),
    costTier: costTier(row?.costTier),
    routerConfidencePct: numberValue(router?.confidence),
    signalCandleTime: indicators?.signalCandleTime ?? null,
    executionReadiness: readiness,
    readinessReason: stringValue(
      row?.readinessReason || row?.reason || router?.reason,
      readiness === "PENDING_RISK"
        ? "Signal is waiting for the canonical backend risk and execution gates."
        : "No executable backend signal.",
    ),
    strategyVotes: votes.map((vote: AnyRecord, index: number) => ({
      engineName: stringValue(vote?.engineName || vote?.engine || vote?.name, `Strategy ${index + 1}`),
      voteSignal: normalizeSignal(vote?.signal || vote?.voteSignal),
      voteReason: stringValue(vote?.reason || vote?.voteReason, "No backend reason supplied"),
      voteStrengthPct: numberValue(vote?.strength || vote?.confidence || vote?.voteStrengthPct),
    })),
    indicators: {
      trend1h: stringValue(indicators?.trendDirection1H || indicators?.trend1h, "Unknown"),
      rsi15m: numberValue(indicators?.rsi15M || indicators?.rsi15m),
      rsi5m: numberValue(indicators?.rsi5M || indicators?.rsi5m),
      ema20_1h: numberValue(indicators?.ema20_1H || indicators?.ema20_1h),
      ema50_1h: numberValue(indicators?.ema50_1H || indicators?.ema50_1h),
      entryTimeframe: `${stringValue(indicators?.entryInterval, entryTimeframe).replace(/m$/i, "")}m`,
      closedSignalCandleTimestamp: indicators?.signalCandleTime ?? null,
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
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (stringValue(req?.method, "GET").toUpperCase() !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const started = Date.now();
  try {
    const requestedMode = stringValue(req?.query?.mode, "balanced").toLowerCase();
    const requestedInterval = stringValue(req?.query?.interval, "15").replace(/m$/i, "");
    const raw = await backendJson(
      `/api/bot/scanner?interval=${encodeURIComponent(requestedInterval)}&mode=${encodeURIComponent(requestedMode)}`,
    );

    const rows = Array.isArray(raw?.rows) ? raw.rows : [];
    const universe = raw?.universe || {};
    const metrics = universe?.metrics || {};
    const scanMeta = raw?.scanMeta || {};
    const policy = universe?.policy || raw?.policy || {};
    const entryTimeframe = `${stringValue(raw?.interval, requestedInterval).replace(/m$/i, "")}m`;
    const updatedAt = numberValue(universe?.updatedAt, 0);

    sendJson(res, 200, {
      summary: {
        totalContracts: numberValue(metrics?.totalContracts, rows.length),
        validUsdtContracts: numberValue(metrics?.validUsdt, rows.length),
        spreadPassed: numberValue(metrics?.spreadPassed),
        liquidityPassed: numberValue(metrics?.liquidityPassed),
        enriched: numberValue(metrics?.enriched),
        shortlisted: numberValue(metrics?.shortlisted, scanMeta?.shortlistSize || rows.length),
        deepScanned: numberValue(metrics?.deepScan, scanMeta?.deepScanSize || rows.length),
        completed: numberValue(scanMeta?.completed, rows.length),
        rejected: numberValue(scanMeta?.rejected),
        timedOut: scanMeta?.timedOut ? 1 : 0,
        scanDurationMs: Date.now() - started,
        lastUpdated: updatedAt > 0
          ? new Date(updatedAt < 10_000_000_000 ? updatedAt * 1000 : updatedAt).toISOString()
          : "",
        entryTimeframe,
        routerMode: stringValue(raw?.mode, requestedMode),
        universeLabel: stringValue(universe?.source, "Bybit Demo backend-selected universe"),
        bybitMode: "Bybit Demo API",
      },
      policy: {
        shortlistSize: numberValue(policy?.shortlistSize, scanMeta?.shortlistSize),
        deepScanSize: numberValue(policy?.deepScanSize, scanMeta?.deepScanSize),
        normalSpreadThresholdPct: numberValue(policy?.normalSpreadPct),
        reducedSizeSpreadThresholdPct: numberValue(policy?.reducedSpreadPct),
        maxSpreadThresholdPct: numberValue(policy?.maxSpreadPct),
        minTurnoverUsdt: numberValue(policy?.minimumTurnover),
        minAtr15m: numberValue(policy?.minimumAtrPct),
        maxAtr15m: numberValue(policy?.maximumAtrPct),
        minVolumeRatio: numberValue(policy?.minimumVolumeRatio),
        minGrossRR: numberValue(policy?.minimumGrossRr),
        minNetRR: numberValue(policy?.minimumNetRr),
        preferredNetRR: numberValue(policy?.preferredNetRr),
        normalCostToRiskLimitPct: numberValue(policy?.normalCostRiskPct),
        maxCostToRiskLimitPct: numberValue(policy?.maximumCostRiskPct),
        refreshIntervalSec: numberValue(raw?.topGainerRefreshSeconds, policy?.refreshSeconds),
        scanDeadlineMs: numberValue(scanMeta?.deadlineSeconds, policy?.deadlineSeconds) * 1000,
      },
      signals: rows.map((row: AnyRecord) => mapSignal(row, entryTimeframe)),
    });
  } catch (error: any) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    sendJson(res, timeout ? 504 : numberValue(error?.status, 502), {
      error: timeout
        ? "Google Cloud Run backend timed out. Retry after checking backend readiness."
        : stringValue(error?.message, "Unable to load canonical scanner data"),
      upstream: error?.payload,
    });
  }
}
