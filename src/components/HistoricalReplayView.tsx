import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Database,
  FastForward,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  StepForward,
} from "lucide-react";

import { api } from "../services/api";
import {
  ReplayJournalEntry,
  ReplayJournalResponse,
  ReplayPerformanceResponse,
  ReplaySafetyStatus,
  ReplaySession,
  ReplayStartRequest,
} from "../types";

const INTERVAL_MS: Record<string, number> = {
  "1": 60_000,
  "3": 180_000,
  "5": 300_000,
  "15": 900_000,
  "30": 1_800_000,
  "60": 3_600_000,
  "120": 7_200_000,
  "240": 14_400_000,
};

function defaultReplayRange(): { start: string; end: string } {
  const interval = INTERVAL_MS["5"];
  const end = Math.floor(Date.now() / interval) * interval - interval;
  const start = end - 12 * 60 * 60 * 1000;
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

function toLocalInput(timestamp: number): string {
  const date = new Date(timestamp);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function fromLocalInput(value: string): number {
  return new Date(value).getTime();
}

function formatTime(timestamp: number | null | undefined): string {
  if (!timestamp) return "Not started";
  return new Date(timestamp).toLocaleString();
}

function formatMoney(value: string | number | null | undefined): string {
  const number = Number(value ?? 0);
  return Number.isFinite(number)
    ? number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : "0.00";
}

function requestId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80);
}

function statusClass(status: string): string {
  if (status === "COMPLETED") return "text-emerald-300 bg-emerald-500/10 border-emerald-500/30";
  if (status === "PAUSED") return "text-amber-300 bg-amber-500/10 border-amber-500/30";
  if (status === "RUNNING") return "text-cyan-300 bg-cyan-500/10 border-cyan-500/30";
  if (status === "FAILED") return "text-rose-300 bg-rose-500/10 border-rose-500/30";
  return "text-slate-300 bg-slate-700/30 border-slate-600";
}

const MetricCard: React.FC<{ label: string; value: React.ReactNode; hint?: string; testId?: string }> = ({
  label,
  value,
  hint,
  testId,
}) => (
  <div className="rounded-lg border border-slate-800 bg-[#0c111b] p-3 min-w-0">
    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
    <div className="mt-1 text-lg font-bold text-slate-100 truncate" data-testid={testId}>{value}</div>
    {hint && <div className="mt-1 text-[10px] text-slate-600 truncate">{hint}</div>}
  </div>
);

const EquityCurve: React.FC<{ points: ReplayPerformanceResponse["equityCurve"] }> = ({ points }) => {
  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.map((point) => Number(point.equity)).filter(Number.isFinite);
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(max - min, 0.00000001);
    const coordinates = values.map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 40 - ((value - min) / spread) * 36 - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    return { min, max, polyline: coordinates.join(" ") };
  }, [points]);

  if (!geometry) {
    return <div className="h-36 grid place-items-center text-xs text-slate-600">Equity marks will appear after replay steps.</div>;
  }

  return (
    <div className="relative h-36" data-testid="replay-equity-curve">
      <svg viewBox="0 0 100 42" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <line x1="0" y1="40" x2="100" y2="40" stroke="currentColor" className="text-slate-800" strokeWidth="0.35" />
        <polyline points={geometry.polyline} fill="none" stroke="currentColor" className="text-cyan-400" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute left-1 top-1 text-[9px] text-slate-500">High {formatMoney(geometry.max)}</div>
      <div className="absolute left-1 bottom-1 text-[9px] text-slate-500">Low {formatMoney(geometry.min)}</div>
    </div>
  );
};

export const HistoricalReplayView: React.FC = () => {
  const initialRange = useMemo(defaultReplayRange, []);
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [timeframe, setTimeframe] = useState("5");
  const [startTime, setStartTime] = useState(initialRange.start);
  const [endTime, setEndTime] = useState(initialRange.end);
  const [initialBalance, setInitialBalance] = useState("1000");
  const [strategyMode, setStrategyMode] = useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [feeBps, setFeeBps] = useState("6");
  const [maxLeverage, setMaxLeverage] = useState("3");

  const [safety, setSafety] = useState<ReplaySafetyStatus | null>(null);
  const [sessions, setSessions] = useState<ReplaySession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReplaySession | null>(null);
  const [performance, setPerformance] = useState<ReplayPerformanceResponse | null>(null);
  const [journal, setJournal] = useState<ReplayJournalResponse | null>(null);
  const [journalCategory, setJournalCategory] = useState("all");
  const [activePanel, setActivePanel] = useState<"performance" | "journal">("performance");
  const [busy, setBusy] = useState<string | null>("initial");
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async (preferredId?: string | null) => {
    const response = await api.listReplaySessions(50);
    setSessions(response.sessions);
    const target = preferredId || selectedId || response.sessions[0]?.sessionId || null;
    if (target) setSelectedId(target);
    return response.sessions;
  }, [selectedId]);

  const loadSelected = useCallback(async (sessionId: string, category = journalCategory) => {
    const [detail, performanceResult, journalResult] = await Promise.all([
      api.getReplaySession(sessionId),
      api.getReplayPerformance(sessionId, 200),
      api.getReplayJournal(sessionId, {
        limit: 50,
        direction: "desc",
        category,
        includePayload: true,
        includeTrades: true,
        tradeLimit: 50,
      }),
    ]);
    setSelected(detail.session);
    setPerformance(performanceResult);
    setJournal(journalResult);
    return detail.session;
  }, [journalCategory]);

  const refreshAll = useCallback(async (preferredId?: string | null) => {
    setBusy("refresh");
    setError(null);
    try {
      const [safetyResult, sessionRows] = await Promise.all([
        api.getReplayStatus(),
        loadSessions(preferredId),
      ]);
      setSafety(safetyResult);
      const target = preferredId || selectedId || sessionRows[0]?.sessionId;
      if (target) await loadSelected(target);
      else {
        setSelected(null);
        setPerformance(null);
        setJournal(null);
      }
    } catch (err: any) {
      setError(err?.message || "Unable to load Historical Replay state.");
    } finally {
      setBusy(null);
    }
  }, [loadSelected, loadSessions, selectedId]);

  useEffect(() => {
    void refreshAll();
    // Initial load only. Subsequent refreshes are explicit to avoid replay-state races.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId || selected?.sessionId === selectedId) return;
    setBusy("select");
    setError(null);
    void loadSelected(selectedId)
      .catch((err: any) => setError(err?.message || "Unable to load the selected replay session."))
      .finally(() => setBusy(null));
  }, [loadSelected, selected?.sessionId, selectedId]);

  const handleStart = async () => {
    const start = fromLocalInput(startTime);
    const end = fromLocalInput(endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      setError("Replay end time must be later than start time.");
      return;
    }
    setBusy("start");
    setError(null);
    try {
      const sessionId = requestId("replay_ui");
      const payload: ReplayStartRequest & { sessionId: string } = {
        sessionId,
        symbol: symbol.trim().toUpperCase(),
        timeframe,
        startTime: start,
        endTime: end,
        initialBalance,
        strategyMode,
        autoSync: true,
        config: {
          replayFeeBps: feeBps,
          maxLeverage,
        },
      };
      const result = await api.startReplaySession(payload);
      setSelectedId(result.session.sessionId);
      setSelected(result.session);
      await loadSessions(result.session.sessionId);
      await loadSelected(result.session.sessionId);
    } catch (err: any) {
      setError(err?.message || "Unable to create the replay session.");
    } finally {
      setBusy(null);
    }
  };

  const handleStep = async (steps: number) => {
    if (!selected) return;
    setBusy(`step-${steps}`);
    setError(null);
    try {
      const result = await api.stepReplaySession(
        selected.sessionId,
        selected.cursorTime,
        steps,
        requestId(`step_${steps}`),
      );
      setSelected(result.session);
      await Promise.all([
        loadSessions(result.session.sessionId),
        loadSelected(result.session.sessionId),
      ]);
    } catch (err: any) {
      setError(err?.message || "Replay step failed.");
      await loadSelected(selected.sessionId).catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  const handleReset = async () => {
    if (!selected) return;
    setBusy("reset");
    setError(null);
    try {
      const result = await api.resetReplaySession(selected.sessionId);
      setSelected(result.session);
      await Promise.all([
        loadSessions(result.session.sessionId),
        loadSelected(result.session.sessionId),
      ]);
    } catch (err: any) {
      setError(err?.message || "Replay reset failed.");
    } finally {
      setBusy(null);
    }
  };

  const reloadJournal = async (category: string) => {
    setJournalCategory(category);
    if (!selected) return;
    setBusy("journal-filter");
    setError(null);
    try {
      const result = await api.getReplayJournal(selected.sessionId, {
        limit: 50,
        direction: "desc",
        category,
        includePayload: true,
        includeTrades: true,
        tradeLimit: 50,
      });
      setJournal(result);
    } catch (err: any) {
      setError(err?.message || "Unable to filter the replay journal.");
    } finally {
      setBusy(null);
    }
  };

  const loadOlderJournal = async () => {
    if (!selected || !journal?.pagination.hasMore || journal.pagination.nextCursorSequence === null) return;
    setBusy("journal-more");
    try {
      const next = await api.getReplayJournal(selected.sessionId, {
        limit: 50,
        direction: "desc",
        cursorSequence: journal.pagination.nextCursorSequence,
        category: journalCategory,
        includePayload: true,
        includeTrades: false,
      });
      setJournal({
        ...journal,
        entries: [...journal.entries, ...next.entries],
        pagination: next.pagination,
      });
    } catch (err: any) {
      setError(err?.message || "Unable to load older replay events.");
    } finally {
      setBusy(null);
    }
  };

  const metrics = performance?.metrics;
  const isBusy = busy !== null;
  const canStep = selected && selected.status !== "COMPLETED" && selected.status !== "RUNNING";

  return (
    <section className="space-y-3" data-testid="historical-replay-view">
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-2 text-cyan-300"><RotateCcw size={18} /></div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Historical Replay</h2>
            <p className="text-xs text-slate-400 mt-0.5">Frozen candles → strategy → risk → simulated fills → performance journal.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300" data-testid="replay-safety-badge">
            <ShieldCheck size={12} /> EXTERNAL EXECUTION BLOCKED
          </span>
          <span className={`rounded border px-2 py-1 ${safety?.simulatedExecutionImplemented ? "border-cyan-500/30 text-cyan-300" : "border-amber-500/30 text-amber-300"}`}>
            {safety?.simulatedExecutionImplemented ? "STEP 8 BACKEND READY" : "CHECKING BACKEND"}
          </span>
          <button onClick={() => void refreshAll(selectedId)} disabled={isBusy} className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300 hover:border-slate-500 disabled:opacity-50" id="replay-refresh-button">
            <RefreshCw size={12} className={busy === "refresh" ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200 flex items-start gap-2" role="alert" data-testid="replay-error">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        <div className="xl:col-span-4 space-y-3">
          <div className="rounded-xl border border-slate-800 bg-[#0b0f18] p-3">
            <div className="flex items-center gap-2 mb-3"><Play size={15} className="text-cyan-400" /><h3 className="text-sm font-bold">New replay session</h3></div>
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 text-[10px] text-slate-500">Symbol
                <input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500" id="replay-symbol-input" />
              </label>
              <label className="text-[10px] text-slate-500">Timeframe
                <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100" id="replay-timeframe-input">
                  {Object.keys(INTERVAL_MS).map((value) => <option key={value} value={value}>{value}m</option>)}
                </select>
              </label>
              <label className="text-[10px] text-slate-500">Strategy
                <select value={strategyMode} onChange={(event) => setStrategyMode(event.target.value as typeof strategyMode)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100" id="replay-strategy-input">
                  <option value="conservative">Conservative</option>
                  <option value="balanced">Balanced</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </label>
              <label className="col-span-2 text-[10px] text-slate-500">Start time
                <input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100" id="replay-start-input" />
              </label>
              <label className="col-span-2 text-[10px] text-slate-500">End time
                <input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100" id="replay-end-input" />
              </label>
              <label className="text-[10px] text-slate-500">Initial USDT
                <input type="number" min="1" value={initialBalance} onChange={(event) => setInitialBalance(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100" id="replay-balance-input" />
              </label>
              <label className="text-[10px] text-slate-500">Fee (bps)
                <input type="number" min="0" max="100" step="0.1" value={feeBps} onChange={(event) => setFeeBps(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100" id="replay-fee-input" />
              </label>
              <label className="col-span-2 text-[10px] text-slate-500">Maximum leverage
                <input type="number" min="1" max="10" step="0.1" value={maxLeverage} onChange={(event) => setMaxLeverage(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100" id="replay-leverage-input" />
              </label>
            </div>
            <button onClick={handleStart} disabled={isBusy} className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50" data-testid="replay-create-button">
              {busy === "start" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Create & sync session
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0b0f18] p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><Database size={14} className="text-slate-400" /><h3 className="text-sm font-bold">Replay sessions</h3></div>
              <span className="text-[10px] font-mono text-slate-500">{sessions.length}</span>
            </div>
            <div className="space-y-1 max-h-72 overflow-y-auto" data-testid="replay-session-list">
              {sessions.length === 0 && <div className="rounded border border-dashed border-slate-800 p-4 text-center text-xs text-slate-600">No replay session yet.</div>}
              {sessions.map((session) => (
                <button key={session.sessionId} onClick={() => setSelectedId(session.sessionId)} className={`w-full rounded-lg border p-2.5 text-left transition-colors ${selectedId === session.sessionId ? "border-cyan-500/40 bg-cyan-500/[0.08]" : "border-slate-800 bg-slate-950/50 hover:border-slate-700"}`} data-session-id={session.sessionId}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-200">{session.symbol} · {session.timeframe}m</span>
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-mono ${statusClass(session.status)}`}>{session.status}</span>
                  </div>
                  <div className="mt-1 truncate text-[9px] font-mono text-slate-600">{session.sessionId}</div>
                  <div className="mt-1 text-[9px] text-slate-500">Cursor: {formatTime(session.cursorTime)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="xl:col-span-8 space-y-3">
          {!selected ? (
            <div className="min-h-[420px] rounded-xl border border-dashed border-slate-800 bg-[#0b0f18] grid place-items-center text-center p-8">
              <div><RotateCcw size={30} className="mx-auto text-slate-700" /><p className="mt-3 text-sm text-slate-400">Create or select a replay session.</p></div>
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-slate-800 bg-[#0b0f18] p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-slate-100">{selected.symbol} · {selected.timeframe}m</h3>
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-mono ${statusClass(selected.status)}`} data-testid="replay-status">{selected.status}</span>
                    </div>
                    <div className="mt-1 truncate text-[10px] font-mono text-slate-500" data-testid="replay-selected-id">{selected.sessionId}</div>
                    <div className="mt-1 text-[10px] text-slate-500">{formatTime(selected.startTime)} → {formatTime(selected.endTime)}</div>
                    <div className="text-[10px] text-slate-500">Cursor: <span data-testid="replay-cursor">{formatTime(selected.cursorTime)}</span></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => void handleStep(1)} disabled={!canStep || isBusy} className="inline-flex items-center gap-1.5 rounded border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] font-bold text-cyan-200 disabled:opacity-40" data-testid="replay-step-1"><StepForward size={14} /> Step 1</button>
                    <button onClick={() => void handleStep(10)} disabled={!canStep || isBusy} className="inline-flex items-center gap-1.5 rounded border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[11px] font-bold text-blue-200 disabled:opacity-40" data-testid="replay-step-10"><FastForward size={14} /> Step 10</button>
                    <button onClick={() => void handleStep(100)} disabled={!canStep || isBusy} className="inline-flex items-center gap-1.5 rounded border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[11px] font-bold text-violet-200 disabled:opacity-40" data-testid="replay-step-100"><FastForward size={14} /> Step 100</button>
                    <button onClick={handleReset} disabled={isBusy || selected.status === "RUNNING"} className="inline-flex items-center gap-1.5 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-200 disabled:opacity-40" data-testid="replay-reset-button"><RotateCcw size={14} /> Reset</button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <MetricCard label="Balance" value={`${formatMoney(metrics?.balance ?? selected.balance)} USDT`} />
                <MetricCard label="Net PnL" value={`${Number(metrics?.netPnl ?? 0) >= 0 ? "+" : ""}${formatMoney(metrics?.netPnl)} USDT`} />
                <MetricCard label="Win rate" value={`${metrics?.winRatePct ?? "0.0000"}%`} />
                <MetricCard label="Trades" value={metrics?.totalTrades ?? 0} hint={`${metrics?.openTrades ?? 0} open · ${metrics?.closedTrades ?? 0} closed`} testId="replay-total-trades" />
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#0b0f18] overflow-hidden">
                <div className="flex items-center border-b border-slate-800 p-1">
                  <button onClick={() => setActivePanel("performance")} className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-xs font-semibold ${activePanel === "performance" ? "bg-cyan-500/10 text-cyan-300" : "text-slate-500 hover:text-slate-300"}`} data-testid="replay-performance-tab"><BarChart3 size={14} /> Performance</button>
                  <button onClick={() => setActivePanel("journal")} className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-xs font-semibold ${activePanel === "journal" ? "bg-cyan-500/10 text-cyan-300" : "text-slate-500 hover:text-slate-300"}`} data-testid="replay-journal-tab"><BookOpen size={14} /> Journal</button>
                  {busy && <Loader2 size={13} className="ml-auto mr-2 animate-spin text-cyan-400" />}
                </div>

                {activePanel === "performance" ? (
                  <div className="p-3 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <MetricCard label="Gross profit" value={formatMoney(metrics?.grossProfit)} />
                      <MetricCard label="Gross loss" value={formatMoney(metrics?.grossLoss)} />
                      <MetricCard label="Fees" value={formatMoney(metrics?.feesPaid)} />
                      <MetricCard label="Profit factor" value={metrics?.profitFactor ?? metrics?.profitFactorStatus ?? "N/A"} />
                      <MetricCard label="Average R" value={metrics?.averageR ?? "0.0000"} />
                      <MetricCard label="Expectancy" value={formatMoney(metrics?.expectancy)} />
                      <MetricCard label="Max drawdown" value={`${formatMoney(metrics?.maxDrawdown)} (${metrics?.maxDrawdownPct ?? "0.0000"}%)`} />
                      <MetricCard label="Recovery factor" value={metrics?.recoveryFactor ?? "N/A"} />
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                      <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-300">Equity curve</span><span className="text-[9px] font-mono text-slate-600">{performance?.equityCurveMeta.returnedPoints ?? 0}/{performance?.equityCurveMeta.totalMarks ?? 0} marks</span></div>
                      <EquityCurve points={performance?.equityCurve ?? []} />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={journalCategory} onChange={(event) => void reloadJournal(event.target.value)} className="rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-300" id="replay-journal-category">
                        {["all", "session", "step", "candle", "strategy", "risk", "execution", "trade", "pnl"].map((category) => <option key={category} value={category}>{category}</option>)}
                      </select>
                      <span className="text-[10px] text-slate-500">{journal?.journalSummary.totalEvents ?? 0} events · {journal?.journalSummary.totalTrades ?? 0} trades</span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1" data-testid="replay-journal-list">
                        {(journal?.entries ?? []).map((entry: ReplayJournalEntry) => (
                          <div key={entry.sequenceNo} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5" data-testid="replay-journal-entry">
                            <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-cyan-300">#{entry.sequenceNo} {entry.eventType}</span><span className="text-[9px] text-slate-600">{formatTime(entry.candleOpenTime ?? entry.createdAt * 1000)}</span></div>
                            {entry.payload && <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all text-[9px] leading-relaxed text-slate-500">{JSON.stringify(entry.payload, null, 2)}</pre>}
                          </div>
                        ))}
                        {(journal?.entries.length ?? 0) === 0 && <div className="rounded border border-dashed border-slate-800 p-6 text-center text-xs text-slate-600">No matching replay events.</div>}
                        {journal?.pagination.hasMore && <button onClick={loadOlderJournal} disabled={isBusy} className="w-full rounded border border-slate-700 px-3 py-2 text-xs text-slate-400 hover:text-white disabled:opacity-50">Load older events</button>}
                      </div>

                      <div className="space-y-1 max-h-[360px] overflow-y-auto pr-1" data-testid="replay-trade-list">
                        {(journal?.trades ?? []).map((trade) => (
                          <div key={trade.tradeId} className="rounded-lg border border-slate-800 bg-slate-950/50 p-2.5">
                            <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-200">{trade.symbol} {trade.side}</span><span className={`rounded border px-1.5 py-0.5 text-[9px] ${statusClass(trade.status)}`}>{trade.status}</span></div>
                            <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-slate-500"><span>Entry {formatMoney(trade.entryPrice)}</span><span>Exit {formatMoney(trade.exitPrice)}</span><span>PnL {formatMoney(trade.realizedPnl)}</span><span>Fees {formatMoney(trade.fees)}</span></div>
                          </div>
                        ))}
                        {(journal?.trades.length ?? 0) === 0 && <div className="rounded border border-dashed border-slate-800 p-6 text-center text-xs text-slate-600">No simulated trades yet.</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
