import React, { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, ShieldAlert, ServerCog } from "lucide-react";

type StageState = "PASS" | "WAIT" | "BLOCKED" | "RUNNING" | "NOT_REACHED" | "ERROR";
interface Stage { name: string; state: StageState; count: number | null; detail: string; }
interface Command {
  candidateKey: string;
  symbol: string;
  side: string;
  state: string;
  slotId: number | null;
  grade: string | null;
  riskPct: number | null;
  marginMode: string | null;
  leverage: number | null;
  technicalStopLoss: number | null;
  takeProfitReference: number | null;
  management?: Record<string, any> | null;
}
interface DurableTruth { backend: string; restartSafe: boolean; degraded: boolean; verified: boolean; reason: string; }
interface TruthResponse {
  ok: boolean;
  connected: boolean;
  checkedAt: number;
  durable: DurableTruth;
  stages: Stage[];
  commands: Command[];
  slots: Array<{ slotId: number; command: Command | null }>;
  policy: Record<string, any>;
}

const styleFor = (state: StageState) => {
  if (state === "PASS") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  if (state === "RUNNING") return "border-cyan-500/40 bg-cyan-500/10 text-cyan-300";
  if (state === "BLOCKED" || state === "ERROR") return "border-red-500/40 bg-red-500/10 text-red-300";
  if (state === "WAIT") return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  return "border-slate-700 bg-slate-900 text-slate-500";
};

const iconFor = (state: StageState) => {
  if (state === "PASS") return <CheckCircle2 className="w-4 h-4" />;
  if (state === "RUNNING") return <Activity className="w-4 h-4 animate-pulse" />;
  if (state === "BLOCKED") return <ShieldAlert className="w-4 h-4" />;
  if (state === "ERROR") return <AlertTriangle className="w-4 h-4" />;
  return <Clock3 className="w-4 h-4" />;
};

const stateTone = (state: string) => {
  if (["MANAGING", "PARTIALLY_FILLED"].includes(state)) return "text-emerald-300";
  if (["RESERVED", "ORDER_PENDING", "CLOSING"].includes(state)) return "text-cyan-300";
  if (state === "FAILED") return "text-red-300";
  return "text-slate-500";
};

export const WorkerPipelineTruth: React.FC = () => {
  const [truth, setTruth] = useState<TruthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/execution-truth", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || `Execution truth failed (${response.status})`);
        if (active) {
          setTruth(body);
          setError(null);
          setNow(Date.now());
        }
      } catch (err: any) {
        if (active) setError(err?.message || "Execution truth unavailable");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const refreshTimer = window.setInterval(() => void load(), 5000);
    const clockTimer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
    };
  }, []);

  const ageSeconds = truth?.checkedAt ? Math.max(0, Math.floor((now - truth.checkedAt) / 1000)) : null;
  const stale = ageSeconds === null || ageSeconds > 20 || Boolean(error);
  const connected = Boolean(truth?.connected) && !stale;

  const blocker = useMemo(() => {
    const stages = truth?.stages || [];
    return stages.find((item) => item.state === "ERROR" || item.state === "BLOCKED")
      || stages.find((item) => item.state === "WAIT" || item.state === "RUNNING")
      || stages[stages.length - 1];
  }, [truth]);

  const durable = truth?.durable;
  const durableVerified = Boolean(durable?.verified) && !stale;

  return (
    <section className="space-y-3" id="worker-pipeline-truth">
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-100">Authoritative Backend Pipeline</h3>
            <p className="text-xs text-slate-400">1H Top20 → 15M → 5M → Risk → Sizing → PostgreSQL → Node</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2.5 py-1 rounded border text-xs font-bold ${connected ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"}`}>
              {connected ? "NODE CONNECTED" : stale ? "TRUTH STALE" : "NODE NOT CONNECTED"}
            </span>
            <span className="px-2 py-1 rounded border border-slate-700 bg-slate-900 text-[10px] text-slate-400">
              {ageSeconds === null ? "No verified snapshot" : `Verified ${ageSeconds}s ago`}
            </span>
          </div>
        </div>
        {error && <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">Latest refresh failed: {error}. Previous data is not treated as current.</div>}
        {loading && !truth && <div className="text-xs text-slate-400 mb-3">Loading canonical execution truth…</div>}
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-[1060px] items-stretch gap-2">
            {(truth?.stages || []).map((stage, index, all) => (
              <React.Fragment key={stage.name}>
                <div className={`w-[118px] shrink-0 rounded-lg border p-2 ${stale ? styleFor("ERROR") : styleFor(stage.state)}`} title={stage.detail}>
                  <div className="flex items-center gap-1.5">{iconFor(stale ? "ERROR" : stage.state)}<span className="text-[10px] font-bold">{stale ? "STALE" : stage.state.replace("_", " ")}</span></div>
                  <div className="mt-2 text-xs font-semibold text-slate-100 leading-tight">{stage.name}</div>
                  <div className="mt-1 text-[10px] leading-tight opacity-80">{stage.count !== null ? `${stage.count} · ` : ""}{stage.detail}</div>
                </div>
                {index < all.length - 1 && <div className="flex items-center text-slate-600 font-bold">→</div>}
              </React.Fragment>
            ))}
          </div>
        </div>
        {blocker && <div className={`mt-3 rounded-lg border p-3 ${styleFor(stale ? "ERROR" : blocker.state)}`}><div className="text-[10px] uppercase tracking-wider font-bold">Current pipeline point</div><div className="mt-1 text-sm font-bold">{stale ? "Execution truth refresh required" : `${blocker.name}: ${blocker.state.replace("_", " ")}`}</div><div className="mt-1 text-xs">{stale ? "The UI will not present stale execution evidence as current truth." : blocker.detail}</div></div>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="xl:col-span-2 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3"><ServerCog className="w-4 h-4 text-cyan-400"/><h3 className="text-sm font-bold">Node Execution Slots</h3></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {(truth?.slots || [1,2,3].map((slotId) => ({ slotId, command: null }))).map((slot) => (
              <div key={slot.slotId} className={`rounded-lg border p-3 ${stale ? "border-red-500/30 bg-red-500/5" : "border-slate-800 bg-slate-900/70"}`}>
                <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-200">Slot {slot.slotId}</span><span className={`text-[10px] font-bold ${stale ? "text-red-300" : stateTone(slot.command?.state || "AVAILABLE")}`}>{stale ? "UNVERIFIED" : slot.command?.state || "AVAILABLE"}</span></div>
                {slot.command && !stale ? <div className="mt-2 space-y-1 text-[11px] font-mono text-slate-400"><div className="text-slate-100 font-bold">{slot.command.symbol} {slot.command.side}</div><div>{slot.command.grade || "—"} · Risk {slot.command.riskPct ?? "—"}%</div><div>{slot.command.marginMode || "—"} · {slot.command.leverage ?? "—"}x</div><div>SL {slot.command.technicalStopLoss ?? "—"} · TP {slot.command.takeProfitReference ?? "—"}</div><div>Management: {slot.command.management ? "ACTIVE EVIDENCE" : "NOT REACHED"}</div></div> : <div className="mt-3 text-[11px] text-slate-500">{stale ? "Refresh required before slot state can be trusted." : "No active command assigned."}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3"><Database className="w-4 h-4 text-emerald-400"/><h3 className="text-sm font-bold">Locked Execution Policy</h3></div>
          <div className="space-y-2 text-[11px] text-slate-400">
            <div className="flex justify-between"><span>Margin / leverage</span><strong className="text-slate-100">ISOLATED 5x</strong></div>
            <div className="flex justify-between"><span>A+ / A / B+</span><strong className="text-slate-100">1% / 0.75% / Reject</strong></div>
            <div className="flex justify-between"><span>Max open slots</span><strong className="text-slate-100">3</strong></div>
            <div className="flex justify-between"><span>Margin caps</span><strong className="text-slate-100">25% / 60%</strong></div>
            <div className="flex justify-between"><span>Free reserve</span><strong className="text-slate-100">40%</strong></div>
            <div className="pt-2 border-t border-slate-800">TP1 40% at 1.5R → break-even</div>
            <div>TP2 30% at 2R → 30% runner</div>
            <div>Runner trail: 0.5R</div>
            <div className="pt-2 border-t border-slate-800 flex justify-between gap-3"><span>Durable store</span><strong className={durableVerified ? "text-emerald-300" : "text-red-300"}>{durableVerified ? "POSTGRESQL VERIFIED" : "UNVERIFIED / DEGRADED"}</strong></div>
            <div className="text-[10px] leading-relaxed text-slate-500">{durable?.reason || "No canonical persistence evidence returned."}</div>
          </div>
        </div>
      </div>
    </section>
  );
};
