import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Clock3,
  Database,
  Gauge,
  RefreshCw,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { api } from "../services/api";

interface AnalyticsMetadata {
  source: string;
  generatedAt: number;
  sampleSize: number;
  sampleLimit: number;
  sampleLimited: boolean;
  currency: string;
  lookbackDays?: number;
  windowStart?: number;
  windowEnd?: number;
  windowSource?: string;
  pnlSharpeMethod: string;
  strategyAttribution: string;
  truthfulEmptyState: boolean;
}

interface AnalyticsSummary {
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRatePct: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  averagePnl: number;
  averageWin: number;
  averageLoss: number;
  payoffRatio: number | null;
  expectancy: number;
  pnlSharpe: number | null;
  maxDrawdown: number;
  currentDrawdown: number;
  bestTrade: number;
  worstTrade: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  periodStart: number | null;
  periodEnd: number | null;
}

interface ClosedTrade {
  id: string;
  orderId: string | null;
  symbol: string;
  side: "LONG" | "SHORT" | "UNKNOWN";
  positionSide?: "LONG" | "SHORT" | "UNKNOWN";
  closingSide?: "BUY" | "SELL" | "UNKNOWN";
  closedPnl: number;
  closedSize: number;
  avgEntryPrice: number;
  avgExitPrice: number;
  leverage: number;
  closedAt: number;
  strategy: null;
  strategyAttribution: string;
}

interface BreakdownRow {
  label: string;
  totalTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRatePct: number;
  netPnl: number;
  averagePnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
}

interface DrawdownPoint {
  index: number;
  time: number;
  symbol: string;
  side: string;
  pnl: number;
  cumulativePnl: number;
  peakPnl: number;
  drawdown: number;
  drawdownPct: number | null;
}

interface SummaryResponse {
  ok: boolean;
  summary: AnalyticsSummary;
  recentTrades: ClosedTrade[];
  metadata: AnalyticsMetadata;
}

interface BreakdownResponse {
  ok: boolean;
  bySymbol: BreakdownRow[];
  bySide: BreakdownRow[];
  unattributedTrades: number;
  metadata: AnalyticsMetadata;
}

interface DrawdownResponse {
  ok: boolean;
  curve: DrawdownPoint[];
  maxDrawdown: number;
  metadata: AnalyticsMetadata;
}

const money = (value: number | null | undefined, signed = false) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "N/A";
  const numeric = Number(value);
  const prefix = signed && numeric > 0 ? "+" : "";
  return `${prefix}${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(numeric)} USDT`;
};

const decimal = (value: number | null | undefined, digits = 2) => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "N/A";
  return Number(value).toFixed(digits);
};

const dateTime = (value: number | null | undefined) => {
  if (!value) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "N/A" : date.toLocaleString();
};

function buildPolyline(
  values: number[],
  width: number,
  height: number,
  padding: number,
  domainMin: number,
  domainMax: number,
): string {
  if (!values.length) return "";
  const span = domainMax - domainMin || 1;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;
  return values
    .map((value, index) => {
      const x = padding + (values.length === 1 ? usableWidth / 2 : (index / (values.length - 1)) * usableWidth);
      const y = padding + ((domainMax - value) / span) * usableHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

const MetricCard: React.FC<{
  label: string;
  value: string;
  helper: string;
  icon: React.ElementType;
  tone?: "positive" | "negative" | "neutral";
}> = ({ label, value, helper, icon: Icon, tone = "neutral" }) => {
  const toneClass = tone === "positive" ? "text-emerald-400" : tone === "negative" ? "text-rose-400" : "text-cyan-300";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
          <div className={`mt-2 text-xl font-black font-mono ${toneClass}`}>{value}</div>
          <div className="mt-1 text-[11px] text-slate-500">{helper}</div>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-400">
          <Icon size={17} />
        </div>
      </div>
    </div>
  );
};

export const StrategyAnalyticsView: React.FC = () => {
  const [summaryData, setSummaryData] = useState<SummaryResponse | null>(null);
  const [breakdownData, setBreakdownData] = useState<BreakdownResponse | null>(null);
  const [drawdownData, setDrawdownData] = useState<DrawdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const [summary, breakdown, drawdown] = await Promise.all([
        api.getAnalyticsSummary(force),
        api.getAnalyticsBreakdown(force),
        api.getAnalyticsDrawdown(force),
      ]);
      setSummaryData(summary as SummaryResponse);
      setBreakdownData(breakdown as BreakdownResponse);
      setDrawdownData(drawdown as DrawdownResponse);
    } catch (err: any) {
      setError(err?.message || "Unable to load Bybit Demo closed-PnL analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const summary = summaryData?.summary;
  const metadata = summaryData?.metadata;
  const curve = drawdownData?.curve || [];
  const cumulativeValues = curve.map((point) => Number(point.cumulativePnl || 0));
  const drawdownValues = curve.map((point) => -Math.abs(Number(point.drawdown || 0)));
  const chart = useMemo(() => {
    const combined = [...cumulativeValues, ...drawdownValues];
    const domainMin = combined.length ? Math.min(...combined, 0) : 0;
    const domainMax = combined.length ? Math.max(...combined, 0) : 1;
    return {
      equity: buildPolyline(cumulativeValues, 900, 250, 30, domainMin, domainMax),
      drawdown: buildPolyline(drawdownValues, 900, 250, 30, domainMin, domainMax),
      zeroY: 30 + ((domainMax - 0) / (domainMax - domainMin || 1)) * 190,
    };
  }, [cumulativeValues, drawdownValues]);

  if (loading && !summaryData) {
    return (
      <div className="max-w-[1500px] mx-auto py-4 space-y-4">
        <div className="h-28 rounded-xl border border-slate-800 bg-slate-900 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-28 rounded-xl border border-slate-800 bg-slate-900 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto py-4 space-y-4" id="strategy-analytics-live">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-cyan-400">
              <BarChart3 size={25} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-black text-slate-100">Strategy Analytics</h2>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400">Live Exchange Truth</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">Latest {metadata?.lookbackDays || 7}-day performance calculated only from Bybit Demo closed-PnL records.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] text-slate-400">
              <span className="font-bold text-slate-200">Sample:</span> {metadata?.sampleSize ?? 0}/{metadata?.sampleLimit ?? 200} closed trades
            </div>
            <button
              onClick={() => load(true)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh Analytics
            </button>
          </div>
        </div>
      </section>

      {error && (
        <section className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 text-sm text-rose-200">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 shrink-0 text-rose-400" size={18} />
            <div>
              <div className="font-bold">Analytics request failed</div>
              <div className="mt-1 text-xs text-rose-300/80">{error}</div>
            </div>
          </div>
        </section>
      )}

      {!error && summary && summary.totalTrades === 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-10 text-center shadow-xl">
          <Database size={34} className="mx-auto text-slate-500" />
          <h3 className="mt-4 text-lg font-bold text-slate-100">No closed Bybit Demo trades in the latest {metadata?.lookbackDays || 7} days</h3>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-slate-400">
            Analytics is connected and working, but the Demo account returned no closed-PnL rows for this exchange window. Metrics will populate after a position is closed.
          </p>
        </section>
      )}

      {summary && summary.totalTrades > 0 && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label="Net P&L" value={money(summary.netPnl, true)} helper={`Gross +${decimal(summary.grossProfit)} / -${decimal(summary.grossLoss)}`} icon={summary.netPnl >= 0 ? TrendingUp : TrendingDown} tone={summary.netPnl >= 0 ? "positive" : "negative"} />
            <MetricCard label="Win Rate" value={`${decimal(summary.winRatePct)}%`} helper={`${summary.wins}W · ${summary.losses}L · ${summary.breakeven} BE`} icon={Target} tone={summary.winRatePct >= 50 ? "positive" : "negative"} />
            <MetricCard label="Profit Factor" value={decimal(summary.profitFactor)} helper="Gross profit ÷ gross loss" icon={Gauge} tone={(summary.profitFactor || 0) >= 1 ? "positive" : "negative"} />
            <MetricCard label="Expectancy" value={money(summary.expectancy, true)} helper="Average closed P&L per trade" icon={Activity} tone={summary.expectancy >= 0 ? "positive" : "negative"} />
            <MetricCard label="Trade P&L Sharpe" value={decimal(summary.pnlSharpe)} helper="Non-annualized, zero benchmark" icon={BarChart3} tone={(summary.pnlSharpe || 0) >= 0 ? "positive" : "negative"} />
            <MetricCard label="Maximum Drawdown" value={money(summary.maxDrawdown)} helper={`Current ${money(summary.currentDrawdown)}`} icon={TrendingDown} tone="negative" />
            <MetricCard label="Average Win / Loss" value={`${decimal(summary.averageWin)} / ${decimal(summary.averageLoss)}`} helper={`Payoff ratio ${decimal(summary.payoffRatio)}`} icon={TrendingUp} />
            <MetricCard label="Best / Worst Trade" value={`${decimal(summary.bestTrade)} / ${decimal(summary.worstTrade)}`} helper={`Streaks ${summary.maxConsecutiveWins}W / ${summary.maxConsecutiveLosses}L`} icon={ShieldAlert} />
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-100">Cumulative P&L & Drawdown</h3>
                  <p className="mt-1 text-[11px] text-slate-500">One shared USDT scale · chronological closed trades</p>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-cyan-300"><span className="h-0.5 w-5 bg-cyan-400" />Cumulative P&L</span>
                  <span className="flex items-center gap-1.5 text-rose-300"><span className="h-0.5 w-5 bg-rose-400" />Drawdown</span>
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                <svg viewBox="0 0 900 250" className="h-[260px] w-full" preserveAspectRatio="none" role="img" aria-label="Cumulative PnL and drawdown curve">
                  {[50, 100, 150, 200].map((y) => <line key={y} x1="0" x2="900" y1={y} y2={y} stroke="#1e293b" strokeWidth="1" />)}
                  <line x1="0" x2="900" y1={chart.zeroY} y2={chart.zeroY} stroke="#475569" strokeWidth="1" strokeDasharray="5 5" />
                  {chart.equity && <polyline points={chart.equity} fill="none" stroke="#22d3ee" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
                  {chart.drawdown && <polyline points={chart.drawdown} fill="none" stroke="#fb7185" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />}
                </svg>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
                <span>{dateTime(summary.periodStart)}</span>
                <span>{curve.length} chronological points</span>
                <span>{dateTime(summary.periodEnd)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl">
              <h3 className="font-bold text-slate-100">Long vs Short</h3>
              <p className="mt-1 text-[11px] text-slate-500">Original position-side performance</p>
              <div className="mt-4 space-y-3">
                {(breakdownData?.bySide || []).map((row) => (
                  <div key={row.label} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-black ${row.label === "LONG" ? "bg-emerald-500/15 text-emerald-400" : row.label === "SHORT" ? "bg-rose-500/15 text-rose-400" : "bg-slate-700 text-slate-300"}`}>{row.label}</span>
                      <span className={`font-mono text-sm font-black ${row.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{money(row.netPnl, true)}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div><div className="text-[10px] text-slate-500">TRADES</div><div className="font-mono text-sm text-slate-200">{row.totalTrades}</div></div>
                      <div><div className="text-[10px] text-slate-500">WIN RATE</div><div className="font-mono text-sm text-cyan-300">{decimal(row.winRatePct)}%</div></div>
                      <div><div className="text-[10px] text-slate-500">PF</div><div className="font-mono text-sm text-slate-200">{decimal(row.profitFactor)}</div></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-200/80">
                Strategy attribution is unavailable for legacy exchange rows. Figures are grouped truthfully by symbol and original position side only.
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900 shadow-xl overflow-hidden">
              <div className="border-b border-slate-800 px-4 py-3">
                <h3 className="font-bold text-slate-100">Symbol Performance</h3>
                <p className="mt-1 text-[11px] text-slate-500">Sorted by net closed P&L</p>
              </div>
              <div className="max-h-[360px] overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr><th className="px-4 py-3">Symbol</th><th className="px-3 py-3">Trades</th><th className="px-3 py-3">Win Rate</th><th className="px-3 py-3">PF</th><th className="px-4 py-3 text-right">Net P&L</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {(breakdownData?.bySymbol || []).map((row) => (
                      <tr key={row.label} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 font-mono font-bold text-slate-100">{row.label}</td>
                        <td className="px-3 py-3 font-mono text-slate-300">{row.totalTrades}</td>
                        <td className="px-3 py-3 font-mono text-cyan-300">{decimal(row.winRatePct)}%</td>
                        <td className="px-3 py-3 font-mono text-slate-300">{decimal(row.profitFactor)}</td>
                        <td className={`px-4 py-3 text-right font-mono font-bold ${row.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{money(row.netPnl, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 shadow-xl overflow-hidden">
              <div className="border-b border-slate-800 px-4 py-3">
                <h3 className="font-bold text-slate-100">Recent Closed Trades</h3>
                <p className="mt-1 text-[11px] text-slate-500">Latest verified Bybit Demo closed-PnL rows</p>
              </div>
              <div className="max-h-[360px] overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr><th className="px-4 py-3">Closed</th><th className="px-3 py-3">Symbol</th><th className="px-3 py-3">Position</th><th className="px-4 py-3 text-right">P&L</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {(summaryData?.recentTrades || []).map((trade) => (
                      <tr key={trade.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-3 text-[11px] text-slate-400">{dateTime(trade.closedAt)}</td>
                        <td className="px-3 py-3 font-mono font-bold text-slate-100">{trade.symbol}</td>
                        <td className="px-3 py-3"><span className={`rounded px-2 py-0.5 text-[10px] font-bold ${trade.side === "LONG" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>{trade.side}</span></td>
                        <td className={`px-4 py-3 text-right font-mono font-black ${trade.closedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{money(trade.closedPnl, true)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-[10px] font-mono text-slate-500">
        <span className="flex items-center gap-2"><Database size={13} className="text-emerald-400" />Source: {metadata?.source || "BYBIT_DEMO_CLOSED_PNL"}</span>
        <span className="flex items-center gap-2"><Clock3 size={13} className="text-cyan-400" />Window: {dateTime(metadata?.windowStart)} → {dateTime(metadata?.windowEnd)}</span>
        <span>{metadata?.sampleLimited ? "Sample capped at configured limit" : `Latest ${metadata?.lookbackDays || 7}-day exchange window`}</span>
      </section>
    </div>
  );
};
