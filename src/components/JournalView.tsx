import React, { useState } from "react";
import { BotLog, BotStatusResponse } from "../types";
import {
  BookOpen,
  RotateCw,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Clock,
  Database,
  Info,
  ChevronDown,
  ChevronUp,
  Terminal,
  Filter,
} from "lucide-react";

interface JournalViewProps {
  logs: BotLog[];
  status: BotStatusResponse | null;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRefresh: () => void;
}

export const JournalView: React.FC<JournalViewProps> = ({
  logs,
  status,
  isLoading,
  isError,
  errorMessage,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [levelFilter, setLevelFilter] = useState<string>("ALL");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const isDegradedState = status?.durableState === "DEGRADED";

  const categories = Array.from(new Set(logs.map((l) => l.category)));

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory =
      categoryFilter === "ALL" ? true : log.category === categoryFilter;

    const matchesLevel =
      levelFilter === "ALL" ? true : log.level === levelFilter;

    return matchesSearch && matchesCategory && matchesLevel;
  });

  const toggleExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  const renderBadge = (level: string) => {
    switch (level) {
      case "PASS":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> PASS
          </span>
        );
      case "BLOCKED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
            <ShieldAlert className="w-3 h-3" /> BLOCKED
          </span>
        );
      case "WAIT":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" /> WAIT
          </span>
        );
      case "ERROR":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3" /> ERROR
          </span>
        );
      case "DEGRADED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            <AlertTriangle className="w-3 h-3" /> DEGRADED
          </span>
        );
      default:
        return <span className="text-slate-400 text-xs">{level}</span>;
    }
  };

  if (isLoading && logs.length === 0) {
    return (
      <div className="p-6 space-y-4 max-w-[1600px] mx-auto animate-pulse" id="journal-skeleton">
        <div className="h-8 bg-slate-800 rounded w-1/4"></div>
        <div className="h-64 bg-slate-800/40 rounded border border-slate-700/50"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[1700px] mx-auto text-slate-200" id="journal-container">
      {/* 1. Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-purple-400" />
              Bot Journal & System Audit Trail
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Bybit Demo API
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-3">
            <span>Logged Events: <strong className="text-slate-200 font-mono">{logs.length}</strong></span>
            <span>•</span>
            <span>Durable Storage: <strong className={`font-mono ${isDegradedState ? "text-amber-400" : "text-emerald-400"}`}>{status?.durableState || "PERSISTENT"}</strong></span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right text-xs text-slate-400 hidden lg:block font-mono">
            <div>API Latency: <span className="text-amber-400">{status?.apiLatencyMs || "--"}ms</span></div>
            <div>Last Sync: <span className="text-slate-200">{new Date().toLocaleTimeString()}</span></div>
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white border border-purple-500 shadow transition-all disabled:opacity-50 cursor-pointer"
            id="refresh-journal-btn"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Journal
          </button>
        </div>
      </div>

      {/* 2. Degraded Storage Warning Banner */}
      {isDegradedState && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-3 text-amber-300 text-xs flex items-center gap-3 shadow">
          <Database className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
          <div>
            <strong>Persistent State Warning:</strong> Journal persistence is currently in degraded mode. Journal events may be lost after bot restart or system redeployment.
          </div>
        </div>
      )}

      {/* 3. Error Banner */}
      {isError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <div>
            <strong>Journal Fetch Error:</strong> {errorMessage || "Failed to load journal logs from backend API."}
          </div>
        </div>
      )}

      {/* 4. Filters Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search event message or category..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-purple-500"
              id="journal-search-input"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
            id="journal-category-filter"
          >
            <option value="ALL">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
            id="journal-level-filter"
          >
            <option value="ALL">All Event Levels</option>
            <option value="PASS">PASS</option>
            <option value="BLOCKED">BLOCKED</option>
            <option value="WAIT">WAIT</option>
            <option value="ERROR">ERROR</option>
            <option value="DEGRADED">DEGRADED</option>
          </select>
        </div>

        <div className="text-slate-400 text-xs text-right w-full md:w-auto">
          Showing <strong className="text-slate-100">{filteredLogs.length}</strong> of <strong className="text-slate-100">{logs.length}</strong> journal events
        </div>
      </div>

      {/* 5. Journal Timeline Stream */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl" id="journal-timeline-wrapper">
        <div className="overflow-x-auto max-h-[650px] scrollbar-thin scrollbar-thumb-slate-700">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800/90 text-slate-300 font-semibold sticky top-0 z-10 border-b border-slate-700 backdrop-blur">
              <tr>
                <th className="p-3 w-40">Timestamp</th>
                <th className="p-3 w-36">Category</th>
                <th className="p-3 w-32 text-center">Status</th>
                <th className="p-3">Journal Event Log Message</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400 font-sans">
                    <Info className="w-8 h-8 mx-auto mb-2 text-slate-500" />
                    <p className="text-sm font-semibold text-slate-300">No journal events available</p>
                    <p className="text-xs text-slate-500 mt-1">No matching log entries were returned from the backend journal logger.</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => toggleExpand(log.id)}
                        className={`hover:bg-slate-800/60 cursor-pointer transition-colors ${
                          isExpanded ? "bg-slate-800/40" : ""
                        }`}
                      >
                        <td className="p-3 text-slate-400 text-[11px] font-sans">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-purple-300 border border-slate-700 font-bold text-[10px]">
                            {log.category}
                          </span>
                        </td>
                        <td className="p-3 text-center">{renderBadge(log.level)}</td>
                        <td className="p-3 font-sans text-slate-200 text-xs">
                          {log.message}
                        </td>
                        <td className="p-3 text-center text-slate-500">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </td>
                      </tr>

                      {/* Expandable Raw Log Detail */}
                      {isExpanded && (
                        <tr className="bg-slate-950/90">
                          <td colSpan={5} className="p-4 font-mono text-xs border-b border-slate-800">
                            <div className="bg-slate-900 border border-slate-800 rounded p-3 space-y-2">
                              <div className="flex items-center justify-between text-slate-400 text-[11px] border-b border-slate-800 pb-1">
                                <span className="font-bold text-purple-400 flex items-center gap-1.5 font-sans">
                                  <Terminal className="w-3.5 h-3.5" /> Event Metadata (ID: {log.id})
                                </span>
                                <span>ISO: {log.timestamp}</span>
                              </div>
                              <pre className="text-slate-300 text-[11px] whitespace-pre-wrap overflow-x-auto bg-slate-950 p-2 rounded border border-slate-800/80">
                                {JSON.stringify(log, null, 2)}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
