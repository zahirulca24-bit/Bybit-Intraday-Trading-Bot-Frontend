import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

export const app = express();
const PORT = 3000;

app.use(express.json());

// In-memory state for Bybit Demo Intraday Bot
let botState = {
  isRunning: true,
  bybitMode: "BYBIT_DEMO",
  backendConnected: true,
  lastScanTime: new Date().toISOString(),
  nextScanSeconds: 8,
  apiLatencyMs: 42,
  durableState: "PERSISTENT" as "PERSISTENT" | "DEGRADED",
  routerMode: "Intraday Momentum & Breakout Router",
  version: "v2.4.1-demo",
  authConfigured: true,
};

let accountState = {
  equity: 10482.50,
  availableBalance: 7850.20,
  floatingPnL: 342.80,
  floatingPnLPercent: 3.38,
  openTradesCount: 3,
  maxOpenTrades: 5,
  dailyRiskUsedPercent: 1.25,
  maxDailyRiskPercent: 3.00,
  tradesTodayCount: 8,
  winsToday: 6,
  lossesToday: 2,
  winRatePercent: 75.0,
};

let positionsState = [
  {
    id: "pos-1",
    symbol: "BTCUSDT",
    side: "LONG",
    leverage: 10,
    size: 0.25,
    notionalUsdt: 16875.00,
    entryPrice: 67100.00,
    markPrice: 67500.00,
    liquidationPrice: 60800.00,
    floatingPnL: 100.00,
    pnlPercent: 5.93,
    marginUsdt: 1687.50,
    stopLoss: 66500.00,
    takeProfit: 68800.00,
    openedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: "pos-2",
    symbol: "ETHUSDT",
    side: "SHORT",
    leverage: 15,
    size: 3.5,
    notionalUsdt: 12250.00,
    entryPrice: 3520.00,
    markPrice: 3500.00,
    liquidationPrice: 3740.00,
    floatingPnL: 70.00,
    pnlPercent: 8.57,
    marginUsdt: 816.66,
    stopLoss: 3560.00,
    takeProfit: 3420.00,
    openedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
  },
  {
    id: "pos-3",
    symbol: "SOLUSDT",
    side: "LONG",
    leverage: 10,
    size: 15.0,
    notionalUsdt: 2775.00,
    entryPrice: 180.00,
    markPrice: 185.00,
    liquidationPrice: 163.50,
    floatingPnL: 75.00,
    pnlPercent: 27.03,
    marginUsdt: 277.50,
    stopLoss: 176.00,
    takeProfit: 195.00,
    openedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
  }
];

let orderLifecycles = [
  {
    id: "ord-109",
    timestamp: new Date(Date.now() - 120000).toISOString(),
    symbol: "SOLUSDT",
    side: "LONG",
    timeframe: "5m",
    signal: {
      price: 184.20,
      condition: "EMA 20/50 Bullish Crossover + High Volume Spike",
      confidence: 91,
      scanScore: 8.8,
    },
    guard: {
      status: "PASS",
      checksPassed: ["Spread < 0.03%", "Daily Risk < 3.0%", "Volatility Normal", "Max Pos < 5"],
      blockedReason: null,
    },
    order: {
      type: "MARKET",
      sizeUsdt: 2775,
      leverage: 10,
      slippageTolerance: "0.05%",
    },
    protection: {
      stopLoss: 176.00,
      takeProfit: 195.00,
      trailingStop: "Activated @ +2.5%",
    },
    finalStatus: "PASS",
    failureReason: null,
  },
  {
    id: "ord-108",
    timestamp: new Date(Date.now() - 480000).toISOString(),
    symbol: "AVAXUSDT",
    side: "SHORT",
    timeframe: "15m",
    signal: {
      price: 28.40,
      condition: "RSI Overbought (78) + VWAP Rejection",
      confidence: 84,
      scanScore: 7.9,
    },
    guard: {
      status: "BLOCKED",
      checksPassed: ["Spread < 0.03%", "Volatility Normal"],
      blockedReason: "Max daily trades limit reached for AVAX symbol (Safety Guard #3)",
    },
    order: {
      type: "LIMIT",
      sizeUsdt: 1500,
      leverage: 10,
      slippageTolerance: "0.05%",
    },
    protection: {
      stopLoss: 29.20,
      takeProfit: 26.80,
      trailingStop: "Inactive",
    },
    finalStatus: "BLOCKED",
    failureReason: "Max daily trades limit reached for AVAX symbol (Safety Guard #3)",
  },
  {
    id: "ord-107",
    timestamp: new Date(Date.now() - 900000).toISOString(),
    symbol: "BTCUSDT",
    side: "LONG",
    timeframe: "5m",
    signal: {
      price: 67100.00,
      condition: "Intraday Support Bounce + Bullish Momentum",
      confidence: 95,
      scanScore: 9.4,
    },
    guard: {
      status: "PASS",
      checksPassed: ["All 6 Safety Checks Passed"],
      blockedReason: null,
    },
    order: {
      type: "MARKET",
      sizeUsdt: 16875,
      leverage: 10,
      slippageTolerance: "0.02%",
    },
    protection: {
      stopLoss: 66500.00,
      takeProfit: 68800.00,
      trailingStop: "Dynamic Trail Active",
    },
    finalStatus: "PASS",
    failureReason: null,
  },
  {
    id: "ord-106",
    timestamp: new Date(Date.now() - 1500000).toISOString(),
    symbol: "XRPUSDT",
    side: "LONG",
    timeframe: "1m",
    signal: {
      price: 0.582,
      condition: "Scalp Breakout",
      confidence: 62,
      scanScore: 5.5,
    },
    guard: {
      status: "WAIT",
      checksPassed: ["Spread OK"],
      blockedReason: "Awaiting candle confirmation close (Wait condition active)",
    },
    order: {
      type: "MARKET",
      sizeUsdt: 1000,
      leverage: 5,
      slippageTolerance: "0.1%",
    },
    protection: {
      stopLoss: 0.570,
      takeProfit: 0.610,
      trailingStop: "Inactive",
    },
    finalStatus: "WAIT",
    failureReason: "Awaiting candle confirmation close (Wait condition active)",
  },
  {
    id: "ord-105",
    timestamp: new Date(Date.now() - 2100000).toISOString(),
    symbol: "NEARUSDT",
    side: "SHORT",
    timeframe: "15m",
    signal: {
      price: 5.12,
      condition: "Bearish Breakdown",
      confidence: 76,
      scanScore: 7.1,
    },
    guard: {
      status: "ERROR",
      checksPassed: [],
      blockedReason: "Bybit Demo API WebSocket Gateway Timeout (504)",
    },
    order: {
      type: "MARKET",
      sizeUsdt: 1200,
      leverage: 10,
      slippageTolerance: "0.05%",
    },
    protection: {
      stopLoss: 5.30,
      takeProfit: 4.80,
      trailingStop: "Inactive",
    },
    finalStatus: "ERROR",
    failureReason: "Bybit Demo API WebSocket Gateway Timeout (504)",
  },
  {
    id: "ord-104",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    symbol: "DOGEUSDT",
    side: "LONG",
    timeframe: "5m",
    signal: {
      price: 0.125,
      condition: "Volume Spike",
      confidence: 68,
      scanScore: 6.2,
    },
    guard: {
      status: "DEGRADED",
      checksPassed: ["Memory State Sync Only"],
      blockedReason: "State persistence degraded. Write to local storage only.",
    },
    order: {
      type: "MARKET",
      sizeUsdt: 800,
      leverage: 5,
      slippageTolerance: "0.1%",
    },
    protection: {
      stopLoss: 0.120,
      takeProfit: 0.135,
      trailingStop: "Inactive",
    },
    finalStatus: "DEGRADED",
    failureReason: "State persistence degraded. Operating in non-persistent safety mode.",
  }
];

// Helper to generate klines
function generateKlines(symbol: string, timeframe: string, count = 50) {
  let basePrice = symbol.startsWith("BTC") ? 67200 : symbol.startsWith("ETH") ? 3510 : symbol.startsWith("SOL") ? 183 : 28;
  const now = Date.now();
  const intervalMs = timeframe === "1m" ? 60000 : timeframe === "5m" ? 300000 : timeframe === "15m" ? 900000 : 3600000;
  
  const klines = [];
  let currentPrice = basePrice;
  for (let i = count; i >= 0; i--) {
    const time = now - i * intervalMs;
    const changePct = (Math.random() - 0.48) * 0.008;
    const open = currentPrice;
    const close = open * (1 + changePct);
    const high = Math.max(open, close) * (1 + Math.random() * 0.004);
    const low = Math.min(open, close) * (1 - Math.random() * 0.004);
    const volume = Math.round(1000 + Math.random() * 5000);
    currentPrice = close;
    klines.push({ time, open, high, low, close, volume });
  }
  return klines;
}

// API Routes
app.get("/api/status", (req, res) => {
  // simulate small countdown decrement
  botState.nextScanSeconds = botState.nextScanSeconds <= 1 ? 15 : botState.nextScanSeconds - 1;
  botState.lastScanTime = new Date().toISOString();
  botState.apiLatencyMs = 35 + Math.floor(Math.random() * 15);
  res.json(botState);
});

app.post("/api/bot/toggle", (req, res) => {
  botState.isRunning = !botState.isRunning;
  res.json({ success: true, isRunning: botState.isRunning });
});

app.get("/api/account", (req, res) => {
  // update floating pnl dynamically
  const openPosPnl = positionsState.reduce((acc, pos) => acc + pos.floatingPnL, 0);
  accountState.floatingPnL = Math.round(openPosPnl * 100) / 100;
  accountState.equity = Math.round((10139.70 + accountState.floatingPnL) * 100) / 100;
  accountState.openTradesCount = positionsState.length;
  res.json(accountState);
});

app.get("/api/positions", (req, res) => {
  res.json(positionsState);
});

app.post("/api/positions/close", (req, res) => {
  const { id } = req.body;
  positionsState = positionsState.filter(p => p.id !== id);
  accountState.openTradesCount = positionsState.length;
  res.json({ success: true, remaining: positionsState.length });
});

app.post("/api/positions/update-sltp", (req, res) => {
  const { id, stopLoss, takeProfit } = req.body;
  const pos = positionsState.find(p => p.id === id);
  if (pos) {
    if (stopLoss !== undefined) pos.stopLoss = Number(stopLoss);
    if (takeProfit !== undefined) pos.takeProfit = Number(takeProfit);
    return res.json({ success: true, position: pos });
  }
  res.status(404).json({ error: "Position not found" });
});

app.get("/api/orders/lifecycle", (req, res) => {
  res.json(orderLifecycles);
});

// Scanner & Signals API Endpoint
app.get("/api/scanner", (req, res) => {
  const now = Date.now();
  
  const scannerResponse = {
    summary: {
      totalContracts: 340,
      validUsdtContracts: 180,
      spreadPassed: 142,
      liquidityPassed: 98,
      enriched: 45,
      shortlisted: 20,
      deepScanned: 10,
      completed: 10,
      rejected: 8,
      timedOut: 0,
      scanDurationMs: 384,
      lastUpdated: new Date().toISOString(),
      entryTimeframe: "5m",
      routerMode: botState.routerMode,
      universeLabel: "Liquid Intraday Top Movers",
      bybitMode: "Bybit Demo API",
    },
    policy: {
      shortlistSize: 20,
      deepScanSize: 10,
      normalSpreadThresholdPct: 0.03,
      reducedSizeSpreadThresholdPct: 0.05,
      maxSpreadThresholdPct: 0.08,
      minTurnoverUsdt: 5000000,
      minAtr15m: 0.15,
      maxAtr15m: 12.50,
      minVolumeRatio: 1.20,
      minGrossRR: 1.80,
      minNetRR: 1.50,
      preferredNetRR: 2.20,
      normalCostToRiskLimitPct: 5.0,
      maxCostToRiskLimitPct: 10.0,
      refreshIntervalSec: 15,
      scanDeadlineMs: 1500,
    },
    signals: [
      {
        symbol: "BTCUSDT",
        signal: "Buy",
        routerReason: "Bullish Trend Continuation + Volume Breakout",
        change24hPct: 3.45,
        turnoverUsdt: 845000000,
        spreadPct: 0.012,
        atr15m: 245.50,
        volumeRatio: 2.45,
        costTier: "LOW",
        routerConfidencePct: 94,
        signalCandleTime: now - 300000, // 5m ago
        executionReadiness: "EXECUTABLE",
        readinessReason: "All 6 Execution & Risk Verification Checks Passed",
        // Expandable Detail
        strategyVotes: [
          { engineName: "EMA Crossover Engine", voteSignal: "Buy", voteReason: "EMA20 crossed above EMA50", voteStrengthPct: 95 },
          { engineName: "Volume Profile Engine", voteSignal: "Buy", voteReason: "POC Breakout with 2.4x Vol", voteStrengthPct: 90 },
          { engineName: "Mean Reversion Engine", voteSignal: "WAIT", voteReason: "RSI 64 in upper expansion zone", voteStrengthPct: 40 },
        ],
        indicators: {
          trend1h: "Bullish",
          rsi15m: 62.4,
          rsi5m: 68.1,
          ema20_1h: 66800.0,
          ema50_1h: 65900.0,
          entryTimeframe: "5m",
          closedSignalCandleTimestamp: now - 300000,
        },
        pipelineStatuses: {
          marketDataStatus: "HEALTHY",
          indicatorStatus: "VALIDATED",
          strategyStatus: "CONSENSUS_BUY",
          routerStatus: "ROUTED_READY",
          riskStatus: "APPROVED",
          tradeManagementStatus: "READY",
          journalStatus: "LOGGED",
        }
      },
      {
        symbol: "SOLUSDT",
        signal: "Buy",
        routerReason: "Intraday Range Expansion + Momentum",
        change24hPct: 8.12,
        turnoverUsdt: 312000000,
        spreadPct: 0.021,
        atr15m: 1.85,
        volumeRatio: 3.10,
        costTier: "LOW",
        routerConfidencePct: 88,
        signalCandleTime: now - 600000,
        executionReadiness: "EXECUTABLE",
        readinessReason: "Closed candle verified. Risk limits clear.",
        strategyVotes: [
          { engineName: "Breakout Engine", voteSignal: "Buy", voteReason: "Resistance 182.0 broken", voteStrengthPct: 92 },
          { engineName: "RSI Momentum", voteSignal: "Buy", voteReason: "RSI 5m surging", voteStrengthPct: 84 },
        ],
        indicators: {
          trend1h: "Strong Bullish",
          rsi15m: 71.2,
          rsi5m: 74.5,
          ema20_1h: 178.5,
          ema50_1h: 172.0,
          entryTimeframe: "5m",
          closedSignalCandleTimestamp: now - 600000,
        },
        pipelineStatuses: {
          marketDataStatus: "HEALTHY",
          indicatorStatus: "VALIDATED",
          strategyStatus: "CONSENSUS_BUY",
          routerStatus: "ROUTED_READY",
          riskStatus: "APPROVED",
          tradeManagementStatus: "READY",
          journalStatus: "LOGGED",
        }
      },
      {
        symbol: "ETHUSDT",
        signal: "Sell",
        routerReason: "VWAP Rejection + EMA Cross Down",
        change24hPct: -2.15,
        turnoverUsdt: 520000000,
        spreadPct: 0.018,
        atr15m: 14.20,
        volumeRatio: 1.85,
        costTier: "LOW",
        routerConfidencePct: 82,
        signalCandleTime: now - 900000,
        executionReadiness: "EXECUTABLE",
        readinessReason: "Bearish consensus active. Risk guard approved.",
        strategyVotes: [
          { engineName: "VWAP Engine", voteSignal: "Sell", voteReason: "Rejected at VWAP Upper Band", voteStrengthPct: 85 },
          { engineName: "Trend Follower", voteSignal: "Sell", voteReason: "Lower Highs pattern", voteStrengthPct: 78 },
        ],
        indicators: {
          trend1h: "Bearish",
          rsi15m: 42.1,
          rsi5m: 38.4,
          ema20_1h: 3540.0,
          ema50_1h: 3580.0,
          entryTimeframe: "15m",
          closedSignalCandleTimestamp: now - 900000,
        },
        pipelineStatuses: {
          marketDataStatus: "HEALTHY",
          indicatorStatus: "VALIDATED",
          strategyStatus: "CONSENSUS_SELL",
          routerStatus: "ROUTED_READY",
          riskStatus: "APPROVED",
          tradeManagementStatus: "READY",
          journalStatus: "LOGGED",
        }
      },
      {
        symbol: "AVAXUSDT",
        signal: "Blocked",
        routerReason: "Safety Guard #3 Rejection: Daily Trade Limit",
        change24hPct: -4.80,
        turnoverUsdt: 89000000,
        spreadPct: 0.035,
        atr15m: 0.45,
        volumeRatio: 1.40,
        costTier: "MEDIUM",
        routerConfidencePct: 79,
        signalCandleTime: now - 1200000,
        executionReadiness: "BLOCKED",
        readinessReason: "Safety Guard #3: Max daily trades count (3/3) reached for symbol",
        strategyVotes: [
          { engineName: "RSI Reversion", voteSignal: "Sell", voteReason: "Overbought exhaustion", voteStrengthPct: 80 },
        ],
        indicators: {
          trend1h: "Neutral",
          rsi15m: 78.2,
          rsi5m: 81.0,
          ema20_1h: 28.9,
          ema50_1h: 29.2,
          entryTimeframe: "15m",
          closedSignalCandleTimestamp: now - 1200000,
        },
        pipelineStatuses: {
          marketDataStatus: "HEALTHY",
          indicatorStatus: "VALIDATED",
          strategyStatus: "SIGNAL_GENERATED",
          routerStatus: "ROUTER_PASSED",
          riskStatus: "REJECTED_RISK_GUARD",
          tradeManagementStatus: "HALTED",
          journalStatus: "LOGGED_BLOCK",
        }
      },
      {
        symbol: "XRPUSDT",
        signal: "WAIT",
        routerReason: "Awaiting 5m Candle Close Confirmation",
        change24hPct: 1.20,
        turnoverUsdt: 145000000,
        spreadPct: 0.028,
        atr15m: 0.008,
        volumeRatio: 0.95,
        costTier: "LOW",
        routerConfidencePct: 52,
        signalCandleTime: null, // Closed candle missing rule!
        executionReadiness: "NOT_EXECUTABLE",
        readinessReason: "Closed-candle identity missing (Unclosed active bar)",
        strategyVotes: [
          { engineName: "Breakout Engine", voteSignal: "WAIT", voteReason: "Candle still forming", voteStrengthPct: 50 },
        ],
        indicators: {
          trend1h: "Ranging",
          rsi15m: 51.0,
          rsi5m: 53.2,
          ema20_1h: 0.580,
          ema50_1h: 0.578,
          entryTimeframe: "5m",
          closedSignalCandleTimestamp: null,
        },
        pipelineStatuses: {
          marketDataStatus: "HEALTHY",
          indicatorStatus: "PARTIAL",
          strategyStatus: "WAIT_CONDITION",
          routerStatus: "HOLD",
          riskStatus: "PENDING_EVALUATION",
          tradeManagementStatus: "IDLE",
          journalStatus: "STANDBY",
        }
      },
      {
        symbol: "NEARUSDT",
        signal: "Error",
        routerReason: "Bybit Demo API WebSocket Gateway Timeout",
        change24hPct: -1.05,
        turnoverUsdt: 62000000,
        spreadPct: 0.062,
        atr15m: 0.12,
        volumeRatio: 1.10,
        costTier: "HIGH",
        routerConfidencePct: 0,
        signalCandleTime: null,
        executionReadiness: "ERROR",
        readinessReason: "Gateway Timeout (504) on orderbook depth request",
        strategyVotes: [
          { engineName: "Trend Follower", voteSignal: "Error", voteReason: "Market data stream disconnected", voteStrengthPct: 0 },
        ],
        indicators: {
          trend1h: "Unknown",
          rsi15m: 0,
          rsi5m: 0,
          ema20_1h: 0,
          ema50_1h: 0,
          entryTimeframe: "15m",
          closedSignalCandleTimestamp: null,
        },
        pipelineStatuses: {
          marketDataStatus: "STALE_DATA",
          indicatorStatus: "FAILED",
          strategyStatus: "ERROR",
          routerStatus: "ABORTED",
          riskStatus: "SKIPPED",
          tradeManagementStatus: "DISABLED",
          journalStatus: "LOGGED_ERROR",
        }
      },
      {
        symbol: "DOGEUSDT",
        signal: "WAIT",
        routerReason: "Volume ratio below minimum threshold (0.95 < 1.20)",
        change24hPct: 0.45,
        turnoverUsdt: 110000000,
        spreadPct: 0.024,
        atr15m: 0.002,
        volumeRatio: 0.95,
        costTier: "LOW",
        routerConfidencePct: 45,
        signalCandleTime: now - 1500000,
        executionReadiness: "NOT_EXECUTABLE",
        readinessReason: "WAIT signal (Never mark WAIT as executable)",
        strategyVotes: [
          { engineName: "Volume Profile", voteSignal: "WAIT", voteReason: "Volume ratio insufficient", voteStrengthPct: 45 },
        ],
        indicators: {
          trend1h: "Neutral",
          rsi15m: 49.5,
          rsi5m: 50.1,
          ema20_1h: 0.124,
          ema50_1h: 0.123,
          entryTimeframe: "5m",
          closedSignalCandleTimestamp: now - 1500000,
        },
        pipelineStatuses: {
          marketDataStatus: "HEALTHY",
          indicatorStatus: "VALIDATED",
          strategyStatus: "FILTERED_OUT",
          routerStatus: "STANDBY",
          riskStatus: "PENDING_EVALUATION",
          tradeManagementStatus: "IDLE",
          journalStatus: "LOGGED",
        }
      },
      {
        symbol: "LINKUSDT",
        signal: "Buy",
        routerReason: "Risk evaluation pending (Idle risk pipeline)",
        change24hPct: 5.20,
        turnoverUsdt: 210000000,
        spreadPct: 0.019,
        atr15m: 0.32,
        volumeRatio: 2.10,
        costTier: "LOW",
        routerConfidencePct: 86,
        signalCandleTime: now - 450000,
        executionReadiness: "PENDING_RISK",
        readinessReason: "Risk evaluation pending (Risk pipeline in idle check)",
        strategyVotes: [
          { engineName: "EMA Crossover", voteSignal: "Buy", voteReason: "Golden cross on 5m", voteStrengthPct: 88 },
        ],
        indicators: {
          trend1h: "Bullish",
          rsi15m: 65.0,
          rsi5m: 67.2,
          ema20_1h: 16.20,
          ema50_1h: 15.80,
          entryTimeframe: "5m",
          closedSignalCandleTimestamp: now - 450000,
        },
        pipelineStatuses: {
          marketDataStatus: "HEALTHY",
          indicatorStatus: "VALIDATED",
          strategyStatus: "CONSENSUS_BUY",
          routerStatus: "ROUTED_READY",
          riskStatus: "PENDING_EVALUATION",
          tradeManagementStatus: "QUEUED",
          journalStatus: "STANDBY",
        }
      },
    ]
  };

  res.json(scannerResponse);
});

app.get("/api/klines", (req, res) => {
  const symbol = (req.query.symbol as string) || "BTCUSDT";
  const timeframe = (req.query.timeframe as string) || "5m";
  res.json(generateKlines(symbol, timeframe, 60));
});

app.get("/api/logs", (req, res) => {
  const filter = (req.query.filter as string) || "ALL";
  let logs = [
    { id: "log-1", timestamp: new Date().toISOString(), level: "PASS", category: "ORDER_EXEC", message: "Position pos-1 (BTCUSDT LONG) stop loss updated to 66,500 USDT." },
    { id: "log-2", timestamp: new Date(Date.now() - 45000).toISOString(), level: "WAIT", category: "SCANNER", message: "ETHUSDT RSI at 48. Neutral zone, awaiting momentum trigger." },
    { id: "log-3", timestamp: new Date(Date.now() - 120000).toISOString(), level: "PASS", category: "ORDER_EXEC", message: "Order ord-109 (SOLUSDT LONG) FILLED @ 184.20 USDT. 10x leverage." },
    { id: "log-4", timestamp: new Date(Date.now() - 480000).toISOString(), level: "BLOCKED", category: "RISK_GUARD", message: "Order ord-108 (AVAXUSDT SHORT) rejected by Safety Guard #3: Max daily trades count exceeded." },
    { id: "log-5", timestamp: new Date(Date.now() - 900000).toISOString(), level: "PASS", category: "SCANNER", message: "Scan completed for 24 pairs in 412ms. 1 signal passed, 3 filtered." },
    { id: "log-6", timestamp: new Date(Date.now() - 1500000).toISOString(), level: "DEGRADED", category: "PERSISTENCE", message: "Local storage fallback enabled for session cache. Redis connection degraded." },
    { id: "log-7", timestamp: new Date(Date.now() - 2100000).toISOString(), level: "ERROR", category: "GATEWAY", message: "Bybit Demo REST API endpoint timeout on NEARUSDT depth call." }
  ];
  if (filter !== "ALL") {
    logs = logs.filter(l => l.level === filter);
  }
  res.json(logs);
});

app.post("/api/config", (req, res) => {
  const { routerMode, durableState, apiKey, apiSecret } = req.body;
  if (routerMode) botState.routerMode = routerMode;
  if (durableState) botState.durableState = durableState;
  if (apiKey !== undefined) botState.authConfigured = Boolean(apiKey);
  res.json({ success: true, botState });
});

// Start Express + Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
