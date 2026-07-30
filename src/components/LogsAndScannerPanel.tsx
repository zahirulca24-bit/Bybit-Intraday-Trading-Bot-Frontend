import React, { useState } from "react";
import { Terminal, Filter, RefreshCw, Layers, ShieldAlert, Cpu } from "lucide-react";
import { BotLog, StatusLevel } from "../types";
import { StatusBadge } from "./StatusBadges";

interface LogsAndScannerPanelProps {
  logs: BotLog[];
  onRefreshLogs: (filter: string) => void;
  loading?: boolean;
}

export const LogsAndScannerPanel: React.FC<LogsAndScannerPanelProps> = ({
  logs,
  onRefreshLogs,
  loading = false,
}) => {
  const [activeTab, setActiveTab] = useState<"LOGS" | "SCANNER">("LOGS");
  const [selectedFilter, setSelectedFilter] = useState<string>("ALL");

  const filterOptions: { label: string; value: string }[] = [
    { label: "ALL", value: "ALL" },
    { label: "PASS", value: "PASS" },
    { label: "WAIT", value: "WAIT" },
    { label: "BLOCKED", value: "BLOCKED" },
    { label: "ERROR", value: "ERROR" },
    { label: "DEGRADED", value: "DEGRADED" },
  ];

  const handleFilterChange = (filterVal: string) => {
    setSelectedFilter(filterVal);
    onRefreshLogs(filterVal);
  };

  const formatTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-[#121621] border border-slate-800 rounded-lg overflow-hidden shadow-lg flex flex-col font-mono text-xs h-[360px]">
      {/* Header & Tabs */}
      <div className="bg-[#181d29] border-b border-slate-800 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Terminal size={15} className="text-cyan-400" />
          <div className="flex items-center bg-[#0d1017] p-0.5 rounded border border-slate-800">
            <button
              onClick={() => setActiveTab("LOGS")}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                activeTab === "LOGS"
                  ? "bg-slate-800 text-cyan-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ENGINE LOGS
            </button>
            <button
              onClick={() => setActiveTab("SCANNER")}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                activeTab === "SCANNER"
                  ? "bg-slate-800 text-cyan-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              SCANNER STREAM
            </button>
          </div>
        </div>

        {/* Level Filter Dropdown */}
        <div className="flex items-center gap-1.5">
          <Filter size={13} className="text-slate-500" />
          <div className="flex items-center bg-[#0d1017] p-0.5 rounded border border-slate-800">
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleFilterChange(opt.value)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer ${
                  selectedFilter === opt.value
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => onRefreshLogs(selectedFilter)}
            className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Refresh Logs Stream"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-2.5 overflow-y-auto flex-1 bg-[#0c0f17] font-mono text-[11px] leading-relaxed divide-y divide-slate-800/40">
        {activeTab === "LOGS" ? (
          loading ? (
            <div className="py-12 text-center text-slate-500 flex flex-col items-center gap-2">
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span>Streaming Engine Audit Logs...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              No logs matching filter "{selectedFilter}".
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="py-1.5 flex items-start gap-2 hover:bg-[#121722] px-1 rounded transition-colors">
                <span className="text-slate-500 shrink-0 text-[10px]">{formatTime(log.timestamp)}</span>
                <StatusBadge status={log.level} size="sm" showIcon={false} />
                <span className="px-1.5 py-0.2 rounded bg-slate-800/80 text-slate-400 text-[9px] font-bold shrink-0">
                  {log.category}
                </span>
                <span className="text-slate-300 break-words">{log.message}</span>
              </div>
            ))
          )
        ) : (
          /* Scanner Feed View */
          <div className="space-y-2">
            <div className="p-2 rounded bg-[#141824] border border-slate-800 text-slate-300 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu size={14} className="text-cyan-400" />
                <span className="font-bold">Active Symbol Scanner Matrix</span>
              </div>
              <span className="text-emerald-400 font-semibold text-[10px]">24 USDT Pairs Active</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="p-2 rounded bg-[#10141f] border border-slate-800">
                <div className="flex justify-between font-bold text-white mb-1">
                  <span>BTCUSDT (5m)</span>
                  <span className="text-emerald-400">SCORE: 9.4</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Status: Bullish Momentum • EMA20/50 Gap +0.42% • RSI 62
                </div>
              </div>

              <div className="p-2 rounded bg-[#10141f] border border-slate-800">
                <div className="flex justify-between font-bold text-white mb-1">
                  <span>ETHUSDT (15m)</span>
                  <span className="text-cyan-400">SCORE: 7.2</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Status: Range Compression • Awaiting VWAP Reclaim
                </div>
              </div>

              <div className="p-2 rounded bg-[#10141f] border border-slate-800">
                <div className="flex justify-between font-bold text-white mb-1">
                  <span>SOLUSDT (5m)</span>
                  <span className="text-emerald-400">SCORE: 8.8</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Status: Breakout Confirmed • High Volume Spike 2.4x
                </div>
              </div>

              <div className="p-2 rounded bg-[#10141f] border border-slate-800">
                <div className="flex justify-between font-bold text-white mb-1">
                  <span>AVAXUSDT (15m)</span>
                  <span className="text-amber-400">SCORE: 5.8 (BLOCKED)</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  Status: Rejection • Max daily trades count limit
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
