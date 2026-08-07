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

function text(value: any, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function rows(value: any): AnyRecord[] {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === "object") : [];
}

function percentToRatio(value: any): number {
  return numberValue(value) / 100;
}

async function backendJson(path: string): Promise<any> {
  if (!ADMIN_TOKEN) {
    const error = new Error("Cloud Run frontend is missing BACKEND_ADMIN_TOKEN.");
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
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(text(body?.error || body?.reason || body?.message, `Backend request failed (${response.status})`));
    (error as any).status = response.status;
    (error as any).payload = body;
    throw error;
  }
  return body;
}

function bySymbol(input: AnyRecord[]): Map<string, AnyRecord> {
  return new Map(input.map((row) => [text(row?.symbol).toUpperCase(), row]));
}

function byCandidate(input: AnyRecord[]): Map<string, AnyRecord> {
  return new Map(
    input
      .filter((row) => text(row?.candidateKey || row?.candidate_key))
      .map((row) => [text(row?.candidateKey || row?.candidate_key), row]),
  );
}

function currentCycle(snapshot: AnyRecord, field: string, expected: number): boolean {
  return expected > 0 && numberValue(snapshot?.[field]) === expected;
}

function normalizedVotes(classification: AnyRecord): AnyRecord[] {
  return rows(classification?.strategyVotes).map((vote, index) => ({
    engineName: text(vote?.engine || vote?.engineName, `Strategy ${index + 1}`),
    voteSignal: ["Buy", "Sell", "WAIT", "Blocked", "Error"].includes(text(vote?.signal)) ? text(vote?.signal) : "WAIT",
    voteReason: text(vote?.reason, "No authoritative strategy reason supplied"),
    voteStrengthPct: numberValue(vote?.strength ?? vote?.gradeScore),
  }));
}

function mapAuthoritativeRow(
  classification: AnyRecord,
  market: AnyRecord,
  five: AnyRecord | undefined,
  risk: AnyRecord | undefined,
  sizing: AnyRecord | undefined,
  command: AnyRecord | undefined,
): AnyRecord {
  const fiveStatus = text(five?.status).toUpperCase();
  const riskStatus = text(risk?.riskStatus).toUpperCase();
  const sizingStatus = text(sizing?.positionSizingStatus || sizing?.status).toUpperCase();
  const commandState = text(command?.state || command?.status).toUpperCase();

  let signal: "Buy" | "Sell" | "WAIT" | "Blocked" | "Error" = "WAIT";
  if (fiveStatus === "ERROR") signal = "Error";
  else if (["SETUP_INVALIDATED", "BLOCKED_GRADE"].includes(fiveStatus) || riskStatus === "BLOCKED_RISK" || sizingStatus.includes("BLOCK")) signal = "Blocked";
  else if (fiveStatus === "ENTRY_CONFIRMED") signal = text(five?.side) === "Sell" ? "Sell" : "Buy";

  let executionReadiness: "EXECUTABLE" | "NOT_EXECUTABLE" | "BLOCKED" | "PENDING_RISK" | "ERROR" = "NOT_EXECUTABLE";
  let readinessReason = text(five?.reason || classification?.reason, "Awaiting authoritative closed-candle confirmation");
  if (signal === "Error") {
    executionReadiness = "ERROR";
  } else if (signal === "Blocked") {
    executionReadiness = "BLOCKED";
    readinessReason = text(risk?.riskDecision?.reason || sizing?.reason || five?.reason || classification?.reason, "Authoritative execution guard blocked this setup");
  } else if (command && !["FAILED", "CLOSED"].includes(commandState)) {
    executionReadiness = "EXECUTABLE";
    readinessReason = `Durable execution command is ${commandState || "PUBLISHED"}`;
  } else if (fiveStatus === "ENTRY_CONFIRMED") {
    executionReadiness = "PENDING_RISK";
    readinessReason = risk
      ? text(risk?.riskDecision?.reason, "Authoritative risk evaluated; awaiting downstream execution approval")
      : "Closed 5M entry confirmed; awaiting authoritative risk evaluation";
  }

  const indicators = classification?.indicators || five?.indicators || {};
  const router = classification?.router || five?.router || {};
  const backendTier = text(market?.costTier).toUpperCase();
  const costTier: "LOW" | "MEDIUM" | "HIGH" = ["LOW", "MEDIUM", "HIGH"].includes(backendTier)
    ? (backendTier as "LOW" | "MEDIUM" | "HIGH")
    : "HIGH";
  const signalCandleTime = numberValue(five?.entryFiveMinuteCandleTime || five?.observedFiveMinuteCandleTime || classification?.fifteenMinuteCandleTime, 0) || null;

  return {
    symbol: text(classification?.symbol, "UNKNOWN"),
    signal,
    routerReason: text(risk?.riskDecision?.reason || sizing?.reason || five?.reason || classification?.reason, "No authoritative reason supplied"),
    change24hPct: 0,
    turnoverUsdt: numberValue(market?.turnover24h),
    spreadPct: percentToRatio(market?.spreadPct),
    atr15m: 0,
    volumeRatio: 0,
    costTier,
    routerConfidencePct: numberValue(five?.entryGradeScore || classification?.gradeScore || router?.confidence),
    signalCandleTime,
    executionReadiness,
    readinessReason,
    strategyVotes: normalizedVotes(classification),
    indicators: {
      trend1h: text(classification?.watchlistTrend || market?.oneHourTrend || market?.trend, "Unknown"),
      rsi15m: numberValue(indicators?.rsi15M || indicators?.rsi15m),
      rsi5m: numberValue(indicators?.rsi5M || indicators?.rsi5m),
      ema20_1h: numberValue(indicators?.ema20_1H || indicators?.ema20_1h),
      ema50_1h: numberValue(indicators?.ema50_1H || indicators?.ema50_1h),
      entryTimeframe: "5m",
      closedSignalCandleTimestamp: signalCandleTime,
    },
    pipelineStatuses: {
      marketDataStatus: "authoritative",
      indicatorStatus: text(classification?.engineStatus?.indicator, "authoritative"),
      strategyStatus: text(classification?.status, "unknown"),
      routerStatus: text(classification?.engineStatus?.router, "unknown"),
      riskStatus: riskStatus || (fiveStatus === "ENTRY_CONFIRMED" ? "PENDING_RISK" : "NOT_REACHED"),
      tradeManagementStatus: commandState || "NOT_REACHED",
      journalStatus: command ? "PENDING_EXECUTION_LEDGER" : "NOT_REACHED",
    },
  };
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (text(req?.method, "GET").toUpperCase() !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const started = Date.now();
  try {
    // Single source of truth: the scanner UI reads the exact staged runtime
    // snapshots that feed Risk -> Sizing -> PostgreSQL Outbox -> Node Execution.
    // It deliberately does NOT call /api/bot/scanner or independently run evaluate_signal().
    const status = await backendJson("/api/workers/status");
    const runtime = status?.runtime || {};

    const daily = runtime?.dailyUniverse || {};
    const fourHour = runtime?.fourHourDirectionalPool || {};
    const oneHour = runtime?.hourlyWatchlist || {};
    const classification = runtime?.fifteenMinuteStrategyClassification || {};
    const five = runtime?.fiveMinuteEntryConfirmation || {};
    const risk = runtime?.authoritativeEntryRisk || {};
    const sizing = runtime?.positionSizingMargin || {};
    const outbox = runtime?.executionCommandOutbox?.snapshot || runtime?.executionCommandOutbox || {};

    const classificationCandle = numberValue(classification?.fifteenMinuteCandleTime);
    const fiveAligned = currentCycle(five, "setupFifteenMinuteCandleTime", classificationCandle);
    const fiveCandle = fiveAligned ? numberValue(five?.fiveMinuteCandleTime) : 0;
    const riskAligned = fiveCandle > 0 && currentCycle(risk, "fiveMinuteCandleTime", fiveCandle);

    const marketMap = bySymbol(rows(oneHour?.rows));
    const fiveMap = bySymbol(fiveAligned ? rows(five?.rows) : []);
    const riskMap = byCandidate(riskAligned ? rows(risk?.rows) : []);
    const sizingMap = byCandidate(riskAligned ? rows(sizing?.rows) : []);
    const commandMap = byCandidate(rows(outbox?.rows || outbox?.commands));

    const canonicalRows = rows(classification?.rows).map((row) => {
      const symbol = text(row?.symbol).toUpperCase();
      const fiveRow = fiveMap.get(symbol);
      const candidateKey = text(fiveRow?.candidateKey);
      return mapAuthoritativeRow(
        row,
        marketMap.get(symbol) || {},
        fiveRow,
        candidateKey ? riskMap.get(candidateKey) : undefined,
        candidateKey ? sizingMap.get(candidateKey) : undefined,
        candidateKey ? commandMap.get(candidateKey) : undefined,
      );
    });

    const dailyRows = rows(daily?.rows);
    const fourHourRows = rows(fourHour?.rows);
    const oneHourRows = rows(oneHour?.rows);
    const fiveRows = fiveAligned ? rows(five?.rows) : [];
    const riskRows = riskAligned ? rows(risk?.rows) : [];
    const blockedRisk = riskRows.filter((row) => text(row?.riskStatus).toUpperCase() === "BLOCKED_RISK").length;
    const commandRows = rows(outbox?.rows || outbox?.commands);
    const latestUpdated = Math.max(
      numberValue(classification?.updatedAt),
      fiveAligned ? numberValue(five?.updatedAt) : 0,
      riskAligned ? numberValue(risk?.updatedAt) : 0,
      numberValue(sizing?.updatedAt),
      numberValue(outbox?.updatedAt),
    );

    sendJson(res, 200, {
      summary: {
        totalContracts: numberValue(daily?.metrics?.eligibleInput, dailyRows.length),
        validUsdtContracts: dailyRows.length,
        spreadPassed: fourHourRows.length,
        liquidityPassed: oneHourRows.length,
        enriched: canonicalRows.length,
        shortlisted: numberValue(classification?.metrics?.setupClassified),
        deepScanned: fiveRows.length,
        completed: riskRows.length,
        rejected: blockedRisk,
        timedOut: commandRows.length,
        scanDurationMs: Date.now() - started,
        lastUpdated: latestUpdated > 0 ? new Date(latestUpdated * 1000).toISOString() : "",
        entryTimeframe: "15m setup -> closed 5m confirmation",
        routerMode: "authoritative",
        universeLabel: "AUTHORITATIVE_EXECUTION_PIPELINE",
        bybitMode: "Bybit Demo API",
      },
      policy: {
        shortlistSize: oneHourRows.length,
        deepScanSize: numberValue(classification?.metrics?.setupClassified),
        normalSpreadThresholdPct: 0,
        reducedSizeSpreadThresholdPct: 0,
        maxSpreadThresholdPct: 0,
        minTurnoverUsdt: 0,
        minAtr15m: 0,
        maxAtr15m: 0,
        minVolumeRatio: 0,
        minGrossRR: 0,
        minNetRR: 0,
        preferredNetRR: 0,
        normalCostToRiskLimitPct: 0,
        maxCostToRiskLimitPct: 0,
        refreshIntervalSec: numberValue(runtime?.settings?.setupIntervalSeconds, 300),
        scanDeadlineMs: 0,
      },
      signals: canonicalRows,
      canonical: {
        source: "/api/workers/status",
        classificationCandleTime: classificationCandle || null,
        fiveMinuteCandleTime: fiveCandle || null,
        fiveMinuteAligned: fiveAligned,
        riskAligned,
        executionPath: "Daily Top100 -> 4H Top50 -> 1H Top20 -> 15M -> 5M -> Risk -> Sizing -> PostgreSQL -> Node",
      },
    });
  } catch (error: any) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    sendJson(res, timeout ? 504 : numberValue(error?.status, 502), {
      error: timeout
        ? "Google Cloud Run backend timed out while loading authoritative execution snapshots."
        : text(error?.message, "Unable to load authoritative scanner/execution truth"),
      upstream: error?.payload,
    });
  }
}
