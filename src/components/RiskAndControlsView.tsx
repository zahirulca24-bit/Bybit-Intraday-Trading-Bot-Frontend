import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  Info,
  Lock,
  Power,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Target,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { AccountSummary, BotStatusResponse, Position, ScannerSignalItem } from "../types";
import { api } from "../services/api";

interface RiskAndControlsViewProps {
  status: BotStatusResponse | null;
  account: AccountSummary | null;
  positions: Position[];
  signals?: ScannerSignalItem[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onToggleBot: () => Promise<{ isRunning: boolean; reason?: string }>;
  onRefresh: () => void | Promise<void>;
}

interface RiskPolicyResponse {
  ok: boolean;
  generatedAt: number;
  environment: string;
  engine: {
    enabled: boolean;
    lastReason: string;
    mode: string;
  };
  account: {
    equity: number;
    availableBalance: number;
  };
  qualitySizing: {
    source: string;
    aPlusRiskPct: number;
    aRiskPct: number;
    bPlusAction: string;
    lowerGradeAction: string;
    minimumExecutableRiskPct: number;
    maximumExecutableRiskPct: number;
    fixedAllocationCapEnabled: boolean;
    sizingMethod: string;
    quantityRounding: string;
    maxOpenPositions: number;
    lastEvidence: Record<string, any> | null;
  };
  exitPolicy: {
    source: string;
    tp1: { targetR: number; closeOriginalPct: number; moveStopToBreakeven: boolean };
    tp2: { targetR: number; closeOriginalPct: number };
    runner: {
      originalPct: number;
      activateAfterVerifiedTp2: boolean;
      trailingDistanceR: number;
    };
  };
  dailyNetLoss: {
    source: string;
    evidenceAvailable: boolean;
    dateKey: string | null;
    startingEquity: number;
    limitPct: number;
    limitUsdt: number;
    realizedNetPnl: number;
    remainingLossCapacity: number;
    blocked: boolean;
    tradeCountLimited: boolean;
    maximumTradesPerDay: number | null;
    existingPositionManagementContinues: boolean;
  };
}

const money = (value: number | null | undefined, signed = false): string => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Unavailable";
  const numeric = Number(value);
  const prefix = signed && numeric > 0 ? "+" : "";
  return `${prefix}${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(numeric)} USDT`;
};

const percent = (value: number | null | undefined, digits = 2): string => {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Unavailable";
  return `${Number(value).toFixed(digits)}%`;
};

const PolicyTile: React.FC<{
  label: string;
  value: React.ReactNode;
  helper: string;
  tone?: "default" | "good" | "warn" | "bad" | "info";
}> = ({ label, value, helper, tone = "default" }) => {
  const toneClass = {
    default: "text-slate-100",
    good: "text-emerald-400",
    warn: "text-amber-400",
    bad: "text-rose-400",
    info: "text-cyan-300",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">{label}</div>
      <div className={`mt-2 font-mono text-lg font-black ${toneClass}`}>{value}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{helper}</div>
    </div>
  );
};

export const RiskAndControlsView: React.FC<RiskAndControlsViewProps> = ({
  status,
  account,
  positions,
  signals = [],
  selectedSymbol,
  onSelectSymbol,
  onToggleBot,
  onRefresh,
}) => {
  const [riskPolicy, setRiskPolicy] = useState<RiskPolicyResponse | null>(null);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"START" | "STOP" | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionResult, setActionResult] = useState<{
    type: "SUCCESS" | "ERROR";
    message: string;
  } | null>(null);

  const loadPolicy = useCallback(async () => {
    setPolicyError(null);
    try {
      const payload = await api.getRiskPolicy();
      setRiskPolicy(payload as RiskPolicyResponse);
    } catch (error: any) {
      setPolicyError(error?.message || "Unable to load authoritative backend risk policy.");
    } finally {
      setLoadingPolicy(false);
    }
  }, []);

  useEffect(() => {
    void loadPolicy();
    const timer = window.setInterval(() => void loadPolicy(), 5000);
    return () => window.clearInterval(timer);
  }, [loadPolicy]);

  const authoritativeRunning = riskPolicy?.engine.enabled ?? status?.isRunning ?? false;
  const stateMismatch = Boolean(
    riskPolicy && status && riskPolicy.engine.enabled !== status.isRunning,
  );

  const symbols = useMemo(() => {
    const values = new Set<string>([selectedSymbol, ...signals.map((row) => row.symbol)]);
    return Array.from(values).filter(Boolean).sort();
  }, [selectedSymbol, signals]);

  const candidate = signals.find((row) => row.symbol === selectedSymbol);
  const alignedVotes = candidate && (candidate.signal === "Buy" || candidate.signal === "Sell")
    ? candidate.strategyVotes.filter((vote) => vote.voteSignal === candidate.signal).length
    : 0;
  const candidateGrade = candidate && (candidate.signal === "Buy" || candidate.signal === "Sell")
    ? alignedVotes >= 3
      ? "A+"
      : alignedVotes >= 2
        ? "A"
        : "B+"
    : "NO SETUP";
  const candidateRiskPct = candidateGrade === "A+"
    ? riskPolicy?.qualitySizing.aPlusRiskPct ?? 1
    : candidateGrade === "A"
      ? riskPolicy?.qualitySizing.aRiskPct ?? 0.75
      : 0;
  const candidateAction = candidateGrade === "A+" || candidateGrade === "A" ? "EXECUTABLE" : "REJECT";

  const equity = riskPolicy?.account.equity ?? account?.equity ?? 0;
  const aPlusRiskUsdt = equity * ((riskPolicy?.qualitySizing.aPlusRiskPct ?? 1) / 100);
  const aRiskUsdt = equity * ((riskPolicy?.qualitySizing.aRiskPct ?? 0.75) / 100);
  const candidateRiskUsdt = equity * (candidateRiskPct / 100);

  const daily = riskPolicy?.dailyNetLoss;
  const usedLoss = daily ? Math.abs(Math.min(0, daily.realizedNetPnl)) : 0;
  const usedPct = daily && daily.limitUsdt > 0 ? Math.min(100, (usedLoss / daily.limitUsdt) * 100) : 0;
  const lastSizing = riskPolicy?.qualitySizing.lastEvidence;

  const refreshAll = async () => {
    setLoadingPolicy(true);
    await Promise.all([loadPolicy(), Promise.resolve(onRefresh())]);
  };

  const executeToggle = async () => {
    if (!pendingAction) return;
    setActionPending(true);
    setActionResult(null);
    try {
      const result = await onToggleBot();
      await loadPolicy();
      const expectedRunning = pendingAction === "START";
      if (result.isRunning !== expectedRunning) {
        throw new Error(
          `Backend confirmed ${result.isRunning ? "RUNNING" : "STOPPED"}, not the requested ${expectedRunning ? "RUNNING" : "STOPPED"} state.`,
        );
      }
      setActionResult({
        type: "SUCCESS",
        message: `Authoritative backend status confirmed: ${result.isRunning ? "RUNNING" : "STOPPED"}.${result.reason ? ` ${result.reason}` : ""}`,
      });
      setPendingAction(null);
    } catch (error: any) {
      setActionResult({
        type: "ERROR",
        message: error?.message || "Bot state change failed verification.",
      });
      setPendingAction(null);
    } finally {
      setActionPending(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 text-slate-200" id="risk-controls-container">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="flex items-center gap-2 text-xl font-black text-slate-100">
                <ShieldAlert className="h-5 w-5 text-amber-400" />
                Risk & Controls Operator Console
              </h2>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                Bybit Demo only
              </span>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                Backend authoritative
              </span>
            </div>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>Engine:</span>
              <strong className={`font-mono ${authoritativeRunning ? "text-emerald-400" : "text-amber-400"}`}>
                {authoritativeRunning ? "RUNNING" : "STOPPED"}
              </strong>
              <span>•</span>
              <span>Open positions: <strong className="font-mono text-slate-200">{positions.length}</strong></span>
              <span>•</span>
              <span>Policy sync: <strong className={`font-mono ${policyError ? "text-rose-400" : "text-emerald-400"}`}>{policyError ? "ERROR" : "LIVE"}</strong></span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-right text-[10px] font-mono text-slate-500">
              <div>API latency: <span className="text-amber-400">{status?.apiLatencyMs ?? "--"}ms</span></div>
              <div>Policy sync: <span className="text-slate-200">{riskPolicy?.generatedAt ? new Date(riskPolicy.generatedAt).toLocaleTimeString() : "--"}</span></div>
            </div>
            <button
              onClick={() => void refreshAll()}
              disabled={loadingPolicy}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loadingPolicy ? "animate-spin" : ""} />
              Refresh truth
            </button>
          </div>
        </div>
      </section>

      {policyError && (
        <section className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-4 text-sm text-rose-200">
          <div className="flex items-start gap-3">
            <XCircle size={18} className="mt-0.5 shrink-0 text-rose-400" />
            <div>
              <div className="font-bold">Risk-policy sync failed</div>
              <div className="mt-1 text-xs text-rose-300/80">{policyError}</div>
            </div>
          </div>
        </section>
      )}

      {stateMismatch && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
            <div>
              <div className="font-bold">Runtime status sources disagree</div>
              <div className="mt-1 text-xs text-amber-200/80">
                The page will not display a success state until the authoritative backend status and the global runtime status agree.
              </div>
            </div>
          </div>
        </section>
      )}

      {actionResult && (
        <section className={`rounded-xl border p-4 text-sm ${actionResult.type === "SUCCESS" ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200" : "border-rose-500/40 bg-rose-950/30 text-rose-200"}`}>
          <div className="flex items-start gap-3">
            {actionResult.type === "SUCCESS" ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" /> : <XCircle size={18} className="mt-0.5 shrink-0 text-rose-400" />}
            <div>{actionResult.message}</div>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl xl:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="flex items-center gap-2 font-bold text-slate-100">
              <Gauge size={17} className="text-cyan-400" />
              Quality-Based Position Sizing
            </h3>
            <span className="rounded border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-mono text-cyan-300">READ ONLY</span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <PolicyTile label="A+ setup" value={percent(riskPolicy?.qualitySizing.aPlusRiskPct ?? 1)} helper={`${money(aPlusRiskUsdt)} maximum planned stop risk at current equity.`} tone="good" />
            <PolicyTile label="A setup" value={percent(riskPolicy?.qualitySizing.aRiskPct ?? 0.75)} helper={`${money(aRiskUsdt)} maximum planned stop risk at current equity.`} tone="info" />
            <PolicyTile label="B+ or lower" value="REJECT" helper="No order and no position size. Only A+ and A setups are executable." tone="bad" />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <PolicyTile label="Fixed allocation cap" value="DISABLED" helper="The old fixed 250 USDT cap no longer cuts risk-based sizing." tone="good" />
            <PolicyTile label="Position limit" value={`${riskPolicy?.qualitySizing.maxOpenPositions ?? 3}`} helper="Maximum simultaneous open positions reported by backend policy." />
            <PolicyTile label="Final verification" value="FAIL CLOSED" helper="Bybit quantity step is rounded down and actual stop risk is recalculated before order submission." tone="warn" />
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0 flex-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Candidate preview</label>
                <select
                  value={selectedSymbol}
                  onChange={(event) => onSelectSymbol(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-mono text-slate-100 outline-none focus:border-cyan-500"
                >
                  {symbols.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
                </select>
              </div>
              <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
                  <div className="text-[9px] uppercase text-slate-500">Grade</div>
                  <div className={`mt-1 font-mono font-black ${candidateAction === "EXECUTABLE" ? "text-emerald-400" : "text-rose-400"}`}>{candidateGrade}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
                  <div className="text-[9px] uppercase text-slate-500">Action</div>
                  <div className={`mt-1 font-mono text-xs font-black ${candidateAction === "EXECUTABLE" ? "text-emerald-400" : "text-rose-400"}`}>{candidateAction}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
                  <div className="text-[9px] uppercase text-slate-500">Risk</div>
                  <div className="mt-1 font-mono text-xs font-black text-cyan-300">{candidateAction === "EXECUTABLE" ? `${percent(candidateRiskPct)} / ${money(candidateRiskUsdt)}` : "0%"}</div>
                </div>
              </div>
            </div>
            <div className="mt-3 text-[11px] leading-relaxed text-slate-500">
              Preview uses the same vote-count grade mapping as the backend: 3+ aligned votes = A+, 2 aligned votes = A, 0–1 aligned votes = B+ reject. Final quantity remains backend-controlled from the technical stop and live Bybit instrument rules.
            </div>
          </div>

          {lastSizing && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-300"><Database size={14} /> Latest backend sizing evidence</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-mono md:grid-cols-4">
                <div><span className="block text-slate-500">Grade</span><strong className="text-slate-100">{String(lastSizing.grade || lastSizing.signalGrade || "N/A")}</strong></div>
                <div><span className="block text-slate-500">Risk</span><strong className="text-slate-100">{lastSizing.riskPerTradePct !== undefined ? percent(Number(lastSizing.riskPerTradePct)) : "N/A"}</strong></div>
                <div><span className="block text-slate-500">Quantity</span><strong className="text-slate-100">{String(lastSizing.qty || lastSizing.roundedQty || "N/A")}</strong></div>
                <div><span className="block text-slate-500">Notional</span><strong className="text-slate-100">{lastSizing.notional !== undefined ? `${lastSizing.notional} USDT` : "N/A"}</strong></div>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl xl:col-span-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="flex items-center gap-2 font-bold text-slate-100">
              <Target size={17} className="text-purple-400" />
              Staged Exit & Runner Policy
            </h3>
            <span className="rounded border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-mono text-purple-300">AUTOMATED</span>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center justify-between"><strong className="text-emerald-300">TP1</strong><span className="font-mono text-emerald-400">1.5R</span></div>
              <div className="mt-2 text-sm text-slate-200">Close 40% of the original position.</div>
              <div className="mt-1 text-[11px] text-slate-500">After verified TP1, move stop to breakeven/protected entry.</div>
            </div>
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
              <div className="flex items-center justify-between"><strong className="text-cyan-300">TP2</strong><span className="font-mono text-cyan-300">2.0R</span></div>
              <div className="mt-2 text-sm text-slate-200">Close another 30% of the original position.</div>
              <div className="mt-1 text-[11px] text-slate-500">This is 50% of the remaining 60%, leaving a 30% runner.</div>
            </div>
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
              <div className="flex items-center justify-between"><strong className="text-purple-300">Runner</strong><span className="font-mono text-purple-300">30%</span></div>
              <div className="mt-2 text-sm text-slate-200">Activate trailing only after verified TP2.</div>
              <div className="mt-1 text-[11px] text-slate-500">Trailing distance = 0.5R from the original technical stop distance.</div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-[11px] leading-relaxed text-slate-400">
            <Info size={14} className="mr-2 inline text-blue-400" />
            Entry, original stop, original size, TP stages and trailing completion are persisted by the backend for restart-safe management.
          </div>
        </section>
      </div>

      <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <div className="flex flex-col gap-2 border-b border-slate-800 pb-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-slate-100">
              <ShieldCheck size={17} className="text-amber-400" />
              Daily Net-Loss Lock
            </h3>
            <p className="mt-1 text-[11px] text-slate-500">Realized net profit offsets realized losses. There is no maximum-trades-per-day gate.</p>
          </div>
          <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${daily?.blocked ? "border-rose-500/40 bg-rose-500/10 text-rose-300" : daily?.evidenceAvailable ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
            {daily?.blocked ? "NEW ENTRIES LOCKED" : daily?.evidenceAvailable ? "ENTRY GATE OPEN" : "EVIDENCE PENDING"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <PolicyTile label="Starting equity" value={money(daily?.startingEquity ?? equity)} helper={`Trading date: ${daily?.dateKey || "not reported"}`} />
          <PolicyTile label="Daily limit" value={daily ? `${percent(daily.limitPct)} / ${money(daily.limitUsdt)}` : "5.00%"} helper="Calculated from the persisted trading-day starting equity." tone="warn" />
          <PolicyTile label="Realized net P&L" value={daily?.evidenceAvailable ? money(daily.realizedNetPnl, true) : "Awaiting evidence"} helper="Bybit closed-PnL source; profits offset losses." tone={daily?.realizedNetPnl !== undefined && daily.realizedNetPnl < 0 ? "bad" : "good"} />
          <PolicyTile label="Remaining loss capacity" value={daily?.evidenceAvailable ? money(daily.remainingLossCapacity) : "Unavailable"} helper="New entries block at or below the 5% threshold." tone={daily?.blocked ? "bad" : "info"} />
          <PolicyTile label="Trades per day" value="UNLIMITED" helper="Trade count does not lock execution; only the daily net-loss threshold does." tone="good" />
        </div>

        <div className="overflow-hidden rounded-full border border-slate-800 bg-slate-950">
          <div className={`h-2 transition-all ${daily?.blocked ? "bg-rose-500" : "bg-amber-400"}`} style={{ width: `${usedPct}%` }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
          <span>Net-loss capacity used: {usedPct.toFixed(2)}%</span>
          <span>Existing position protection continues after the entry lock.</span>
          <span>Source: {daily?.source || "BYBIT_DAILY_CLOSED_PNL"}</span>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-slate-100"><Power size={17} className="text-rose-400" /> Authoritative Operator Controls</h3>
            <p className="mt-1 text-[11px] text-slate-500">A success banner appears only after a second backend status request confirms the requested state.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setPendingAction("START")}
              disabled={authoritativeRunning || actionPending || stateMismatch}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Power size={14} /> Start bot
            </button>
            <button
              onClick={() => setPendingAction("STOP")}
              disabled={!authoritativeRunning || actionPending || stateMismatch}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Power size={14} /> Stop bot
            </button>
            <button
              onClick={() => void refreshAll()}
              disabled={loadingPolicy || actionPending}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-xs font-bold text-blue-300 transition hover:bg-blue-500/20 disabled:opacity-40"
            >
              <Activity size={14} /> Test & refresh
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs"><Lock size={14} className="mr-2 inline text-amber-400" /><strong>Environment:</strong> Bybit Demo only</div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs"><Database size={14} className="mr-2 inline text-purple-400" /><strong>State:</strong> {status?.durableState || "Unknown"}</div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs"><Clock3 size={14} className="mr-2 inline text-cyan-400" /><strong>Last reason:</strong> {riskPolicy?.engine.lastReason || "Not reported"}</div>
        </div>
      </section>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg border p-2.5 ${pendingAction === "START" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-400"}`}>
                <Power size={22} />
              </div>
              <div>
                <h3 className="font-bold text-slate-100">Confirm {pendingAction === "START" ? "Start" : "Stop"} Bot</h3>
                <div className="text-[10px] font-mono text-amber-400">BYBIT DEMO ENVIRONMENT</div>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-300">
              {pendingAction === "START"
                ? "The backend will start automatic scanning and execution under A+/A quality sizing, staged R exits, and the 5% daily net-loss lock."
                : "The backend will stop new automatic execution. Existing position protection and exchange-side stops remain active."}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingAction(null)} disabled={actionPending} className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700">Cancel</button>
              <button onClick={() => void executeToggle()} disabled={actionPending} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-white ${pendingAction === "START" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-amber-600 hover:bg-amber-500"}`}>
                {actionPending ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-[10px] font-mono text-slate-500">
        <span className="flex items-center gap-2"><TrendingUp size={13} className="text-emerald-400" />No fake editable risk values</span>
        <span className="flex items-center gap-2"><Database size={13} className="text-purple-400" />Risk evidence is read through the authenticated Vercel BFF</span>
        <span className="flex items-center gap-2"><ShieldCheck size={13} className="text-amber-400" />Execution remains backend-controlled</span>
      </section>
    </div>
  );
};
