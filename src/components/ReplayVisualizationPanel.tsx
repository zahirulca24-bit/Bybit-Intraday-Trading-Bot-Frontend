import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CandlestickChart, Loader2, ShieldCheck } from "lucide-react";

import { ReplayVisualizationResponse, ReplayVisualizationTrade } from "../replay-visualization-types";

async function fetchVisualization(sessionId: string): Promise<ReplayVisualizationResponse> {
  const query = new URLSearchParams({ limit: "500", includeFuture: "false" });
  const response = await fetch(`/api/replay/sessions/${encodeURIComponent(sessionId)}/visualization?${query.toString()}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text);
      throw new Error(parsed.error || `Replay visualization failed (${response.status}).`);
    } catch (error) {
      if (error instanceof Error && !error.message.startsWith("Unexpected token")) throw error;
      throw new Error(text || `Replay visualization failed (${response.status}).`);
    }
  }
  return response.json();
}

function money(value: string | null | undefined): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : "0.00";
}

function time(value: number | null | undefined): string {
  if (!value) return "—";
  const normalized = value < 1_000_000_000_000 ? value * 1000 : value;
  return new Date(normalized).toLocaleString();
}

function duration(value: number | null): string {
  if (value === null) return "Open";
  const minutes = Math.floor(value / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

const ReplayCandleChart: React.FC<{ data: ReplayVisualizationResponse }> = ({ data }) => {
  const model = useMemo(() => {
    const candles = data.candles.slice(-180);
    if (!candles.length) return null;
    const lows = candles.map((row) => Number(row.low));
    const highs = candles.map((row) => Number(row.high));
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const spread = Math.max(max - min, 0.00000001);
    const width = 1000;
    const height = 330;
    const top = 16;
    const bottom = 28;
    const plotHeight = height - top - bottom;
    const step = width / candles.length;
    const candleWidth = Math.max(1.5, Math.min(7, step * 0.62));
    const xForTime = new Map<number, number>();
    const y = (price: number) => top + ((max - price) / spread) * plotHeight;
    candles.forEach((row, index) => xForTime.set(row.openTime, index * step + step / 2));
    const markers = data.markers.filter((marker) => xForTime.has(marker.time));
    return { candles, min, max, width, height, step, candleWidth, y, xForTime, markers };
  }, [data]);

  if (!model) {
    return <div className="grid h-72 place-items-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-600">No processed replay candles yet.</div>;
  }

  return (
    <div className="overflow-x-auto" data-testid="replay-candlestick-chart">
      <svg viewBox={`0 0 ${model.width} ${model.height}`} className="h-[330px] min-w-[760px] w-full" role="img" aria-label="Historical replay candlestick chart">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = 16 + ratio * 286;
          const price = model.max - ratio * (model.max - model.min);
          return <g key={ratio}><line x1="0" y1={y} x2={model.width} y2={y} stroke="currentColor" className="text-slate-800" strokeWidth="1" /><text x="5" y={y - 3} fill="currentColor" className="text-[10px] text-slate-500">{price.toFixed(2)}</text></g>;
        })}
        {model.candles.map((row, index) => {
          const x = index * model.step + model.step / 2;
          const open = Number(row.open);
          const close = Number(row.close);
          const high = Number(row.high);
          const low = Number(row.low);
          const up = close >= open;
          const bodyTop = model.y(Math.max(open, close));
          const bodyBottom = model.y(Math.min(open, close));
          const bodyHeight = Math.max(1.2, bodyBottom - bodyTop);
          return (
            <g key={row.openTime} data-candle-time={row.openTime}>
              <line x1={x} y1={model.y(high)} x2={x} y2={model.y(low)} stroke={up ? "#34d399" : "#fb7185"} strokeWidth="1" />
              <rect x={x - model.candleWidth / 2} y={bodyTop} width={model.candleWidth} height={bodyHeight} fill={up ? "#10b981" : "#f43f5e"} rx="0.5" />
            </g>
          );
        })}
        {model.markers.map((marker, index) => {
          const x = model.xForTime.get(marker.time)!;
          const y = model.y(Number(marker.price));
          const fill = marker.type === "entry" ? "#22d3ee" : marker.type === "exit" ? "#f59e0b" : marker.type === "stop_loss" ? "#fb7185" : "#a78bfa";
          const label = marker.type === "stop_loss" ? "SL" : marker.type === "take_profit" ? "TP" : marker.type.toUpperCase();
          return <g key={`${marker.tradeId}-${marker.type}-${index}`} data-marker-type={marker.type}><circle cx={x} cy={y} r="4" fill={fill} stroke="#020617" strokeWidth="1.5" /><text x={x + 6} y={y - 5} fill={fill} fontSize="10" fontWeight="700">{label}</text></g>;
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-500"><span className="text-cyan-300">● Entry</span><span className="text-rose-300">● Stop loss</span><span className="text-violet-300">● Take profit</span><span className="text-amber-300">● Exit</span><span>{model.candles.length} latest candles shown</span></div>
    </div>
  );
};

const TradeDetails: React.FC<{ trade: ReplayVisualizationTrade }> = ({ trade }) => (
  <div className="rounded-lg border border-slate-800 bg-slate-950 p-3" data-testid="replay-trade-detail">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs font-bold text-slate-200">{trade.side} · {trade.status}</div><div className="mt-0.5 text-[9px] font-mono text-slate-600">{trade.tradeId}</div></div><div className={`text-sm font-bold ${Number(trade.netPnl) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{Number(trade.netPnl) >= 0 ? "+" : ""}{money(trade.netPnl)} USDT</div></div>
    <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 text-[10px]">
      <div><span className="text-slate-600">Entry</span><div className="text-slate-300">{money(trade.entryPrice)}</div></div>
      <div><span className="text-slate-600">Exit</span><div className="text-slate-300">{trade.exitPrice ? money(trade.exitPrice) : "Open"}</div></div>
      <div><span className="text-slate-600">SL / TP</span><div className="text-slate-300">{money(trade.protection.stopLoss)} / {money(trade.protection.takeProfit)}</div></div>
      <div><span className="text-slate-600">Quantity</span><div className="text-slate-300">{trade.quantity}</div></div>
      <div><span className="text-slate-600">Gross / Fees</span><div className="text-slate-300">{money(trade.grossPnl)} / {money(trade.fees)}</div></div>
      <div><span className="text-slate-600">R multiple</span><div className="text-slate-300">{trade.rMultiple ?? "N/A"}</div></div>
      <div><span className="text-slate-600">Holding</span><div className="text-slate-300">{duration(trade.holdingDurationMs)}</div></div>
      <div><span className="text-slate-600">Exit reason</span><div className="text-slate-300">{trade.exitReason ?? "Open"}</div></div>
    </div>
    <div className="mt-3 rounded border border-slate-800 bg-slate-900/60 p-2 text-[10px] text-slate-500">Entry {time(trade.entryTime)} · Exit {time(trade.exitTime)} · Same-candle conflict: <span className={trade.sameCandleConflict ? "text-amber-300" : "text-slate-300"}>{trade.sameCandleConflict ? "YES" : "NO"}</span> · Policy: <span className="text-slate-300">{trade.sameCandlePolicy}</span></div>
  </div>
);

export const ReplayVisualizationPanel: React.FC<{ sessionId: string; refreshKey: number | null }> = ({ sessionId, refreshKey }) => {
  const [data, setData] = useState<ReplayVisualizationResponse | null>(null);
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchVisualization(sessionId)
      .then((result) => {
        if (!active) return;
        setData(result);
        setSelectedTradeId((current) => current && result.trades.some((trade) => trade.tradeId === current) ? current : result.trades[result.trades.length - 1]?.tradeId ?? null);
      })
      .catch((reason: any) => { if (active) setError(reason?.message || "Unable to load replay visualization."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionId, refreshKey]);

  const selectedTrade = data?.trades.find((trade) => trade.tradeId === selectedTradeId) ?? null;

  return (
    <div className="rounded-xl border border-slate-800 bg-[#0b0f18] p-3" data-testid="replay-visualization-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><CandlestickChart size={15} className="text-cyan-400" /><h3 className="text-sm font-bold text-slate-200">Replay price action & trade evidence</h3></div>{data && <div className="flex items-center gap-2 text-[10px]"><span className="rounded border border-slate-700 px-2 py-1 text-slate-400">{data.meta.returnedCandles} candles · {data.meta.returnedTrades} trades</span><span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300"><ShieldCheck size={11} /> LOOKAHEAD BLOCKED</span></div>}</div>
      {loading && <div className="grid h-72 place-items-center"><Loader2 size={22} className="animate-spin text-cyan-400" /></div>}
      {error && <div className="flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200"><AlertTriangle size={14} className="mt-0.5" />{error}</div>}
      {!loading && !error && data && <div className="space-y-3"><ReplayCandleChart data={data} /><div><div className="mb-2 text-xs font-bold text-slate-300">Detailed trade journal</div>{data.trades.length === 0 ? <div className="rounded border border-dashed border-slate-800 p-4 text-center text-xs text-slate-600">No simulated trades in this replay session.</div> : <><div className="mb-2 flex gap-1 overflow-x-auto pb-1">{data.trades.map((trade, index) => <button key={trade.tradeId} onClick={() => setSelectedTradeId(trade.tradeId)} className={`shrink-0 rounded border px-2.5 py-1.5 text-[10px] ${selectedTradeId === trade.tradeId ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200" : "border-slate-800 bg-slate-950 text-slate-500"}`}>#{index + 1} {trade.side} {Number(trade.netPnl) >= 0 ? "+" : ""}{money(trade.netPnl)}</button>)}</div>{selectedTrade && <TradeDetails trade={selectedTrade} />}</>}</div><div className="rounded border border-emerald-500/20 bg-emerald-500/[0.04] p-2 text-[10px] text-emerald-200">Simulation only · PostgreSQL replay candles/trades · Closed candles only · External execution disabled · Conservative same-candle policy: {data.meta.sameCandlePolicy}</div></div>}
    </div>
  );
};