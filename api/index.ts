declare const process: { env: Record<string, string | undefined> };

type AnyRecord = Record<string, any>;
type RequestLike = any;
type ResponseLike = any;

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

function boolValue(value: any, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (["true", "yes", "1", "ready", "ok", "healthy", "enabled", "postgresql"].includes(text)) return true;
    if (["false", "no", "0", "degraded", "error", "disabled", "none", "null"].includes(text)) return false;
  }
  return fallback;
}

function timestampIso(value: any): string {
  const numeric = numberValue(value, 0);
  if (numeric > 0) {
    const millis = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const date = new Date(stringValue(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function readRequestBody(req: RequestLike): Promise<any> {
  if (req.body !== undefined) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch {
        return {};
      }
    }
    return req.body || {};
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    if (typeof chunk === "string") chunks.push(new TextEncoder().encode(chunk));
    else chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  const text = new TextDecoder().decode(merged);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new UpstreamError(400, "Invalid JSON request body");
  }
}

function requestPath(req: RequestLike): { route: string; search: URLSearchParams } {
  const parsed = new URL(req.url || "/api/index", "https://vercel.local");
  const captured = parsed.searchParams.get("path");
  const directPath = parsed.pathname.replace(/^\/api\/?/, "");
  const route = (captured || (directPath === "index" ? "" : directPath))
    .replace(/^\/+|\/+$/g, "");
  parsed.searchParams.delete("path");
  return { route, search: parsed.searchParams };
}

async function backendJson(
  path: string,
  init: RequestInit = {},
  requireAuth = true,
): Promise<any> {
  if (requireAuth && !ADMIN_TOKEN) {
    throw new UpstreamError(
      503,
      "Vercel server is missing BACKEND_ADMIN_TOKEN. Configure it as a server-side environment variable.",
    );
  }

  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (ADMIN_TOKEN) headers.set("Authorization", `Bearer ${ADMIN_TOKEN}`);

  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers,
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

function pickDurableObject(raw: AnyRecord, bot: AnyRecord): AnyRecord {
  const candidates = [
    raw?.claimStore,
    raw?.execution?.claimStore,
    raw?.workerExecution?.claimStore,
    raw?.durableState,
    raw?.durableStateStatus,
    raw?.durable,
    raw?.stateStore,
    raw?.persistentState,
    raw?.persistence,
    bot?.claimStore,
    bot?.execution?.claimStore,
    bot?.durableState,
    bot?.durableStateStatus,
    bot?.durable,
    raw,
    bot,
  ];
  return candidates.find((value) => value && typeof value === "object") || {};
}

function readinessStatus(value: any): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return stringValue(value.status || value.state || value.readiness, "unknown");
  return "unknown";
}

function durableTruth(raw: AnyRecord, bot: AnyRecord) {
  const durable = pickDurableObject(raw, bot);
  const backend = stringValue(
    raw?.claimStore?.backend || raw?.execution?.claimStore?.backend || raw?.backend || raw?.storageBackend || durable?.backend || durable?.storageBackend || durable?.driver || durable?.type,
    "unknown",
  ).toLowerCase();
  const status = stringValue(
    raw?.status || raw?.state || raw?.durableState || durable?.status || durable?.state || durable?.readiness,
    "unknown",
  ).toLowerCase();
  const executionReadiness = readinessStatus(raw?.executionReadiness || raw?.workerExecution?.executionReadiness || durable?.executionReadiness || bot?.executionReadiness);
  const startupReconciliation = readinessStatus(
    raw?.startupReconciliation || durable?.startupReconciliation || bot?.startupReconciliation,
  );
  const persistentPathConfigured = boolValue(
    raw?.claimStore?.persistentPathConfigured ?? raw?.execution?.claimStore?.persistentPathConfigured ?? raw?.persistentPathConfigured ?? raw?.persistentConfigured ?? durable?.persistentPathConfigured ?? durable?.persistentConfigured,
    backend === "postgresql" || backend === "postgres",
  );
  const restartSafe = boolValue(
    raw?.claimStore?.restartSafe ?? raw?.execution?.claimStore?.restartSafe ?? raw?.restartSafe ?? durable?.restartSafe ?? raw?.restart_safe ?? durable?.restart_safe,
    backend === "postgresql" || backend === "postgres",
  );
  const degraded = boolValue(
    raw?.claimStore?.degraded ?? raw?.execution?.claimStore?.degraded ?? raw?.degraded ?? durable?.degraded ?? raw?.stateDegraded ?? durable?.stateDegraded,
    status === "degraded" || status === "error" || status === "blocked",
  );
  const automaticExecutionAllowed = boolValue(
    raw?.automaticExecutionAllowed ?? durable?.automaticExecutionAllowed ?? bot?.automaticExecutionAllowed,
    false,
  );
  const readyByStatus = ["ready", "persistent", "ok", "healthy"].includes(status);
  const readyByBackend = (backend === "postgresql" || backend === "postgres") && persistentPathConfigured && restartSafe && !degraded;
  const readyByExecution = ["ready", "ok", "healthy"].includes(executionReadiness.toLowerCase());
  const durableState = (!degraded && (readyByBackend || readyByStatus || readyByExecution)) ? "PERSISTENT" : "DEGRADED";

  return {
    durableState,
    durableBackend: backend === "postgres" ? "postgresql" : backend,
    persistentPathConfigured,
    stateDegraded: durableState === "DEGRADED",
    databasePath: backend === "postgresql" || backend === "postgres"
      ? "PostgreSQL / DATABASE_URL"
      : stringValue(raw?.databasePath || durable?.databasePath || durable?.path, persistentPathConfigured ? "Persistent backend" : "Memory / LocalStorage Fallback"),
    journalPersistenceStatus: durableState === "PERSISTENT"
      ? (backend === "postgresql" || backend === "postgres" ? "POSTGRESQL" : "ACTIVE")
      : "LOCAL FALLBACK",
    restartSafe,
    automaticExecutionAllowed,
    startupReconciliationStatus: startupReconciliation,
    executionReadinessStatus: executionReadiness,
    migrationVersion: raw?.claimStore?.migrationVersion ?? raw?.execution?.claimStore?.migrationVersion ?? raw?.migrationVersion ?? durable?.migrationVersion ?? null,
    requiredMigrationVersion: raw?.requiredMigrationVersion ?? durable?.requiredMigrationVersion ?? null,
    durableError: raw?.error || durable?.error || null,
  };
}

function adaptStatus(raw: AnyRecord, latencyMs: number) {
  const bot = raw?.bot || raw || {};
  const lastRunAt = bot.lastRunAt || bot.lastScanAt || bot.updatedAt || raw?.checkedAt || Date.now();
  const durable = durableTruth(raw, bot);
  return {
    isRunning: Boolean(bot.enabled || bot.threadAlive || raw?.threadAlive),
    bybitMode: "BYBIT_DEMO",
    backendConnected: true,
    lastScanTime: timestampIso(lastRunAt),
    nextScanSeconds: numberValue(bot.scanSeconds || raw?.settings?.symbolIntervalSeconds, 30),
    apiLatencyMs: latencyMs,
    ...durable,
    routerMode: stringValue(bot.mode || bot.router?.mode || raw?.mode, "balanced"),
    version: stringValue(bot.engineOverview?.version || raw?.serverVersion || bot.version, "v2-demo"),
    authConfigured: Boolean(ADMIN_TOKEN),
  };
}

function positionRows(raw: AnyRecord): AnyRecord[] {
  const rows = raw?.result?.list;
  return Array.isArray(rows) ? rows : [];
}

function adaptPosition(row: AnyRecord, index: number) {
  const side = stringValue(row.side).toLowerCase() === "sell" ? "SHORT" : "LONG";
  const margin = numberValue(row.positionIM || row.positionBalance || row.positionMM, 0);
  const floating = numberValue(row.unrealisedPnl || row.unrealizedPnl, 0);
  return {
    id: stringValue(row.positionIdx || row.positionId, `${row.symbol || "UNKNOWN"}:${row.side || ""}:${index}`),
    symbol: stringValue(row.symbol, "UNKNOWN"),
    side,
    leverage: numberValue(row.leverage, 0),
    size: Math.abs(numberValue(row.size, 0)),
    notionalUsdt: numberValue(row.positionValue, 0),
    entryPrice: numberValue(row.avgPrice || row.entryPrice, 0),
    markPrice: numberValue(row.markPrice, 0),
    liquidationPrice: numberValue(row.liqPrice || row.liquidationPrice, 0),
    floatingPnL: floating,
    pnlPercent: margin > 0 ? (floating / margin) * 100 : 0,
    marginUsdt: margin,
    stopLoss: numberValue(row.stopLoss, 0),
    takeProfit: numberValue(row.takeProfit, 0),
    openedAt: timestampIso(row.createdTime || row.updatedTime || Date.now()),
  };
}

function adaptLog(entry: AnyRecord, index: number) {
  const event = stringValue(entry.event, "runtime");
  const payload = entry.payload || {};
  const result = payload.result || {};
  const reason = stringValue(
    payload.reason || result.retMsg || payload.message || payload.error || event.replaceAll("_", " "),
  );
  const lower = `${event} ${reason}`.toLowerCase();
  const level = lower.includes("error") || lower.includes("failed") || lower.includes("rejected")
    ? "ERROR"
    : lower.includes("blocked") || lower.includes("cancelled")
      ? "BLOCKED"
      : lower.includes("wait") || lower.includes("pending")
        ? "WAIT"
        : "PASS";
  return {
    id: stringValue(entry.id, `${entry.time || Date.now()}-${index}`),
    timestamp: timestampIso(entry.time || entry.timestamp || Date.now()),
    level,
    category: event,
    message: reason,
  };
}

function lifecycleLevel(entry: AnyRecord): "PASS" | "WAIT" | "BLOCKED" | "ERROR" | "DEGRADED" {
  const event = stringValue(entry.event).toLowerCase();
  const result = entry.payload?.result || {};
  const reason = stringValue(result.retMsg || entry.payload?.reason).toLowerCase();
  if (event.includes("error") || reason.includes("error") || reason.includes("failed")) return "ERROR";
  if (event.includes("blocked") || event.includes("cancelled") || reason.includes("blocked")) return "BLOCKED";
  if (event.includes("pending") || event.includes("wait") || reason.includes("pending")) return "WAIT";
  if (event.includes("degraded") || reason.includes("degraded")) return "DEGRADED";
  return result.retCode !== undefined && numberValue(result.retCode) !== 0 ? "ERROR" : "PASS";
}

function adaptLifecycle(entry: AnyRecord, index: number) {
  const payload = entry.payload || {};
  const result = payload.result || {};
  const finalStatus = lifecycleLevel(entry);
  const signal = stringValue(payload.signal || payload.side, "Buy");
  const symbol = stringValue(payload.symbol || payload.requestedSymbol || result?.result?.symbol, "UNKNOWN");
  const reason = stringValue(result.retMsg || payload.reason || entry.event, "Runtime event");
  return {
    id: stringValue(result?.result?.orderId || result?.result?.orderLinkId, `${entry.time || Date.now()}-${index}`),
    timestamp: timestampIso(entry.time || Date.now()),
    symbol,
    side: signal.toLowerCase().includes("sell") || signal.toLowerCase().includes("short") ? "SHORT" : "LONG",
    timeframe: stringValue(payload.interval || payload.timeframe, "5m"),
    signal: {
      price: numberValue(payload.price || result?.result?.avgPrice, 0),
      condition: reason,
      confidence: numberValue(payload.confidence || payload.router?.confidence, 0),
      scanScore: numberValue(payload.score, 0),
    },
    guard: {
      status: finalStatus,
      checksPassed: finalStatus === "PASS" ? ["Canonical backend accepted lifecycle event"] : [],
      blockedReason: finalStatus === "PASS" ? null : reason,
    },
    order: {
      type: stringValue(result?.result?.orderType || payload.orderType, "MARKET"),
      sizeUsdt: numberValue(payload.notionalUsdt || payload.sizeUsdt, 0),
      leverage: numberValue(payload.leverage, 0),
      slippageTolerance: stringValue(payload.slippageTolerance, "Backend controlled"),
    },
    protection: {
      stopLoss: numberValue(payload.stopLoss || payload.stopLossPrice, 0),
      takeProfit: numberValue(payload.takeProfit || payload.takeProfitPrice, 0),
      trailingStop: stringValue(payload.trailingStop, "Backend controlled"),
    },
    finalStatus,
    failureReason: finalStatus === "PASS" ? null : reason,
  };
}

function normalizeSignal(value: any): "Buy" | "Sell" | "WAIT" | "Blocked" | "Error" {
  const text = stringValue(value, "WAIT").toLowerCase();
  if (text === "buy" || text === "long") return "Buy";
  if (text === "sell" || text === "short") return "Sell";
  if (text.includes("block")) return "Blocked";
  if (text.includes("error")) return "Error";
  return "WAIT";
}

function adaptScanner(raw: AnyRecord) {
  const rows = Array.isArray(raw?.rows) ? raw.rows : [];
  const universeRows = Array.isArray(raw?.universe?.rows) ? raw.universe.rows : [];
  const scanMeta = raw?.scanMeta || {};
  const entryTimeframe = `${stringValue(raw?.interval, "5")}m`;
  const signals = rows.map((row: AnyRecord) => {
    const signal = normalizeSignal(row.signal);
    const router = row.router || {};
    const indicators = row.indicators || {};
    const engineStatus = row.engineStatus || {};
    const rawTier = stringValue(row.costTier, "blocked").toLowerCase();
    const costTier = rawTier === "low" || rawTier === "normal"
      ? "LOW"
      : rawTier === "strong_only" || rawTier === "medium"
        ? "MEDIUM"
        : "HIGH";
    const executable = signal === "Buy" || signal === "Sell";
    const votes = Array.isArray(row.engineVotes) ? row.engineVotes : [];
    return {
      symbol: stringValue(row.symbol, "UNKNOWN"),
      signal,
      routerReason: stringValue(row.reason || router.reason, "No router reason supplied"),
      change24hPct: numberValue(row.changePct, 0),
      turnoverUsdt: numberValue(row.turnover24h, 0),
      spreadPct: numberValue(row.spreadPct, 0),
      atr15m: numberValue(row.atr15mPct, 0),
      volumeRatio: numberValue(row.volumeRatio, 0),
      costTier,
      routerConfidencePct: numberValue(router.confidence, 0),
      signalCandleTime: indicators.signalCandleTime ?? null,
      executionReadiness: executable ? "EXECUTABLE" : signal === "Blocked" ? "BLOCKED" : signal === "Error" ? "ERROR" : "NOT_EXECUTABLE",
      readinessReason: stringValue(row.reason || router.reason, "No executable signal"),
      strategyVotes: votes.map((vote: AnyRecord, index: number) => ({
        engineName: stringValue(vote.engineName || vote.engine || vote.name, `Strategy ${index + 1}`),
        voteSignal: normalizeSignal(vote.signal || vote.voteSignal),
        voteReason: stringValue(vote.reason || vote.voteReason, "No reason supplied"),
        voteStrengthPct: numberValue(vote.strength || vote.confidence || vote.voteStrengthPct, 0),
      })),
      indicators: {
        trend1h: stringValue(indicators.trendDirection1H || indicators.trend1h, "Unknown"),
        rsi15m: numberValue(indicators.rsi15M || indicators.rsi15m, 0),
        rsi5m: numberValue(indicators.rsi5M || indicators.rsi5m, 0),
        ema20_1h: numberValue(indicators.ema20_1H || indicators.ema20_1h, 0),
        ema50_1h: numberValue(indicators.ema50_1H || indicators.ema50_1h, 0),
        entryTimeframe: stringValue(indicators.entryInterval, entryTimeframe),
        closedSignalCandleTimestamp: indicators.signalCandleTime ?? null,
      },
      pipelineStatuses: {
        marketDataStatus: stringValue(engineStatus.marketData, "unknown"),
        indicatorStatus: stringValue(engineStatus.indicator, "unknown"),
        strategyStatus: stringValue(engineStatus.strategy, "unknown"),
        routerStatus: stringValue(engineStatus.router, "unknown"),
        riskStatus: stringValue(engineStatus.risk, "unknown"),
        tradeManagementStatus: stringValue(engineStatus.tradeManagement, "unknown"),
        journalStatus: stringValue(engineStatus.journal, "unknown"),
      },
    };
  });

  return {
    summary: {
      totalContracts: numberValue(raw?.universe?.totalContracts || universeRows.length, universeRows.length),
      validUsdtContracts: numberValue(raw?.universe?.validUsdtContracts || universeRows.length, universeRows.length),
      spreadPassed: universeRows.filter((row: AnyRecord) => numberValue(row.spreadPct, 999) <= 0.14).length,
      liquidityPassed: universeRows.filter((row: AnyRecord) => numberValue(row.turnover24h, 0) >= 1_500_000).length,
      enriched: universeRows.length,
      shortlisted: numberValue(scanMeta.shortlistSize, rows.length),
      deepScanned: numberValue(scanMeta.deepScanSize, rows.length),
      completed: numberValue(scanMeta.completed, rows.length),
      rejected: numberValue(scanMeta.rejected, 0),
      timedOut: scanMeta.timedOut ? 1 : 0,
      scanDurationMs: numberValue(raw?.durationMs, 0),
      lastUpdated: timestampIso(raw?.universe?.updatedAt || Date.now()),
      entryTimeframe,
      routerMode: stringValue(raw?.mode, "balanced"),
      universeLabel: "Bybit Demo liquid top movers",
      bybitMode: "Bybit Demo API",
    },
    policy: {
      shortlistSize: numberValue(scanMeta.shortlistSize, 20),
      deepScanSize: numberValue(scanMeta.deepScanSize, 10),
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
      refreshIntervalSec: numberValue(raw?.scanSeconds, 30),
      scanDeadlineMs: numberValue(scanMeta.deadlineSeconds, 20) * 1000,
    },
    signals,
  };
}

async function handleGet(route: string, search: URLSearchParams, res: ResponseLike): Promise<void> {
  if (route === "status") {
    const started = Date.now();
    const [botStatus, workerExecution] = await Promise.all([
      backendJson("/api/bot/status"),
      backendJson("/api/workers/execution").catch(() => null),
    ]);
    const mergedStatus = {
      ...botStatus,
      workerExecution,
      claimStore: workerExecution?.claimStore,
      executionReadiness: workerExecution?.claimStore?.ok ? "ready" : botStatus?.executionReadiness,
    };
    sendJson(res, 200, adaptStatus(mergedStatus, Date.now() - started));
    return;
  }

  if (route === "account") {
    const [wallet, positions, status] = await Promise.all([
      backendJson("/api/bybit/wallet"),
      backendJson("/api/bybit/positions"),
      backendJson("/api/bot/status"),
    ]);
    const account = wallet?.result?.list?.[0] || {};
    const bot = status?.bot || {};
    const openPositions = positionRows(positions).filter((row) => Math.abs(numberValue(row.size, 0)) > 0);
    const equity = numberValue(account.totalEquity || account.totalWalletBalance, 0);
    const floatingPnL = numberValue(account.totalPerpUPL || account.totalUnrealisedPnl, 0);
    const dailyRisk = bot.dailyRisk || {};
    const tradesToday = numberValue(dailyRisk.tradesToday || bot.tradesToday, 0);
    const winsToday = numberValue(dailyRisk.winsToday || bot.winsToday, 0);
    const lossesToday = numberValue(dailyRisk.lossesToday || bot.lossesToday, 0);
    sendJson(res, 200, {
      equity,
      availableBalance: numberValue(account.totalAvailableBalance || account.totalAvailableBalanceByCoin, 0),
      floatingPnL,
      floatingPnLPercent: equity ? (floatingPnL / equity) * 100 : 0,
      openTradesCount: openPositions.length,
      maxOpenTrades: numberValue(bot.maxOpenPositions, 1),
      dailyRiskUsedPercent: numberValue(dailyRisk.usedPct || dailyRisk.lossPct || bot.dailyRiskUsedPercent, 0),
      maxDailyRiskPercent: numberValue(bot.dailyLossCapPct || bot.maxDailyRiskPercent, 0),
      tradesTodayCount: tradesToday,
      winsToday,
      lossesToday,
      winRatePercent: tradesToday ? (winsToday / tradesToday) * 100 : 0,
    });
    return;
  }

  if (route === "positions") {
    const raw = await backendJson("/api/bybit/positions");
    const positions = positionRows(raw)
      .filter((row) => Math.abs(numberValue(row.size, 0)) > 0)
      .map(adaptPosition);
    sendJson(res, 200, positions);
    return;
  }

  if (route === "orders/lifecycle") {
    const raw = await backendJson("/api/bot/journal?limit=50");
    const entries = Array.isArray(raw?.journal) ? raw.journal : [];
    sendJson(res, 200, entries.slice().reverse().map(adaptLifecycle));
    return;
  }

  if (route === "klines") {
    const symbol = stringValue(search.get("symbol"), "BTCUSDT").toUpperCase();
    const timeframe = stringValue(search.get("timeframe"), "5m").toLowerCase();
    const intervalMap: AnyRecord = { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240" };
    const interval = intervalMap[timeframe] || timeframe.replace(/m$/i, "").replace(/h$/i, "60");
    const raw = await backendJson(
      `/api/bybit/kline?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`,
      {},
      false,
    );
    const candles = Array.isArray(raw?.candles) ? raw.candles : [];
    sendJson(res, 200, candles.map((row: AnyRecord) => ({
      time: numberValue(row.time, 0),
      open: numberValue(row.open, 0),
      high: numberValue(row.high, 0),
      low: numberValue(row.low, 0),
      close: numberValue(row.close, 0),
      volume: numberValue(row.volume, 0),
    })));
    return;
  }

  if (route === "logs") {
    const limit = Math.max(1, Math.min(500, numberValue(search.get("limit"), 100)));
    const filter = stringValue(search.get("filter"), "ALL").toUpperCase();
    const raw = await backendJson(`/api/bot/journal?limit=${limit}`);
    let logs = (Array.isArray(raw?.journal) ? raw.journal : []).slice().reverse().map(adaptLog);
    if (filter !== "ALL") logs = logs.filter((row: AnyRecord) => row.level === filter || row.category.toUpperCase().includes(filter));
    sendJson(res, 200, logs);
    return;
  }

  if (route === "scanner") {
    const raw = await backendJson("/api/bot/scanner?interval=5&mode=balanced", {}, false);
    sendJson(res, 200, adaptScanner(raw));
    return;
  }

  if (route.startsWith("workers/")) {
    const raw = await backendJson(`/api/${route}`);
    sendJson(res, 200, raw);
    return;
  }

  throw new UpstreamError(404, `Unsupported frontend API route: /api/${route}`);
}

async function handlePost(route: string, req: RequestLike, res: ResponseLike): Promise<void> {
  const body = await readRequestBody(req);

  if (route === "bot/toggle") {
    const current = await backendJson("/api/bot/status");
    const bot = current?.bot || {};
    if (bot.enabled) {
      const stopped = await backendJson("/api/bot/stop", { method: "POST", body: "{}" });
      sendJson(res, 200, { success: stopped?.ok !== false, isRunning: false });
      return;
    }
    const startPayload = {
      symbol: bot.symbol || "BTCUSDT",
      interval: bot.interval || "5",
      mode: bot.mode || "balanced",
      maxAllocationUsdt: numberValue(bot.maxAllocationUsdt, 250),
      riskPerTradePct: numberValue(bot.riskPerTradePct, 0.25),
      maxOpenPositions: numberValue(bot.maxOpenPositions, 1),
      dailyLossCapUsdt: numberValue(bot.dailyLossCapUsdt, 25),
      maxTradesPerDay: numberValue(bot.maxTradesPerDay, 6),
      stopLossPct: numberValue(bot.stopLossPct, 0.8),
      takeProfitPct: numberValue(bot.takeProfitPct, 1.6),
      cooldownSeconds: numberValue(bot.cooldownSeconds, 180),
    };
    const started = await backendJson("/api/bot/start", {
      method: "POST",
      body: JSON.stringify(startPayload),
    });
    sendJson(res, 200, { success: started?.ok !== false, isRunning: Boolean(started?.bot?.enabled ?? true) });
    return;
  }

  if (route === "config") {
    if (body?.apiKey || body?.apiSecret) {
      throw new UpstreamError(
        400,
        "API keys cannot be saved from the browser. Configure BYBIT_API_KEY and BYBIT_API_SECRET only in Render.",
      );
    }
    sendJson(res, 200, { success: true, serverManaged: true });
    return;
  }

  if (route === "positions/close" || route === "positions/update-sltp") {
    throw new UpstreamError(
      501,
      "This action is not exposed by the canonical backend yet. It was not mapped to the kill switch because that would affect every open position.",
    );
  }

  throw new UpstreamError(404, `Unsupported frontend API route: /api/${route}`);
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  try {
    const { route, search } = requestPath(req);
    if (!route) {
      sendJson(res, 200, {
        ok: true,
        service: "Bybit frontend secure backend-for-frontend",
        backend: BACKEND_URL,
        authConfigured: Boolean(ADMIN_TOKEN),
      });
      return;
    }

    const method = stringValue(req.method, "GET").toUpperCase();
    if (method === "GET") {
      await handleGet(route, search, res);
      return;
    }
    if (method === "POST") {
      await handlePost(route, req, res);
      return;
    }
    res.setHeader("Allow", "GET, POST");
    throw new UpstreamError(405, `Method ${method} not allowed`);
  } catch (error: any) {
    if (error instanceof UpstreamError) {
      sendJson(res, error.status, {
        error: error.message,
        upstream: error.payload,
      });
      return;
    }
    const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    sendJson(res, isTimeout ? 504 : 502, {
      error: isTimeout
        ? "Bybit Demo backend timed out. Render may be waking up; retry shortly."
        : stringValue(error?.message, "Unable to reach Bybit Demo backend"),
    });
  }
}
