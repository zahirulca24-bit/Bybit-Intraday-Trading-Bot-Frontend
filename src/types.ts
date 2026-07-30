export type StatusLevel = "PASS" | "WAIT" | "BLOCKED" | "ERROR" | "DEGRADED";

export interface BotStatusResponse {
  isRunning: boolean;
  bybitMode: string;
  backendConnected: boolean;
  lastScanTime: string;
  nextScanSeconds: number;
  apiLatencyMs: number;
  durableState: "PERSISTENT" | "DEGRADED";
  routerMode: string;
  version: string;
  authConfigured: boolean;
  durableBackend?: string;
  persistentPathConfigured?: boolean;
  stateDegraded?: boolean;
  databasePath?: string;
  journalPersistenceStatus?: string;
  restartSafe?: boolean;
  automaticExecutionAllowed?: boolean;
  startupReconciliationStatus?: string;
  executionReadinessStatus?: string;
  migrationVersion?: number | string | null;
  requiredMigrationVersion?: number | string | null;
  durableError?: string | null;
}

export interface AccountSummary { equity: number; availableBalance: number; floatingPnL: number; floatingPnLPercent: number; openTradesCount: number; maxOpenTrades: number; dailyRiskUsedPercent: number; maxDailyRiskPercent: number; tradesTodayCount: number; winsToday: number; lossesToday: number; winRatePercent: number; }
export interface Position { id: string; symbol: string; side: "LONG" | "SHORT"; leverage: number; size: number; notionalUsdt: number; entryPrice: number; markPrice: number; liquidationPrice: number; floatingPnL: number; pnlPercent: number; marginUsdt: number; stopLoss: number; takeProfit: number; openedAt: string; }
export interface SignalDetails { price: number; condition: string; confidence: number; scanScore: number; }
export interface GuardDetails { status: "PASS" | "BLOCKED" | "WAIT" | "ERROR" | "DEGRADED"; checksPassed: string[]; blockedReason: string | null; }
export interface OrderDetails { type: string; sizeUsdt: number; leverage: number; slippageTolerance: string; }
export interface ProtectionDetails { stopLoss: number; takeProfit: number; trailingStop: string; }
export interface OrderLifecycle { id: string; timestamp: string; symbol: string; side: "LONG" | "SHORT"; timeframe: string; signal: SignalDetails; guard: GuardDetails; order: OrderDetails; protection: ProtectionDetails; finalStatus: StatusLevel; failureReason: string | null; }
export interface Kline { time: number; open: number; high: number; low: number; close: number; volume: number; }
export interface BotLog { id: string; timestamp: string; level: StatusLevel; category: string; message: string; }

export interface ScannerSummary { totalContracts: number; validUsdtContracts: number; spreadPassed: number; liquidityPassed: number; enriched: number; shortlisted: number; deepScanned: number; completed: number; rejected: number; timedOut: number; scanDurationMs: number; lastUpdated: string; entryTimeframe: string; routerMode: string; universeLabel: string; bybitMode: string; }
export interface ScannerPolicy { shortlistSize: number; deepScanSize: number; normalSpreadThresholdPct: number; reducedSizeSpreadThresholdPct: number; maxSpreadThresholdPct: number; minTurnoverUsdt: number; minAtr15m: number; maxAtr15m: number; minVolumeRatio: number; minGrossRR: number; minNetRR: number; preferredNetRR: number; normalCostToRiskLimitPct: number; maxCostToRiskLimitPct: number; refreshIntervalSec: number; scanDeadlineMs: number; }
export interface StrategyVote { engineName: string; voteSignal: "Buy" | "Sell" | "WAIT" | "Blocked" | "Error"; voteReason: string; voteStrengthPct: number; }
export interface IndicatorDetails { trend1h: string; rsi15m: number; rsi5m: number; ema20_1h: number; ema50_1h: number; entryTimeframe: string; closedSignalCandleTimestamp: number | null; }
export interface PipelineStatuses { marketDataStatus: string; indicatorStatus: string; strategyStatus: string; routerStatus: string; riskStatus: string; tradeManagementStatus: string; journalStatus: string; }
export interface ScannerSignalItem { symbol: string; signal: "Buy" | "Sell" | "WAIT" | "Blocked" | "Error"; routerReason: string; change24hPct: number; turnoverUsdt: number; spreadPct: number; atr15m: number; volumeRatio: number; costTier: "LOW" | "MEDIUM" | "HIGH"; routerConfidencePct: number; signalCandleTime: number | null; executionReadiness: "EXECUTABLE" | "NOT_EXECUTABLE" | "BLOCKED" | "PENDING_RISK" | "ERROR"; readinessReason: string; strategyVotes: StrategyVote[]; indicators: IndicatorDetails; pipelineStatuses: PipelineStatuses; }
export interface ScannerDataResponse { summary: ScannerSummary; policy: ScannerPolicy; signals: ScannerSignalItem[]; }

export interface WorkerStatusResponse {
  ok?: boolean;
  executionConnected?: boolean;
  runtime?: Record<string, any>;
  symbolSelection?: Record<string, any>;
  setupVerification?: Record<string, any>;
  execution?: Record<string, any>;
  costPolicyFixInstalled?: boolean;
}
export interface WorkerSymbolsResponse extends Record<string, any> { ok?: boolean; }
export interface WorkerSetupsResponse extends Record<string, any> { ok?: boolean; }
export interface WorkerExecutionResponse extends Record<string, any> { ok?: boolean; }

export type ReplaySessionStatus = "READY" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED";

export interface ReplaySession {
  sessionId: string;
  symbol: string;
  timeframe: string;
  status: ReplaySessionStatus;
  startTime: number;
  endTime: number;
  cursorTime: number | null;
  initialBalance: string;
  balance: string;
  equity: string;
  strategyMode: "conservative" | "balanced" | "aggressive";
  config: Record<string, unknown>;
  summary: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface ReplaySafetyStatus {
  ok: boolean;
  runtimeMode: "historical_replay";
  executionMode: "simulated_only";
  externalExecutionAllowed: false;
  sessionApiImplemented: boolean;
  stepEngineImplemented: boolean;
  strategyReplayImplemented: boolean;
  riskReplayImplemented: boolean;
  simulatedExecutionImplemented: boolean;
  performanceSummaryImplemented?: boolean;
  replayJournalImplemented?: boolean;
  [key: string]: unknown;
}

export interface ReplaySessionsResponse {
  ok: boolean;
  sessions: ReplaySession[];
  count: number;
  limit: number;
  status: ReplaySessionStatus | null;
  performanceSummaryImplemented?: boolean;
  replayJournalImplemented?: boolean;
}

export interface ReplayStartRequest {
  symbol: string;
  timeframe: string;
  startTime: number;
  endTime: number;
  initialBalance: string;
  strategyMode: "conservative" | "balanced" | "aggressive";
  autoSync: boolean;
  config: {
    replayFeeBps: string;
    maxLeverage: string;
  };
}

export interface ReplayStartResponse {
  ok: boolean;
  created: boolean;
  session: ReplaySession;
  performanceSummaryImplemented?: boolean;
  replayJournalImplemented?: boolean;
}

export interface ReplayStepResponse {
  ok: boolean;
  idempotent: boolean;
  completed: boolean;
  cursorTime: number | null;
  session: ReplaySession;
  strategy?: Record<string, any>;
  execution?: {
    opened?: number;
    closed?: number;
    openTrades?: number;
    closedTrades?: number;
    requestFees?: string;
    [key: string]: unknown;
  };
  externalExecutionAllowed: false;
}

export interface ReplayPerformanceMetrics {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  cancelledTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  longTrades: number;
  shortTrades: number;
  winRatePct: string;
  grossProfit: string;
  grossLoss: string;
  netRealizedPnl: string;
  feesPaid: string;
  expectancy: string;
  averageWin: string;
  averageLoss: string;
  profitFactor: string | null;
  profitFactorStatus: string;
  totalR: string;
  averageR: string;
  rSampleTrades: number;
  averageTradeDurationMs: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  initialBalance: string;
  balance: string;
  equity: string;
  netPnl: string;
  equityPnl: string;
  maxDrawdown: string;
  maxDrawdownPct: string;
  currentDrawdown: string;
  currentDrawdownPct: string;
  highWaterEquity: string;
  recoveryFactor: string | null;
}

export interface ReplayEquityPoint {
  sequenceNo: number;
  candleOpenTime: number | null;
  balance: string | null;
  equity: string;
  unrealizedPnl: string | null;
  createdAt: number;
}

export interface ReplayPerformanceResponse {
  ok: boolean;
  sessionId: string;
  symbol: string;
  timeframe: string;
  sessionStatus: ReplaySessionStatus;
  asOfCursorTime: number | null;
  isFinal: boolean;
  metrics: ReplayPerformanceMetrics;
  equityCurve: ReplayEquityPoint[];
  equityCurveMeta: {
    included: boolean;
    totalMarks: number;
    returnedPoints: number;
    ignoredMalformedMarks: number;
    samplingStride: number | null;
    limit: number;
  };
  externalExecutionAllowed: false;
}

export interface ReplayTrade {
  tradeId: string;
  symbol: string;
  side: "Buy" | "Sell";
  status: "OPEN" | "CLOSED" | "CANCELLED";
  entryTime: number;
  exitTime: number | null;
  entryPrice: string;
  exitPrice: string | null;
  quantity: string;
  realizedPnl: string;
  fees: string;
  payload: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

export interface ReplayJournalEntry {
  sequenceNo: number;
  eventType: string;
  candleOpenTime: number | null;
  createdAt: number;
  payload?: Record<string, any>;
}

export interface ReplayJournalResponse {
  ok: boolean;
  session: ReplaySession;
  entries: ReplayJournalEntry[];
  trades: ReplayTrade[];
  pagination: {
    direction: "asc" | "desc";
    cursorSequence: number | null;
    nextCursorSequence: number | null;
    hasMore: boolean;
    limit: number;
  };
  filters: Record<string, unknown>;
  journalSummary: {
    totalEvents: number;
    firstSequence: number | null;
    lastSequence: number | null;
    totalTrades: number;
    openTrades: number;
    closedTrades: number;
    cancelledTrades: number;
  };
  externalExecutionAllowed: false;
}
