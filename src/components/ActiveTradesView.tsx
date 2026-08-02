import React, { useMemo, useState } from "react";
import { Activity, AlertTriangle, RotateCw, Search, ShieldCheck } from "lucide-react";

import { BotStatusResponse, OrderLifecycle, Position } from "../types";
import { OpenPositionsTable } from "./OpenPositionsTable";

interface ActiveTradesViewProps {
  positions: Position[];
  lifecycles: OrderLifecycle[];
  status: BotStatusResponse | null;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRefresh: () => void;
  onClosePosition: (id: string) => Promise<void>;
  onUpdateSLTP: (id: string, sl?: number, tp?: number) => Promise<void>;
}

function startOfLocalDay(daysAgo = 0): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.getTime();
}

function statusClass(status: string): string {
  if (status === "PASS") return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
  if (status === "BLOCKED") return "bg-orange-500/10 text-orange-300 border-orange-500/20";
  if (status === "ERROR") return "bg-rose-500/10 text-rose-300 border-rose-500/20";
  if (status === "DEGRADED") return "bg-amber-500/10 text-amber-300 border-amber-500/20";
  return "bg-slate-800 text-slate-300 border-slate-700";
}

export const ActiveTradesView: React.FC<ActiveTradesViewProps> = ({
  positions,
  lifecycles = [],
  status,
  isLoading,
  isError,
  errorMessage,
  onRefresh,
  onClosePosition,
  onUpdateSLTP,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<"TODAY" | "7DAYS">("TODAY");
  const [searchTerm, setSearchTerm] = useState("");
  const [sideFilter, setSideFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filteredLifecycles = useMemo(() => {
    const boundary = activeSubTab === "TODAY" ? startOfLocalDay() : startOfLocalDay(6);
    return lifecycles
      .filter((item) => new Date(item.timestamp).getTime() >= boundary)
      .filter((item) => {
        const query = searchTerm.trim().toLowerCase();
        const matchesSearch = !query
          || item.symbol.toLowerCase().includes(query)
          || item.id.toLowerCase().includes(query)
          || String(item.failureReason || "").toLowerCase().includes(query);
        const matchesSide = sideFilter === "ALL" || item.side === sideFilter;
        const matchesStatus = statusFilter === "ALL" || item.finalStatus === statusFilter;
        return matchesSearch && matchesSide && matchesStatus;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [activeSubTab, lifecycles, searchTerm, sideFilter, statusFilter]);

  const activePnl = positions.reduce((sum, position) => sum + position.floatingPnL, 0);

  return (
    <div className="space-y-4 max-w-[1700px] mx-auto text-slate-200" id="active-trades-container">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 shadow-lg">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-blue-400" />
              Active Trades &amp; Execution Logs
            </h2>
            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[9px] font-semibold">
              Cloud Run authoritative
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-2">
            <span>Open Positions: <strong className="text-slate-200 font-mono">{positions.length}</strong></span>
            <span>•</span>
            <span>Unrealized P&amp;L: <strong className={`font-mono ${activePnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>${activePnl.toFixed(2)}</strong></span>
            <span>•</span>
            <span>Engine: <strong className={status?.isRunning ? "text-emerald-400" : "text-amber-400"}>{status?.isRunning ? "RUNNING" : "STOPPED"}</strong></span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-[#0f131d] p-0.5 rounded border border-slate-800 font-mono text-[10px]">
            <button
              type="button"
              onClick={() => setActiveSubTab("TODAY")}
              className={`px-3 py-1 rounded font-bold ${activeSubTab === "TODAY" ? "bg-slate-800 text-cyan-300" : "text-slate-400"}`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab("7DAYS")}
              className={`px-3 py-1 rounded font-bold ${activeSubTab === "7DAYS" ? "bg-slate-800 text-cyan-300" : "text-slate-400"}`}
            >
              Last 7 Days
            </button>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold bg-blue-600/90 hover:bg-blue-500 text-white border border-blue-500/30 disabled:opacity-50"
          >
            <RotateCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
            Sync
          </button>
        </div>
      </div>

      {isError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 text-red-300 text-[11px] flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span><strong>API Sync Notice:</strong> {errorMessage || "Cloud Run synchronization failed."}</span>
        </div>
      )}

      <OpenPositionsTable
        positions={positions}
        onClosePosition={onClosePosition}
        onUpdateSLTP={onUpdateSLTP}
        loading={isLoading}
      />

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
        <div className="px-3 py-2.5 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-200">Backend Execution Lifecycle</h3>
            <span className="text-[10px] text-slate-500">{filteredLifecycles.length} records</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            <label className="relative">
              <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Symbol or order ID"
                className="bg-[#0f131d] border border-slate-700 rounded pl-7 pr-2 py-1.5 text-slate-200 outline-none focus:border-cyan-600"
              />
            </label>
            <select value={sideFilter} onChange={(event) => setSideFilter(event.target.value)} className="bg-[#0f131d] border border-slate-700 rounded px-2 py-1.5">
              <option value="ALL">All sides</option>
              <option value="LONG">Long</option>
              <option value="SHORT">Short</option>
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="bg-[#0f131d] border border-slate-700 rounded px-2 py-1.5">
              <option value="ALL">All statuses</option>
              <option value="PASS">Pass</option>
              <option value="WAIT">Wait</option>
              <option value="BLOCKED">Blocked</option>
              <option value="ERROR">Error</option>
              <option value="DEGRADED">Degraded</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[430px]">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-slate-800/70 text-slate-300 sticky top-0">
              <tr>
                <th className="p-2">Time</th>
                <th className="p-2">Symbol</th>
                <th className="p-2">Side</th>
                <th className="p-2">Status</th>
                <th className="p-2">Signal / Reason</th>
                <th className="p-2 text-right">SL</th>
                <th className="p-2 text-right">TP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {filteredLifecycles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">No backend lifecycle records match the selected filters.</td>
                </tr>
              ) : filteredLifecycles.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/30">
                  <td className="p-2 text-slate-400 whitespace-nowrap">{new Date(item.timestamp).toLocaleString()}</td>
                  <td className="p-2 font-bold text-slate-100">{item.symbol}</td>
                  <td className={`p-2 font-bold ${item.side === "LONG" ? "text-emerald-400" : "text-rose-400"}`}>{item.side}</td>
                  <td className="p-2">
                    <span className={`inline-flex px-1.5 py-0.5 rounded border text-[9px] font-bold ${statusClass(item.finalStatus)}`}>{item.finalStatus}</span>
                  </td>
                  <td className="p-2 max-w-[420px]">
                    <div className="text-slate-300 truncate" title={item.signal.condition}>{item.signal.condition}</div>
                    {item.failureReason && <div className="text-rose-300 truncate" title={item.failureReason}>{item.failureReason}</div>}
                  </td>
                  <td className="p-2 text-right text-rose-300">{item.protection.stopLoss || "—"}</td>
                  <td className="p-2 text-right text-emerald-300">{item.protection.takeProfit || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
