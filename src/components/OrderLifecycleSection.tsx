import React, { useState } from "react";
import {
  Zap,
  Shield,
  ArrowRight,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Info,
  SlidersHorizontal,
  CheckCircle,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { OrderLifecycle, StatusLevel } from "../types";
import { StatusBadge } from "./StatusBadges";

interface OrderLifecycleSectionProps {
  lifecycles: OrderLifecycle[];
  loading?: boolean;
}

export const OrderLifecycleSection: React.FC<OrderLifecycleSectionProps> = ({
  lifecycles,
  loading = false,
}) => {
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("ALL");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(lifecycles[0]?.id || null);

  const filters: { label: string; value: string; count?: number }[] = [
    { label: "ALL ORDERS", value: "ALL" },
    { label: "PASS", value: "PASS" },
    { label: "WAIT", value: "WAIT" },
    { label: "BLOCKED", value: "BLOCKED" },
    { label: "ERROR", value: "ERROR" },
    { label: "DEGRADED", value: "DEGRADED" },
  ];

  const filteredLifecycles = selectedStatusFilter === "ALL"
    ? lifecycles
    : lifecycles.filter((o) => o.finalStatus === selectedStatusFilter);

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-[#121621] border border-slate-800 rounded-lg overflow-hidden shadow-lg flex flex-col font-mono text-xs">
      {/* Header & Filter Bar */}
      <div className="bg-[#181d29] border-b border-slate-800 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-cyan-400" />
          <h2 className="font-bold text-sm text-slate-100 tracking-wide">
            INTRADAY ORDER LIFECYCLE PIPELINE
          </h2>
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
            Runtime Truth Engine
          </span>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-[#0f121a] p-1 rounded-md border border-slate-800 overflow-x-auto">
          {filters.map((f) => {
            const count =
              f.value === "ALL"
                ? lifecycles.length
                : lifecycles.filter((item) => item.finalStatus === f.value).length;

            return (
              <button
                key={f.value}
                onClick={() => setSelectedStatusFilter(f.value)}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  selectedStatusFilter === f.value
                    ? "bg-slate-800 text-cyan-300 border border-cyan-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
                }`}
              >
                <span>{f.label}</span>
                <span
                  className={`text-[9px] px-1 py-0.2 rounded-full font-mono ${
                    selectedStatusFilter === f.value
                      ? "bg-cyan-500/20 text-cyan-300"
                      : "bg-slate-800 text-slate-500"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Orders List / Lifecycle Stream */}
      <div className="p-3 space-y-3 max-h-[520px] overflow-y-auto divide-y divide-slate-800/60">
        {loading ? (
          <div className="py-8 text-center text-slate-500 flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span>Syncing Order Lifecycle Pipeline...</span>
          </div>
        ) : filteredLifecycles.length === 0 ? (
          <div className="py-8 text-center text-slate-500 flex flex-col items-center gap-2">
            <Info size={24} className="text-slate-600" />
            <span>No order lifecycles matched the "{selectedStatusFilter}" filter.</span>
          </div>
        ) : (
          filteredLifecycles.map((item) => {
            const isExpanded = expandedOrderId === item.id;

            return (
              <div key={item.id} className="pt-3 first:pt-0">
                {/* Compact Pipeline Banner */}
                <div
                  onClick={() => setExpandedOrderId(isExpanded ? null : item.id)}
                  className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                    isExpanded
                      ? "bg-[#181e2b] border-slate-700 shadow-md"
                      : "bg-[#141924] border-slate-800/80 hover:border-slate-700 hover:bg-[#161c28]"
                  }`}
                >
                  {/* Top Bar: Symbol, Time, Status */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{item.symbol}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          item.side === "LONG"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                        }`}
                      >
                        {item.side} {item.order?.leverage || 10}x
                      </span>
                      <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                        {item.timeframe}
                      </span>
                      <span className="text-slate-500 text-[11px]">{formatTime(item.timestamp)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <StatusBadge status={item.finalStatus} size="sm" />
                      <button className="text-slate-400 hover:text-white p-0.5">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Horizontal Pipeline Steps Summary */}
                  <div className="mt-2.5 grid grid-cols-2 md:grid-cols-5 gap-1.5 text-[11px]">
                    {/* Step 1: Signal */}
                    <div className="bg-[#0f131d] p-1.5 rounded border border-slate-800 flex flex-col justify-between">
                      <div className="text-[9px] uppercase text-slate-500 font-semibold flex items-center justify-between">
                        <span>1. SIGNAL</span>
                        <span className="text-cyan-400 font-bold">{item.signal?.confidence}%</span>
                      </div>
                      <div className="truncate text-slate-200 font-medium my-0.5">
                        @{item.signal?.price} USDT
                      </div>
                      <div className="truncate text-[10px] text-slate-400">
                        {item.signal?.condition || "Signal Triggered"}
                      </div>
                    </div>

                    {/* Step 2: Guard */}
                    <div
                      className={`p-1.5 rounded border flex flex-col justify-between ${
                        item.guard?.status === "PASS"
                          ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                          : item.guard?.status === "BLOCKED"
                          ? "bg-amber-950/20 border-amber-500/30 text-amber-300"
                          : "bg-[#0f131d] border-slate-800 text-slate-300"
                      }`}
                    >
                      <div className="text-[9px] uppercase text-slate-500 font-semibold flex items-center justify-between">
                        <span>2. GUARD CHECK</span>
                        <StatusBadge status={item.guard?.status || "WAIT"} size="sm" showIcon={false} />
                      </div>
                      <div className="truncate text-[11px] font-semibold my-0.5">
                        {item.guard?.status === "PASS"
                          ? "Safety Passed"
                          : item.guard?.status === "BLOCKED"
                          ? "Safety Blocked"
                          : item.guard?.status}
                      </div>
                      <div className="truncate text-[10px] text-slate-400">
                        {item.guard?.blockedReason ? "Risk rule triggered" : `${item.guard?.checksPassed?.length || 0} rules checked`}
                      </div>
                    </div>

                    {/* Step 3: Order */}
                    <div className="bg-[#0f131d] p-1.5 rounded border border-slate-800 flex flex-col justify-between">
                      <div className="text-[9px] uppercase text-slate-500 font-semibold">
                        3. ORDER PARAMS
                      </div>
                      <div className="truncate text-slate-200 font-medium my-0.5">
                        ${item.order?.sizeUsdt || 0} USDT
                      </div>
                      <div className="truncate text-[10px] text-slate-400">
                        {item.order?.type} | Slip: {item.order?.slippageTolerance}
                      </div>
                    </div>

                    {/* Step 4: Protection */}
                    <div className="bg-[#0f131d] p-1.5 rounded border border-slate-800 flex flex-col justify-between">
                      <div className="text-[9px] uppercase text-slate-500 font-semibold">
                        4. PROTECTION (SL/TP)
                      </div>
                      <div className="truncate text-[10px] text-slate-300 my-0.5 flex items-center gap-1">
                        <span className="text-rose-400">SL: {item.protection?.stopLoss}</span>
                      </div>
                      <div className="truncate text-[10px] text-emerald-400">
                        TP: {item.protection?.takeProfit}
                      </div>
                    </div>

                    {/* Step 5: Final Status */}
                    <div className="bg-[#0f131d] p-1.5 rounded border border-slate-800 flex flex-col justify-between col-span-2 md:col-span-1">
                      <div className="text-[9px] uppercase text-slate-500 font-semibold">
                        5. FINAL OUTCOME
                      </div>
                      <div className="my-0.5">
                        <StatusBadge status={item.finalStatus} size="sm" />
                      </div>
                      <div className="truncate text-[10px] text-slate-400">
                        {item.failureReason ? "Failed / Blocked" : "Engine Processed"}
                      </div>
                    </div>
                  </div>

                  {/* Failure / Block Reason Banner */}
                  {item.failureReason && (
                    <div className="mt-2 p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start gap-2 text-[11px]">
                      <ShieldAlert size={14} className="text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">FAILURE / BLOCK REASON: </span>
                        <span>{item.failureReason}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Expanded Detail Panel */}
                {isExpanded && (
                  <div className="mt-2 p-3 bg-[#0d1017] border border-slate-800 rounded-lg text-slate-300 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Left Detail Column */}
                    <div className="space-y-2 border-r border-slate-800/80 pr-2">
                      <div className="font-bold text-cyan-400 uppercase tracking-wider text-[11px]">
                        Signal & Scanner Detail
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                        <div>
                          <span className="text-slate-500">Scan Price:</span>{" "}
                          <span className="font-mono">{item.signal?.price} USDT</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Scan Score:</span>{" "}
                          <span className="font-mono text-cyan-400">{item.signal?.scanScore} / 10</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-slate-500">Trigger Condition:</span>{" "}
                          <span className="text-slate-200">{item.signal?.condition}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800">
                        <div className="font-bold text-amber-400 uppercase tracking-wider text-[11px] mb-1">
                          Safety Guard Checks ({item.guard?.checksPassed?.length || 0})
                        </div>
                        <ul className="space-y-1 text-[11px]">
                          {item.guard?.checksPassed?.map((chk, i) => (
                            <li key={i} className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle size={12} />
                              <span>{chk}</span>
                            </li>
                          ))}
                          {item.guard?.blockedReason && (
                            <li className="flex items-center gap-1 text-rose-400 font-bold">
                              <AlertCircle size={12} />
                              <span>{item.guard.blockedReason}</span>
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>

                    {/* Right Detail Column */}
                    <div className="space-y-2">
                      <div className="font-bold text-purple-400 uppercase tracking-wider text-[11px]">
                        Order Parameters & Risk Attachment
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                        <div>
                          <span className="text-slate-500">Notional Size:</span>{" "}
                          <span className="font-mono">${item.order?.sizeUsdt} USDT</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Leverage:</span>{" "}
                          <span className="font-mono">{item.order?.leverage}x</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Stop Loss:</span>{" "}
                          <span className="font-mono text-rose-400">{item.protection?.stopLoss} USDT</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Take Profit:</span>{" "}
                          <span className="font-mono text-emerald-400">{item.protection?.takeProfit} USDT</span>
                        </div>
                        <div className="col-span-2">
                          <span className="text-slate-500">Trailing Stop:</span>{" "}
                          <span className="text-slate-300">{item.protection?.trailingStop}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500">
                        <span>Order Unique Hash: {item.id}</span>
                        <span>Environment: Bybit V5 Unified Trading Demo</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
