import React, { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { api } from "../services/api";
import { WorkerExecutionResponse, WorkerSetupsResponse, WorkerStatusResponse, WorkerSymbolsResponse } from "../types";

type StageState = "PASS" | "WAIT" | "BLOCKED" | "RUNNING" | "NOT_REACHED" | "ERROR";
type Truth = Record<string, any>;
interface Stage { name: string; state: StageState; detail: string; }

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

const itemCount = (value: unknown): number => Array.isArray(value) ? value.length : Number(value || 0);
const firstText = (...values: unknown[]): string => String(values.find((value) => typeof value === "string" && value) || "");

export const WorkerPipelineTruth: React.FC = () => {
  const [status, setStatus] = useState<WorkerStatusResponse | null>(null);
  const [symbols, setSymbols] = useState<WorkerSymbolsResponse | null>(null);
  const [setups, setSetups] = useState<WorkerSetupsResponse | null>(null);
  const [execution, setExecution] = useState<WorkerExecutionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [nextStatus, nextSymbols, nextSetups, nextExecution] = await Promise.all([
          api.getWorkerStatus(),
          api.getWorkerSymbols(),
          api.getWorkerSetups(),
          api.getWorkerExecution(),
        ]);
        if (!active) return;
        setStatus(nextStatus);
        setSymbols(nextSymbols);
        setSetups(nextSetups);
        setExecution(nextExecution);
        setError(null);
      } catch (err: any) {
        if (active) setError(err?.message || "Worker truth unavailable");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const runtime: Truth = status?.runtime || {};
  const symbolTruth: Truth = symbols || status?.symbolSelection || {};
  const setupTruth: Truth = setups || status?.setupVerification || {};
  const executionTruth: Truth = execution || status?.execution || {};
  const lastResult: Truth = executionTruth.lastResult || executionTruth.lastExecution || executionTruth.lastAttempt || {};
  const runtimeState = firstText(runtime.status).toLowerCase();
  const runtimeRunning = runtimeState === "running" || runtimeState === "starting";
  const runtimeError = runtimeState === "error" || Boolean(runtime.lastError);
  const activeCount = itemCount(symbolTruth.active30 || symbolTruth.activeSymbols || symbolTruth.symbols);
  const confirmedCount = itemCount(setupTruth.pendingHandoff || setupTruth.pending || setupTruth.confirmed || setupTruth.queue);
  const setupError = firstText(setupTruth.lastError, setupTruth.error);
  const executionError = firstText(executionTruth.lastError, executionTruth.error);
  const executionStatus = firstText(executionTruth.status, executionTruth.lastStatus).toLowerCase();
  const orderAccepted = Boolean(lastResult.accepted || lastResult.filled || lastResult.ok);
  const orderBlocked = executionStatus === "blocked" || Boolean(lastResult.blocked);
  const fillVerified = Boolean(lastResult.fillVerification?.accepted || lastResult.filled);
  const protectedOrder = Boolean(lastResult.protectionVerified || lastResult.fillVerification?.accepted);
  const connected = Boolean(status?.executionConnected);
  const lastReason = firstText(lastResult.reason, lastResult.code, executionTruth.lastReason);

  const stages: Stage[] = [
    { name: "Universe", state: runtimeError ? "ERROR" : runtimeRunning ? "PASS" : "WAIT", detail: runtimeError ? firstText(runtime.lastError) || "Worker runtime error" : runtimeRunning ? "Worker runtime active" : "Worker runtime not running" },
    { name: "1H Trend", state: activeCount > 0 ? "PASS" : runtimeRunning ? "RUNNING" : "NOT_REACHED", detail: activeCount > 0 ? "Bullish/bearish trend pool available" : "Waiting for trend-qualified symbols" },
    { name: "Active 30", state: activeCount > 0 ? "PASS" : runtimeRunning ? "WAIT" : "NOT_REACHED", detail: `${activeCount}/30 active symbols` },
    { name: "15M Setup", state: setupError ? "ERROR" : confirmedCount > 0 ? "PASS" : activeCount > 0 ? "WAIT" : "NOT_REACHED", detail: setupError || (confirmedCount > 0 ? `${confirmedCount} confirmed setup(s)` : "Waiting for a valid closed-candle setup") },
    { name: "Confirmed Queue", state: confirmedCount > 0 ? "PASS" : activeCount > 0 ? "WAIT" : "NOT_REACHED", detail: `${confirmedCount} pending candidate(s)` },
    { name: "Cost & Net RR", state: orderBlocked && /RR|COST|SPREAD/.test(firstText(lastResult.code, lastReason).toUpperCase()) ? "BLOCKED" : confirmedCount > 0 ? "RUNNING" : "NOT_REACHED", detail: lastReason || "Reached only after a confirmed setup" },
    { name: "Risk & Position Guard", state: orderBlocked ? "BLOCKED" : confirmedCount > 0 && connected ? "RUNNING" : "NOT_REACHED", detail: lastReason || "Daily risk, duplicate, position and protection gates" },
    { name: "Order Submit", state: orderAccepted ? "PASS" : executionError ? "ERROR" : orderBlocked ? "BLOCKED" : connected && confirmedCount > 0 ? "RUNNING" : "NOT_REACHED", detail: executionError || (orderAccepted ? "Guarded demo order accepted" : "No order submitted yet") },
    { name: "Fill Verify", state: fillVerified ? "PASS" : orderAccepted ? "RUNNING" : "NOT_REACHED", detail: fillVerified ? "Final fill verified" : "Waiting for an accepted order" },
    { name: "SL/TP Protected", state: protectedOrder ? "PASS" : fillVerified ? "BLOCKED" : "NOT_REACHED", detail: protectedOrder ? "Mandatory protection verified" : "Protection verification not reached" },
  ];

  const blocker = stages.find((stage) => stage.state === "ERROR" || stage.state === "BLOCKED")
    || stages.find((stage) => stage.state === "WAIT" || stage.state === "RUNNING")
    || stages[stages.length - 1];

  return (
    <section className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 shadow-lg" id="worker-pipeline-truth">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100">Live Execution Pipeline</h3>
          <p className="text-xs text-slate-400">Real worker truth — not the legacy router summary</p>
        </div>
        <span className={`px-2.5 py-1 rounded border text-xs font-bold ${connected ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"}`}>
          {connected ? "EXECUTION CONNECTED" : "EXECUTION NOT CONNECTED"}
        </span>
      </div>
      {error && <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">Worker truth fetch failed: {error}</div>}
      {loading && !status && <div className="text-xs text-slate-400 mb-3">Loading worker pipeline truth...</div>}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-[1180px] items-stretch gap-2">
          {stages.map((stage, index) => (
            <React.Fragment key={stage.name}>
              <div className={`w-[108px] shrink-0 rounded-lg border p-2 ${styleFor(stage.state)}`} title={stage.detail}>
                <div className="flex items-center gap-1.5">{iconFor(stage.state)}<span className="text-[10px] font-bold">{stage.state.replace("_", " ")}</span></div>
                <div className="mt-2 text-xs font-semibold text-slate-100 leading-tight">{stage.name}</div>
                <div className="mt-1 text-[10px] leading-tight opacity-80 line-clamp-3">{stage.detail}</div>
              </div>
              {index < stages.length - 1 && <div className="flex items-center text-slate-600 font-bold">→</div>}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className={`mt-3 rounded-lg border p-3 ${styleFor(blocker.state)}`}>
        <div className="text-[10px] uppercase tracking-wider font-bold">Current pipeline point</div>
        <div className="mt-1 text-sm font-bold">{blocker.name}: {blocker.state.replace("_", " ")}</div>
        <div className="mt-1 text-xs">{blocker.detail}</div>
      </div>
    </section>
  );
};
