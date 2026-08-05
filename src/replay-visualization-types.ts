export interface ReplayVisualizationCandle {
  openTime: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  turnover: string | null;
  source: string;
  closed: true;
}

export type ReplayVisualizationMarkerType = "entry" | "stop_loss" | "take_profit" | "exit";

export interface ReplayVisualizationMarker {
  type: ReplayVisualizationMarkerType;
  time: number;
  price: string;
  tradeId: string;
  side?: "Buy" | "Sell";
  reason?: string | null;
}

export interface ReplayVisualizationTrade {
  tradeId: string;
  symbol: string;
  side: "Buy" | "Sell";
  status: "OPEN" | "CLOSED" | "CANCELLED";
  quantity: string;
  entryTime: number;
  entryPrice: string;
  exitTime: number | null;
  exitPrice: string | null;
  exitReason: string | null;
  protection: { stopLoss: string | null; takeProfit: string | null };
  grossPnl: string;
  fees: string;
  netPnl: string;
  riskAmount: string;
  rMultiple: string | null;
  holdingDurationMs: number | null;
  sameCandleConflict: boolean;
  sameCandlePolicy: string;
  limitedLiabilityApplied: boolean;
  markers: ReplayVisualizationMarker[];
}

export interface ReplayVisualizationResponse {
  ok: boolean;
  session: {
    sessionId: string;
    symbol: string;
    timeframe: string;
    status: string;
    startTime: number;
    endTime: number;
    cursorTime: number | null;
    updatedAt: number;
  };
  candles: ReplayVisualizationCandle[];
  trades: ReplayVisualizationTrade[];
  markers: ReplayVisualizationMarker[];
  meta: {
    candleLimit: number;
    returnedCandles: number;
    returnedTrades: number;
    returnedMarkers: number;
    lookaheadBlocked: boolean;
    includeFutureRequested: boolean;
    includeFutureApplied: boolean;
    candleSource: string;
    tradeSource: string;
    sameCandlePolicy: string;
  };
  safety: {
    simulationOnly: true;
    externalExecutionAllowed: false;
    exchangeCredentialsUsed: false;
    closedCandlesOnly: true;
    activeSessionLookaheadBlocked: true;
  };
  visualizationContractVersion: number;
}
