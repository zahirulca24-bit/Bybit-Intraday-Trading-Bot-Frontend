import React, { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, ShieldAlert, ServerCog } from "lucide-react";

type StageState = "PASS" | "WAIT" | "BLOCKED" | "RUNNING" | "NOT_REACHED" | "ERROR";
interface Stage { name: string; state: StageState; count: number | null; detail: string; }
interface Command { candidateKey: string; symbol: string; side: string; state: string; slotId: number | null; grade: string | null; riskPct: number | null; marginMode: string | null; leverage: number | null; technicalStopLoss: number | null; takeProfitReference: number | null; management?: Record<string, any> | null; }
interface TruthResponse { ok: boolean; connected: boolean; durable?: Record<string, any> | null; stages: Stage[]; commands: Command[]; slots: Array<{ slotId: number; command: Command | null }>; policy: Record<string, any>; }

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

export const WorkerPipelineTruth: React.FC = () => {
  const [truth, setTruth] = useState<TruthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/execution-truth", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || `Execution truth failed (${response.status})`);
        if (active) { setTruth(body); setError(null); }
      } catch (err: any) {
        if (active) setError(err?.message || "Execution truth unavailable");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const blocker = useMemo(() => {
    const stages = truth?.stages || [];
    return stages.find((item) => item.state === "ERROR" || item.state === "BLOCKED")
      || stages.find((item) => item.state === "WAIT" || item.state === "RUNNING")
      || stages[stages.length - 1];
  }, [truth]);

  const durableBackend = String(truth?.durable?.backend || "unknown").toUpperCase();
  const restartSafe = Boolean(truth?.durable?.restartSafe);

  return (
    <section className="space-y-3" id="worker-pipeline-truth">
      <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-100">Authoritative Backend Pipeline</h3>
            <p className="text-xs text-slate-400">Daily Top100 → 4H Top50 → 1H Top20 → 15M → 5M → Risk → Sizing → PostgreSQL → Node</p>
          </div>
          <span className={`px-2.5 py-1 rounded border text-xs font-bold ${truth?.connected ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"}`}>
            {truth?.connected ? "NODE CONNECTED" : "NODE NOT CONNECTED"}
          </span>
        </div>
        {error && <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{error}</div>}
        {loading && !truth && <div className="text-xs text-slate-400 mb-3">Loading canonical execution truth…</div>}
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-[1320px] items-stretch gap-2">
            {(truth?.stages || []).map((stage, index, all) => (
              <React.Fragment key={stage.name}>
                <div className={`w-[118px] shrink-0 rounded-lg border p-2 ${styleFor(stage.state)}`} title={stage.detail}>
                  <div className="flex items-center gap-1.5">{iconFor(stage.state)}<span className="text-[10px] font-bold">{stage.state.replace("_", " ")}</span></div>
                  <div className="mt-2 text-xs font-semibold text-slate-100 leading-tight">{stage.name}</div>
                  <div className="mt-1 text-[10px] leading-tight opacity-80">{stage.count !== null ? `${stage.count} · ` : ""}{stage.detail}</div>
                </div>
                {index < all.length - 1 && <div className="flex items-center text-slate-600 font-bold">→</div>}
              </React.Fragment>
            ))}
          </div>
        </div>
        {blocker && <div className={`mt-3 rounded-lg border p-3 ${styleFor(blocker.state)}`}><div className="text-[10px] uppercase tracking-wider font-bold">Current pipeline point</div><div className="mt-1 text-sm font-bold">{blocker.name}: {blocker.state.replace("_", " ")}</div><div className="mt-1 text-xs">{blocker.detail}</div></div>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="xl:col-span-2 bg-slate-950/60 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3"><ServerCog className="w-4 h-4 text-cyan-400"/><h3 className="text-sm font-bold">Node Execution Slots</h3></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {(truth?.slots || [1,2,3].map((slotId) => ({ slotId, command: null }))).map((slot) => (
              <div key={slot.slotId} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-200">Slot {slot.slotId}</span><span className={`text-[10px] font-bold ${slot.command ? "text-cyan-300" : "text-slate-500"}`}>{slot.command?.state || "AVAILABLE"}</span></div>
                {slot.command ? <div className="mt-2 space-y-1 text-[11px] font-mono text-slate-400"><div className="text-slate-100 font-bold">{slot.command.symbol} {slot.command.side}</div><div>{slot.command.grade || "—"} · Risk {slot.command.riskPct ?? "—"}%</div><div>{slot.command.marginMode || "—"} · {slot.command.leverage ?? "—"}x</div><div>SL {slot.command.technicalStopLoss ?? "—"} · TP {slot.command.takeProfitReference ?? "—"}</div></div> : <div className="mt-3 text-[11px] text-slate-500">No active command assigned.</div>}
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
            <div className="pt-2 border-t border-slate-800 flex justify-between"><span>Durable store</span><strong className={durableBackend === "POSTGRESQL" && restartSafe ? "text-emerald-300" : "text-amber-300"}>{durableBackend} {restartSafe ? "RESTART SAFE" : "UNVERIFIED"}</strong></div>
          </div>
        </div>
      </div>
    </section>
  );
};
