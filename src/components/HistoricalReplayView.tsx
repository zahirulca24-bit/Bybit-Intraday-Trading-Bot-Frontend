import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Database,
  FastForward,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  StepForward,
} from "lucide-react";

import { api } from "../services/api";
import {
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

const SPEEDS = [1, 5, 20] as const;
type ReplaySpeed = (typeof SPEEDS)[number];

function toLocalInput(timestamp: number): string {
  const date = new Date(timestamp);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function defaultReplayRange(): { start: string; end: string } {
  const interval = INTERVAL_MS["5"];
  const end = Math.floor(Date.now() / interval) * interval - interval;
  const start = end - 12 * 60 * 60 * 1000;
  return { start: toLocalInput(start), end: toLocalInput(end) };
}

function fromLocalInput(value: string): number {
  return new Date(value).getTime();
}

function formatTime(timestamp: number | null | undefined): string {
  if (!timestamp) return "Not started";
  const normalized = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  return new Date(normalized).toLocaleString();
}

function formatMoney(value: string | number | null | undefined): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
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

const MetricCard: React.FC<{ label: string; value: React.ReactNode; hint?: string; testId?: string }> = ({ label, value, hint, testId }) => (
  <div className="min-w-0 rounded-lg border border-slate-800 bg-[#0c111b] p-3">
    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    <div className="mt-1 truncate text-lg font-bold text-slate-100" data-testid={testId}>{value}</div>
    {hint && <div className="mt-1 truncate text-[10px] text-slate-600">{hint}</div>}
  </div>
);

const EquityCurve: React.FC<{ points: ReplayPerformanceResponse["equityCurve"] }> = ({ points }) => {
  const geometry = useMemo(() => {
    const values = points.map((point) => Number(point.equity)).filter(Number.isFinite);
    if (values.length < 2) return null;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(max - min, 0.00000001);
    const polyline = values.map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 40 - ((value - min) / spread) * 36 - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
    return { min, max, polyline };
  }, [points]);

  if (!geometry) return <div className="grid h-36 place-items-center text-xs text-slate-600">Equity marks will appear after replay steps.</div>;

  return (
    <div className="relative h-36" data-testid="replay-equity-curve">
      <svg viewBox="0 0 100 42" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <line x1="0" y1="40" x2="100" y2="40" stroke="currentColor" className="text-slate-800" strokeWidth="0.35" />
        <polyline points={geometry.polyline} fill="none" stroke="currentColor" className="text-cyan-400" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="absolute left-1 top-1 text-[9px] text-slate-500">High {formatMoney(geometry.max)}</div>
      <div className="absolute bottom-1 left-1 text-[9px] text-slate-500">Low {formatMoney(geometry.min)}</div>
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
  const [activePanel, setActivePanel] = useState<"performance" | "journal">("performance");
  const [busy, setBusy] = useState<string | null>("initial");
  const [error, setError] = useState<string | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const [autoplayError, setAutoplayError] = useState<string | null>(null);
  const autoplayTimer = useRef<number | null>(null);

  const loadSessions = useCallback(async (preferredId?: string | null) => {
    const response = await api.listReplaySessions(50);
    setSessions(response.sessions);
    const target = preferredId || selectedId || response.sessions[0]?.sessionId || null;
    if (target) setSelectedId(target);
    return response.sessions;
  }, [selectedId]);

  const loadSelected = useCallback(async (sessionId: string) => {
    const [detail, performanceResult, journalResult] = await Promise.all([
      api.getReplaySession(sessionId),
      api.getReplayPerformance(sessionId, 200),
      api.getReplayJournal(sessionId, { limit: 50, direction: "desc", includePayload: true, includeTrades: true, tradeLimit: 50 }),
    ]);
    setSelected(detail.session);
    setPerformance(performanceResult);
    setJournal(journalResult);
    return detail.session;
  }, []);

  const refreshAll = useCallback(async (preferredId?: string | null) => {
    setBusy("refresh");
    setError(null);
    try {
      const [safetyResult, rows] = await Promise.all([api.getReplayStatus(), loadSessions(preferredId)]);
      setSafety(safetyResult);
      const target = preferredId || selectedId || rows[0]?.sessionId;
      if (target) await loadSelected(target);
    } catch (err: any) {
      setError(err?.message || "Unable to load Historical Replay state.");
    } finally {
      setBusy(null);
    }
  }, [loadSelected, loadSessions, selectedId]);

  useEffect(() => { void refreshAll(); }, []);

  useEffect(() => {
    if (!selectedId || selected?.sessionId === selectedId) return;
    setAutoplay(false);
    setBusy("select");
    setError(null);
    void loadSelected(selectedId)
      .catch((err: any) => setError(err?.message || "Unable to load selected replay session."))
      .finally(() => setBusy(null));
  }, [loadSelected, selected?.sessionId, selectedId]);

  const runStep = useCallback(async (steps: number, source: "manual" | "autoplay" = "manual") => {
    if (!selected) return null;
    setBusy(source === "autoplay" ? "autoplay" : `step-${steps}`);
    setError(null);
    try {
      const result = await api.stepReplaySession(selected.sessionId, selected.cursorTime, steps, requestId(`${source}_${steps}`));
      setSelected(result.session);
      await Promise.all([loadSessions(result.session.sessionId), loadSelected(result.session.sessionId)]);
      if (result.completed || result.session.status === "COMPLETED") setAutoplay(false);
      return result.session;
    } catch (err: any) {
      const message = err?.message || "Replay step failed.";
      if (source === "autoplay") {
        setAutoplay(false);
        setAutoplayError(message);
      } else {
        setError(message);
      }
      await loadSelected(selected.sessionId).catch(() => undefined);
      return null;
    } finally {
      setBusy(null);
    }
  }, [loadSelected, loadSessions, selected]);

  const canStep = Boolean(selected && selected.status !== "COMPLETED" && selected.status !== "RUNNING");
  const isBusy = busy !== null;

  useEffect(() => {
    if (!autoplay || !canStep || isBusy) return;
    autoplayTimer.current = window.setTimeout(() => { void runStep(speed, "autoplay"); }, 900);
    return () => {
      if (autoplayTimer.current !== null) window.clearTimeout(autoplayTimer.current);
      autoplayTimer.current = null;
    };
  }, [autoplay, canStep, isBusy, runStep, speed, selected?.cursorTime]);

  useEffect(() => () => {
    if (autoplayTimer.current !== null) window.clearTimeout(autoplayTimer.current);
  }, []);

  const handleStart = async () => {
    const start = fromLocalInput(startTime);
    const end = fromLocalInput(endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      setError("Replay end time must be later than start time.");
      return;
    }
    setAutoplay(false);
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
        config: { replayFeeBps: feeBps, maxLeverage },
      };
      const result = await api.startReplaySession(payload);
      setSelectedId(result.session.sessionId);
      setSelected(result.session);
      await Promise.all([loadSessions(result.session.sessionId), loadSelected(result.session.sessionId)]);
    } catch (err: any) {
      setError(err?.message || "Unable to create replay session.");
    } finally {
      setBusy(null);
    }
  };

  const handleReset = async () => {
    if (!selected) return;
    setAutoplay(false);
    setAutoplayError(null);
    setBusy("reset");
    setError(null);
    try {
      const result = await api.resetReplaySession(selected.sessionId);
      setSelected(result.session);
      await Promise.all([loadSessions(result.session.sessionId), loadSelected(result.session.sessionId)]);
    } catch (err: any) {
      setError(err?.message || "Replay reset failed.");
    } finally {
      setBusy(null);
    }
  };

  const progress = useMemo(() => {
    if (!selected) return { pct: 0, processed: 0, total: 0, remaining: 0 };
    const interval = INTERVAL_MS[selected.timeframe] || 300_000;
    const total = Math.max(1, Math.ceil((selected.endTime - selected.startTime) / interval));
    const cursor = selected.cursorTime ?? selected.startTime - interval;
    const processed = Math.max(0, Math.min(total, Math.floor((cursor - selected.startTime) / interval) + 1));
    return { pct: Math.min(100, (processed / total) * 100), processed, total, remaining: Math.max(0, total - processed) };
  }, [selected]);

  const stale = useMemo(() => {
    if (!selected || selected.status === "COMPLETED") return false;
    const updated = selected.updatedAt < 1_000_000_000_000 ? selected.updatedAt * 1000 : selected.updatedAt;
    return Date.now() - updated > 120_000;
  }, [selected, busy]);

  const metrics = performance?.metrics;

  return (
    <section className="space-y-3" data-testid="historical-replay-view">
      <div className="flex flex-col gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/[0.04] p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-2 text-cyan-300"><RotateCcw size={18} /></div>
          <div><h2 className="text-base font-bold text-slate-100">Historical Replay</h2><p className="mt-0.5 text-xs text-slate-400">Frozen candles → strategy → risk → simulated fills → performance journal.</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
          <span className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300"><ShieldCheck size={12} /> EXTERNAL EXECUTION BLOCKED</span>
          <span className={`rounded border px-2 py-1 ${safety?.simulatedExecutionImplemented ? "border-cyan-500/30 text-cyan-300" : "border-amber-500/30 text-amber-300"}`}>{safety?.simulatedExecutionImplemented ? "BACKEND READY" : "CHECKING BACKEND"}</span>
          <button onClick={() => void refreshAll(selectedId)} disabled={isBusy} className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300 disabled:opacity-50"><RefreshCw size={12} className={busy === "refresh" ? "animate-spin" : ""} /> Refresh</button>
        </div>
      </div>

      {(error || autoplayError) && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200" role="alert">
          <div className="flex items-start gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" /><span>{autoplayError ? `Autoplay paused: ${autoplayError}` : error}</span></div>
          {autoplayError && <button onClick={() => { setAutoplayError(null); setAutoplay(true); }} disabled={!canStep || isBusy} className="rounded border border-rose-400/30 px-2 py-1 font-bold disabled:opacity-40">Retry</button>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <div className="space-y-3 xl:col-span-4">
          <div className="rounded-xl border border-slate-800 bg-[#0b0f18] p-3">
            <div className="mb-3 flex items-center gap-2"><Play size={15} className="text-cyan-400" /><h3 className="text-sm font-bold">New replay session</h3></div>
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 text-[10px] text-slate-500">Symbol<input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100" /></label>
              <label className="text-[10px] text-slate-500">Timeframe<select value={timeframe} onChange={(event) => setTimeframe(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100">{Object.keys(INTERVAL_MS).map((value) => <option key={value} value={value}>{value}m</option>)}</select></label>
              <label className="text-[10px] text-slate-500">Strategy<select value={strategyMode} onChange={(event) => setStrategyMode(event.target.value as typeof strategyMode)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100"><option value="conservative">Conservative</option><option value="balanced">Balanced</option><option value="aggressive">Aggressive</option></select></label>
              <label className="col-span-2 text-[10px] text-slate-500">Start time<input type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100" /></label>
              <label className="col-span-2 text-[10px] text-slate-500">End time<input type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100" /></label>
              <label className="text-[10px] text-slate-500">Initial USDT<input type="number" min="1" value={initialBalance} onChange={(event) => setInitialBalance(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100" /></label>
              <label className="text-[10px] text-slate-500">Fee (bps)<input type="number" min="0" max="100" step="0.1" value={feeBps} onChange={(event) => setFeeBps(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100" /></label>
              <label className="col-span-2 text-[10px] text-slate-500">Maximum leverage<input type="number" min="1" max="10" step="0.1" value={maxLeverage} onChange={(event) => setMaxLeverage(event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100" /></label>
            </div>
            <button onClick={handleStart} disabled={isBusy} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-2.5 text-xs font-bold text-cyan-200 disabled:opacity-50" data-testid="replay-create-button">{busy === "start" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Create & sync session</button>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0b0f18] p-3">
            <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><Database size={14} className="text-slate-400" /><h3 className="text-sm font-bold">Replay sessions</h3></div><span className="text-[10px] font-mono text-slate-500">{sessions.length}</span></div>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {sessions.length === 0 && <div className="rounded border border-dashed border-slate-800 p-4 text-center text-xs text-slate-600">No replay session yet.</div>}
              {sessions.map((session) => <button key={session.sessionId} onClick={() => setSelectedId(session.sessionId)} className={`w-full rounded-lg border p-2.5 text-left ${selectedId === session.sessionId ? "border-cyan-500/40 bg-cyan-500/[0.08]" : "border-slate-800 bg-slate-950/50"}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-200">{session.symbol} · {session.timeframe}m</span><span className={`rounded border px-1.5 py-0.5 text-[9px] font-mono ${statusClass(session.status)}`}>{session.status}</span></div><div className="mt-1 truncate text-[9px] font-mono text-slate-600">{session.sessionId}</div><div className="mt-1 text-[9px] text-slate-500">Cursor: {formatTime(session.cursorTime)}</div></button>)}
            </div>
          </div>
        </div>

        <div className="space-y-3 xl:col-span-8">
          {!selected ? <div className="grid min-h-[420px] place-items-center rounded-xl border border-dashed border-slate-800 bg-[#0b0f18] p-8 text-center text-sm text-slate-400">Create or select a replay session.</div> : <>
            <div className="rounded-xl border border-slate-800 bg-[#0b0f18] p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-100">{selected.symbol} · {selected.timeframe}m</h3><span className={`rounded border px-2 py-0.5 text-[10px] font-mono ${statusClass(selected.status)}`} data-testid="replay-status">{selected.status}</span>{stale && <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">STALE STATE</span>}</div><div className="mt-1 truncate text-[10px] font-mono text-slate-500">{selected.sessionId}</div><div className="mt-1 text-[10px] text-slate-500">Last processed candle: <span data-testid="replay-cursor">{formatTime(selected.cursorTime)}</span></div></div>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => { setAutoplayError(null); setAutoplay((value) => !value); }} disabled={!canStep || (isBusy && busy !== "autoplay")} className={`inline-flex items-center gap-1.5 rounded border px-3 py-2 text-[11px] font-bold disabled:opacity-40 ${autoplay ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`} data-testid="replay-autoplay-toggle">{autoplay ? <Pause size={14} /> : <Play size={14} />}{autoplay ? "Pause" : "Play"}</button>
                  <div className="flex rounded border border-slate-700 bg-slate-950 p-0.5" aria-label="Replay speed">{SPEEDS.map((value) => <button key={value} onClick={() => setSpeed(value)} disabled={autoplay || isBusy} className={`rounded px-2 py-1.5 text-[10px] font-bold ${speed === value ? "bg-cyan-500/20 text-cyan-200" : "text-slate-500"}`}>{value}x</button>)}</div>
                  <button onClick={() => void runStep(1)} disabled={!canStep || isBusy || autoplay} className="inline-flex items-center gap-1.5 rounded border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[11px] font-bold text-cyan-200 disabled:opacity-40" data-testid="replay-step-1"><StepForward size={14} /> Step 1</button>
                  <button onClick={() => void runStep(10)} disabled={!canStep || isBusy || autoplay} className="inline-flex items-center gap-1.5 rounded border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-[11px] font-bold text-blue-200 disabled:opacity-40" data-testid="replay-step-10"><FastForward size={14} /> Step 10</button>
                  <button onClick={() => void runStep(100)} disabled={!canStep || isBusy || autoplay} className="inline-flex items-center gap-1.5 rounded border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[11px] font-bold text-violet-200 disabled:opacity-40" data-testid="replay-step-100"><FastForward size={14} /> Step 100</button>
                  <button onClick={handleReset} disabled={isBusy || selected.status === "RUNNING"} className="inline-flex items-center gap-1.5 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-200 disabled:opacity-40" data-testid="replay-reset-button"><RotateCcw size={14} /> Reset</button>
                </div>
              </div>
              <div className="mt-3"><div className="mb-1 flex justify-between text-[10px] text-slate-500"><span>{progress.processed}/{progress.total} candles processed</span><span>{progress.remaining} remaining · {progress.pct.toFixed(1)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-cyan-500 transition-all duration-300" style={{ width: `${progress.pct}%` }} /></div></div>
              {autoplay && <div className="mt-2 text-[10px] font-mono text-emerald-300">AUTOPLAY RUNNING · {speed} candle{speed > 1 ? "s" : ""} per cycle · cursor conflicts remain backend-protected</div>}
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><MetricCard label="Balance" value={`${formatMoney(metrics?.balance ?? selected.balance)} USDT`} /><MetricCard label="Net PnL" value={`${Number(metrics?.netPnl ?? 0) >= 0 ? "+" : ""}${formatMoney(metrics?.netPnl)} USDT`} /><MetricCard label="Win rate" value={`${metrics?.winRatePct ?? "0.0000"}%`} /><MetricCard label="Trades" value={metrics?.totalTrades ?? 0} hint={`${metrics?.openTrades ?? 0} open · ${metrics?.closedTrades ?? 0} closed`} testId="replay-total-trades" /></div>

            <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0b0f18]">
              <div className="flex items-center border-b border-slate-800 p-1"><button onClick={() => setActivePanel("performance")} className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-xs font-semibold ${activePanel === "performance" ? "bg-cyan-500/10 text-cyan-300" : "text-slate-500"}`}><BarChart3 size={14} /> Performance</button><button onClick={() => setActivePanel("journal")} className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-xs font-semibold ${activePanel === "journal" ? "bg-cyan-500/10 text-cyan-300" : "text-slate-500"}`}><BookOpen size={14} /> Journal</button></div>
              {activePanel === "performance" ? <div className="space-y-3 p-3"><div className="grid grid-cols-2 gap-2 md:grid-cols-4"><MetricCard label="Gross profit" value={formatMoney(metrics?.grossProfit)} /><MetricCard label="Gross loss" value={formatMoney(metrics?.grossLoss)} /><MetricCard label="Fees" value={formatMoney(metrics?.feesPaid)} /><MetricCard label="Profit factor" value={metrics?.profitFactor ?? metrics?.profitFactorStatus ?? "N/A"} /><MetricCard label="Average R" value={metrics?.averageR ?? "0"} /><MetricCard label="Expectancy" value={metrics?.expectancy ?? "0"} /><MetricCard label="Max drawdown" value={`${metrics?.maxDrawdown ?? "0"} (${metrics?.maxDrawdownPct ?? "0"}%)`} /><MetricCard label="Recovery factor" value={metrics?.recoveryFactor ?? "N/A"} /></div><div className="rounded-lg border border-slate-800 bg-slate-950 p-3"><div className="mb-2 text-xs font-bold text-slate-300">Equity curve</div><EquityCurve points={performance?.equityCurve || []} /></div></div> : <div className="p-3"><div className="mb-2 text-xs text-slate-500">{journal?.journalSummary.totalEvents ?? 0} events · {journal?.journalSummary.totalTrades ?? 0} trades</div><div className="max-h-80 space-y-2 overflow-y-auto">{(journal?.entries || []).map((entry) => <div key={`${entry.sequenceNo}-${entry.eventType}`} className="rounded border border-slate-800 bg-slate-950 p-2"><div className="flex justify-between gap-2 text-[10px]"><span className="font-mono text-cyan-300">#{entry.sequenceNo} {entry.eventType}</span><span className="text-slate-600">{formatTime(entry.candleOpenTime || entry.createdAt)}</span></div></div>)}{!journal?.entries.length && <div className="py-8 text-center text-xs text-slate-600">No replay journal events yet.</div>}</div></div>}
            </div>
          </>}
        </div>
      </div>
    </section>
  );
};
