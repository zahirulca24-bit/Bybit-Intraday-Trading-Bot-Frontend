import React, { useState, useEffect } from "react";
import {
  Play,
  Square,
  Wifi,
  WifiOff,
  Clock,
  Timer,
  Zap,
  Database,
  ShieldCheck,
  ChevronDown,
  RefreshCw,
  Cpu,
} from "lucide-react";
import { BotStatusResponse } from "../types";
import { StatusBadge } from "./StatusBadges";

interface RuntimeStatusBarProps {
  status: BotStatusResponse | null;
  onToggleBot: () => void;
  onRefresh: () => void;
  onChangeRouterMode: (mode: string) => void;
  isToggling?: boolean;
}

export const RuntimeStatusBar: React.FC<RuntimeStatusBarProps> = ({
  status,
  onToggleBot,
  onRefresh,
  onChangeRouterMode,
  isToggling = false,
}) => {
  const [routerDropdownOpen, setRouterDropdownOpen] = useState(false);
  const [timeAgoStr, setTimeAgoStr] = useState<string>("");

  const routerModes = [
    "Intraday Momentum & Breakout Router",
    "Mean Reversion & Scalping Router",
    "Multi-Timeframe Trend Follower",
    "Conservative Volatility Arbitrage",
  ];

  useEffect(() => {
    if (!status?.lastScanTime) return;

    const updateAgo = () => {
      const scanDate = new Date(status.lastScanTime);
      const diffSec = Math.floor((Date.now() - scanDate.getTime()) / 1000);
      if (diffSec < 5) setTimeAgoStr("just now");
      else if (diffSec < 60) setTimeAgoStr(`${diffSec}s ago`);
      else setTimeAgoStr(`${Math.floor(diffSec / 60)}m ago`);
    };

    updateAgo();
    const interval = setInterval(updateAgo, 1000);
    return () => clearInterval(interval);
  }, [status?.lastScanTime]);

  const formatScanTime = (isoString?: string) => {
    if (!isoString) return "--:--:--";
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const getLatencyColor = (ms: number) => {
    if (ms < 50) return "text-emerald-400";
    if (ms < 150) return "text-amber-400";
    return "text-rose-400";
  };

  return (
    <div className="w-full bg-[#121621] border-b border-slate-800 text-slate-200 px-3 py-2 text-xs font-mono select-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left Section: Bybit Demo Badge & Bot Control */}
        <div className="flex items-center gap-2">
          {/* Bybit Demo API Badge */}
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-[11px]">
            <ShieldCheck size={13} className="text-amber-400 shrink-0" />
            <span>BYBIT DEMO API</span>
          </div>

          {/* Bot Start/Stop Button */}
          <button
            onClick={onToggleBot}
            disabled={isToggling || !status}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-semibold text-xs transition-all cursor-pointer ${
              status?.isRunning
                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 active:scale-95"
                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 active:scale-95"
            } ${isToggling ? "opacity-50 cursor-wait" : ""}`}
            title={status?.isRunning ? "Click to Pause Bot Scanner" : "Click to Start Bot Scanner"}
          >
            {status?.isRunning ? (
              <>
                <Square size={12} className="fill-rose-400 text-rose-400 shrink-0" />
                <span>STOP BOT</span>
              </>
            ) : (
              <>
                <Play size={12} className="fill-emerald-400 text-emerald-400 shrink-0" />
                <span>START BOT</span>
              </>
            )}
          </button>

          {/* Engine Status Tag */}
          {status && (
            <div className="hidden sm:flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  status.isRunning ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                }`}
              />
              <span className={`text-[11px] font-bold ${status.isRunning ? "text-emerald-400" : "text-slate-400"}`}>
                {status.isRunning ? "RUNNING" : "STOPPED"}
              </span>
            </div>
          )}
        </div>

        {/* Middle Section: Connection, Scan Times, Latency */}
        <div className="flex items-center gap-3 overflow-x-auto py-0.5">
          {/* Connection Status */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900/60 border border-slate-800 shrink-0">
            {status?.backendConnected ? (
              <>
                <Wifi size={13} className="text-emerald-400 shrink-0" />
                <span className="text-slate-300">Backend:</span>
                <span className="text-emerald-400 font-semibold">CONNECTED</span>
              </>
            ) : (
              <>
                <WifiOff size={13} className="text-rose-400 shrink-0" />
                <span className="text-slate-300">Backend:</span>
                <span className="text-rose-400 font-semibold">DISCONNECTED</span>
              </>
            )}
          </div>

          {/* Last Scan Time */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900/60 border border-slate-800 shrink-0">
            <Clock size={13} className="text-cyan-400 shrink-0" />
            <span className="text-slate-400">Last Scan:</span>
            <span className="text-slate-200 font-medium">{formatScanTime(status?.lastScanTime)}</span>
            {timeAgoStr && <span className="text-slate-500 text-[10px]">({timeAgoStr})</span>}
          </div>

          {/* Next Scan Countdown */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900/60 border border-slate-800 shrink-0">
            <Timer size={13} className="text-amber-400 shrink-0" />
            <span className="text-slate-400">Next Scan:</span>
            <span className="text-amber-300 font-mono font-bold">
              {status?.nextScanSeconds !== undefined ? `${String(status.nextScanSeconds).padStart(2, "0")}s` : "--s"}
            </span>
          </div>

          {/* API Latency */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900/60 border border-slate-800 shrink-0">
            <Zap size={13} className="text-yellow-400 shrink-0" />
            <span className="text-slate-400">API Latency:</span>
            <span className={`font-bold ${getLatencyColor(status?.apiLatencyMs || 0)}`}>
              {status?.apiLatencyMs ? `${status.apiLatencyMs}ms` : "--ms"}
            </span>
          </div>

          {/* Durable State Indicator */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-900/60 border border-slate-800 shrink-0">
            <Database size={13} className="text-purple-400 shrink-0" />
            <span className="text-slate-400">State:</span>
            {status?.durableState === "PERSISTENT" ? (
              <StatusBadge status="PASS" size="sm" customLabel="PERSISTENT" />
            ) : (
              <StatusBadge status="DEGRADED" size="sm" customLabel="DEGRADED" />
            )}
          </div>
        </div>

        {/* Right Section: Router Mode Dropdown & Refresh */}
        <div className="flex items-center gap-2">
          {/* Router Mode Selector */}
          <div className="relative">
            <button
              onClick={() => setRouterDropdownOpen(!routerDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors text-[11px] cursor-pointer"
            >
              <Cpu size={13} className="text-cyan-400 shrink-0" />
              <span className="max-w-[140px] truncate">{status?.routerMode || "Router Mode"}</span>
              <ChevronDown size={12} className="text-slate-400 shrink-0" />
            </button>

            {routerDropdownOpen && (
              <div className="absolute right-0 mt-1 w-64 rounded-md bg-[#181d29] border border-slate-700 shadow-2xl z-50 py-1">
                <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-800">
                  Select Bot Router Strategy
                </div>
                {routerModes.map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      onChangeRouterMode(mode);
                      setRouterDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-800/80 transition-colors ${
                      status?.routerMode === mode ? "text-cyan-400 font-bold bg-cyan-500/10" : "text-slate-300"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            className="p-1.5 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors cursor-pointer"
            title="Manual Sync / Refresh Engine Data"
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
