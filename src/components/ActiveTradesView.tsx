import React, { useState } from "react";
import { Position, OrderLifecycle, BotStatusResponse } from "../types";
import {
  Activity,
  RotateCw,
  AlertTriangle,
  ShieldAlert,
  Clock,
  TrendingUp,
  TrendingDown,
  X,
  SlidersHorizontal,
  CheckCircle2,
  Info,
  DollarSign,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronUp,
  XCircle,
} from "lucide-react";

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
  // Navigation tab: "TODAY" or "7DAYS"
  const [activeSubTab, setActiveSubTab] = useState<"TODAY" | "7DAYS">("TODAY");

  // State for modals & inline controls
  const [closeConfirmPos, setCloseConfirmPos] = useState<Position | null>(null);
  const [isClosing, setIsClosing] = useState<boolean>(false);

  const [editSLTPPos, setEditSLTPPos] = useState<Position | null>(null);
  const [newSL, setNewSL] = useState<string>("");
  const [newTP, setNewTP] = useState<string>("");
  const [isUpdatingSLTP, setIsUpdatingSLTP] = useState<boolean>(false);

  // Filters for 7 days view
  const [searchTerm, setSearchTerm] = useState("");
  const [sideFilter, setSideFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleConfirmClose = async () => {
    if (!closeConfirmPos) return;
    setIsClosing(true);
    try {
      await onClosePosition(closeConfirmPos.id);
      setCloseConfirmPos(null);
    } catch (err) {
      console.error("Failed to close position:", err);
    } finally {
      setIsClosing(false);
    }
  };

  const handleOpenEditSLTP = (pos: Position) => {
    setEditSLTPPos(pos);
    setNewSL(pos.stopLoss ? String(pos.stopLoss) : "");
    setNewTP(pos.takeProfit ? String(pos.takeProfit) : "");
  };

  const handleSaveSLTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSLTPPos) return;
    setIsUpdatingSLTP(true);
    try {
      const slVal = newSL ? parseFloat(newSL) : undefined;
      const tpVal = newTP ? parseFloat(newTP) : undefined;
      await onUpdateSLTP(editSLTPPos.id, slVal, tpVal);
      setEditSLTPPos(null);
    } catch (err) {
      console.error("Failed to update SL/TP:", err);
    } finally {
      setIsUpdatingSLTP(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const formatPrice = (price: number) => {
    if (price < 1) return price.toFixed(4);
    if (price < 10) return price.toFixed(3);
    return price.toFixed(2);
  };

  // Warning check for missing SL/TP
  const getPositionWarnings = (pos: Position) => {
    const warnings: string[] = [];
    if (!pos.stopLoss || pos.stopLoss === 0) {
      warnings.push("SL Missing");
    }
    if (!pos.takeProfit || pos.takeProfit === 0) {
      warnings.push("TP Missing");
    }
    return warnings;
  };

  // Local calendar date boundaries
  const getStartOfTodayLocal = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  const getStartOf7DaysAgoLocal = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 6); // 7 days including today
    return d.getTime();
  };

  const startOfToday = getStartOfTodayLocal();
  const startOf7DaysAgo = getStartOf7DaysAgoLocal();

  // Filter lifecycles for "Today" and "7 Days"
  const todayLifecycles = lifecycles.filter((item) => {
    const timestamp = new Date(item.timestamp).getTime();
    return timestamp >= startOfToday;
  });

  const sevenDaysLifecycles = lifecycles.filter((item) => {
    const timestamp = new Date(item.timestamp).getTime();
    // Strict 7-day filter, including date boundaries
    if (timestamp < startOf7DaysAgo) return false;

    // Search and secondary dropdown filters
    const matchesSearch =
      item.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.failureReason && item.failureReason.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesSide = sideFilter === "ALL" ? true : item.side === sideFilter;
    const matchesStatus = statusFilter === "ALL" ? true : item.finalStatus === statusFilter;

    return matchesSearch && matchesSide && matchesStatus;
  });

  // Sort: newest first
  const sortedTodayLifecycles = [...todayLifecycles].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const sortedSevenDaysLifecycles = [...sevenDaysLifecycles].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const renderStatusBadge = (finalStatus: string, failureReason: string | null) => {
    switch (finalStatus) {
      case "PASS":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-2.5 h-2.5" /> FILLED
          </span>
        );
      case "BLOCKED":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <ShieldAlert className="w-2.5 h-2.5" /> BLOCKED
          </span>
        );
      case "WAIT":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock className="w-2.5 h-2.5" /> WAITING
          </span>
        );
      case "ERROR":
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20" title={failureReason || ""}>
            <XCircle className="w-2.5 h-2.5" /> FAILED
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
            {finalStatus}
          </span>
        );
    }
  };

  if (isLoading && positions.length === 0 && lifecycles.length === 0) {
    return (
      <div className="p-4 space-y-3 max-w-[1700px] mx-auto animate-pulse" id="active-trades-skeleton">
        <div className="h-8 bg-slate-800 rounded w-1/4"></div>
        <div className="h-48 bg-slate-800/40 rounded border border-slate-700/50"></div>
      </div>
    );
  }

  const activePnL = positions.reduce((sum, pos) => sum + pos.floatingPnL, 0);

  return (
    <div className="space-y-4 max-w-[1700px] mx-auto text-slate-200" id="active-trades-container">
      {/* 1. Header & Summary Stats */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-blue-400" />
              Active Trades & Execution Logs
            </h2>
            <span className="px-2 py-0.2 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[9px] font-semibold">
              Bybit Demo Live
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
            <span>Open Positions: <strong className="text-slate-200 font-mono">{positions.length}</strong></span>
            <span>•</span>
            <span>Unrealized PnL: <strong className={`font-mono ${activePnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{formatCurrency(activePnL)}</strong></span>
            <span>•</span>
            <span>Today's Total Runs: <strong className="text-slate-200 font-mono">{todayLifecycles.length}</strong></span>
          </p>
        </div>

        <div className="flex items-center gap-3.5 w-full sm:w-auto shrink-0">
          {/* Tabs switch */}
          <div className="flex bg-[#0f131d] p-0.5 rounded border border-slate-800 font-mono text-[10px]">
            <button
              onClick={() => setActiveSubTab("TODAY")}
              className={`px-3 py-1 rounded font-bold cursor-pointer transition-all ${
                activeSubTab === "TODAY"
                  ? "bg-slate-800 text-cyan-300 shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setActiveSubTab("7DAYS")}
              className={`px-3 py-1 rounded font-bold cursor-pointer transition-all ${
                activeSubTab === "7DAYS"
                  ? "bg-slate-800 text-cyan-300 shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Last 7 Days
            </button>
          </div>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold bg-blue-600/90 hover:bg-blue-500 text-white border border-blue-500/30 transition-all cursor-pointer shadow disabled:opacity-50"
            id="refresh-positions-btn"
          >
            <RotateCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
            Sync
          </button>
        </div>
      </div>

      {/* 2. Connection Errors */}
      {isError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 text-red-300 text-[11px] flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span><strong>API Sync Notice:</strong> {errorMessage || "Sync failed with Bybit Demo backend."}</span>
        </div>
      )}

      {/* 3. TODAY TAB CONTENT */}
      {activeSubTab === "TODAY" && (
        <div className="space-y-4">
          {/* Active Positions Sub-section */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
            <div className="bg-slate-900/60 border-b border-slate-800 px-3 py-2 flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                Current Open Positions
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">Real-time Account State</span>
            </div>

            <div className="overflow-x-auto max-h-[300px] scrollbar-thin scrollbar-thumb-slate-800">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="bg-slate-800/80 text-slate-300 font-bold border-b border-slate-800">
                  <tr>
                    <th className="p-2">Symbol</th>
                    <th className="p-2">Side</th>
                    <th className="p-2 text-right">Quantity</th>
                    <th className="p-2 text-right">Entry Price</th>
                    <th className="p-2 text-right">Mark Price</th>
                    <th className="p-2 text-right">Value (USDT)</th>
                    <th className="p-2 text-center">Leverage</th>
                    <th className="p-2 text-right">Floating PnL</th>
                    <th className="p-2 text-right">SL / TP Price</th>
                    <th className="p-2 text-center">Protection</th>
                    <th className="p-2 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {positions.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-400">
                        <Info className="w-5 h-5 mx-auto mb-1 text-slate-600" />
                        <p className="text-xs font-bold text-slate-300">Account is flat</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">No open positions returned by Bybit backend.</p>
                      </td>
                    </tr>
                  ) : (
                    positions.map((pos) => {
                      const warnings = getPositionWarnings(pos);
                      const isLong = pos.side === "LONG";
                      const pnlIsPositive = pos.floatingPnL >= 0;

                      return (
                        <tr key={pos.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-2 font-bold text-slate-100">{pos.symbol}</td>
                          <td className="p-2">
                            <span
                              className={`inline-flex items-center gap-0.5 px-1 rounded text-[10px] font-bold border ${
                                isLong
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              }`}
                            >
                              {isLong ? "BUY" : "SELL"}
                            </span>
                          </td>
                          <td className="p-2 text-right">{pos.size}</td>
                          <td className="p-2 text-right">{formatPrice(pos.entryPrice)}</td>
                          <td className="p-2 text-right">{formatPrice(pos.markPrice)}</td>
                          <td className="p-2 text-right text-slate-300">{formatCurrency(pos.notionalUsdt)}</td>
                          <td className="p-2 text-center text-blue-400 font-bold">{pos.leverage}x</td>
                          <td className="p-2 text-right">
                            <div className={`font-bold ${pnlIsPositive ? "text-emerald-400" : "text-rose-400"}`}>
                              {pnlIsPositive ? "+" : ""}{formatCurrency(pos.floatingPnL)}
                            </div>
                            <div className={`text-[9px] ${pnlIsPositive ? "text-emerald-500" : "text-rose-500"}`}>
                              ({pnlIsPositive ? "+" : ""}{pos.pnlPercent.toFixed(2)}%)
                            </div>
                          </td>
                          <td className="p-2 text-right">
                            <div className="text-rose-300">SL: {pos.stopLoss ? formatPrice(pos.stopLoss) : "--"}</div>
                            <div className="text-emerald-300">TP: {pos.takeProfit ? formatPrice(pos.takeProfit) : "--"}</div>
                          </td>
                          <td className="p-2 text-center">
                            {warnings.length === 0 ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                                Protected
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20" title={warnings.join(", ")}>
                                Unprotected
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1 font-sans">
                              <button
                                onClick={() => handleOpenEditSLTP(pos)}
                                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 text-[10px] font-medium cursor-pointer transition-colors"
                              >
                                SL/TP
                              </button>
                              <button
                                onClick={() => setCloseConfirmPos(pos)}
                                className="px-1.5 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-semibold cursor-pointer transition-colors"
                              >
                                Close
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Today's Lifecycle History Sub-section */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
            <div className="bg-slate-900/60 border-b border-slate-800 px-3 py-2 flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 font-mono">
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                Today's Order & Activity Log
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">{sortedTodayLifecycles.length} Executions Today</span>
            </div>

            <div className="overflow-x-auto max-h-[350px] scrollbar-thin scrollbar-thumb-slate-800">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead className="bg-slate-800/80 text-slate-300 font-bold border-b border-slate-800">
                  <tr>
                    <th className="p-2">Time</th>
                    <th className="p-2">Symbol</th>
                    <th className="p-2">Side</th>
                    <th className="p-2 text-right">Size (USDT)</th>
                    <th className="p-2 text-right">Execution Price</th>
                    <th className="p-2 text-center">Type</th>
                    <th className="p-2 text-center">Status</th>
                    <th className="p-2">Reason / Evidence Message</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {sortedTodayLifecycles.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400">
                        <Clock className="w-5 h-5 mx-auto mb-1 text-slate-600" />
                        <p className="text-xs font-bold text-slate-300">No activity today yet</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">The engine has not placed or blocked any orders since midnight.</p>
                      </td>
                    </tr>
                  ) : (
                    sortedTodayLifecycles.map((item) => {
                      const isLong = item.side === "LONG";
                      return (
                        <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-2 text-slate-400">{new Date(item.timestamp).toLocaleTimeString()}</td>
                          <td className="p-2 font-bold text-slate-200">{item.symbol}</td>
                          <td className="p-2">
                            <span className={`text-[10px] font-bold ${isLong ? "text-emerald-400" : "text-rose-400"}`}>
                              {isLong ? "BUY" : "SELL"}
                            </span>
                          </td>
                          <td className="p-2 text-right">${item.order.sizeUsdt.toFixed(1)}</td>
                          <td className="p-2 text-right">${item.signal.price.toFixed(2)}</td>
                          <td className="p-2 text-center text-[10px] text-slate-300">{item.order.type}</td>
                          <td className="p-2 text-center">{renderStatusBadge(item.finalStatus, item.failureReason)}</td>
                          <td className="p-2 text-slate-300 text-[10px] font-sans truncate max-w-xs" title={item.failureReason || item.guard.blockedReason || "Order validated & triggered successfully"}>
                            {item.failureReason || item.guard.blockedReason || <span className="text-emerald-500/80">✔ Guard checks passed, filled on API feed</span>}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. LAST 7 DAYS TAB CONTENT */}
      {activeSubTab === "7DAYS" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
          {/* Filters header bar */}
          <div className="bg-slate-800/40 border-b border-slate-800 px-3 py-2 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 font-mono">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              7-Day Execution History
              <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-400 px-1.5 py-0.2 rounded font-normal font-sans ml-1">
                {sortedSevenDaysLifecycles.length} total logs
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="w-3 h-3 text-slate-400 absolute left-2 top-2" />
                <input
                  type="text"
                  placeholder="Search symbol/reason..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-slate-900/80 border border-slate-700 text-slate-200 text-[11px] rounded px-2.5 py-1 pl-7 focus:outline-none focus:border-blue-500 w-40 md:w-52"
                />
              </div>

              {/* Side filter */}
              <select
                value={sideFilter}
                onChange={(e) => setSideFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-300 text-[11px] rounded px-2.5 py-1 font-mono focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Sides</option>
                <option value="LONG">Long</option>
                <option value="SHORT">Short</option>
              </select>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-300 text-[11px] rounded px-2.5 py-1 font-mono focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="PASS">Filled</option>
                <option value="BLOCKED">Blocked</option>
                <option value="ERROR">Failed</option>
                <option value="WAIT">Waiting</option>
              </select>
            </div>
          </div>

          {/* Records Table */}
          <div className="overflow-x-auto max-h-[550px] scrollbar-thin scrollbar-thumb-slate-800">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead className="bg-slate-800/80 text-slate-300 font-bold border-b border-slate-800">
                <tr>
                  <th className="p-2 w-8"></th>
                  <th className="p-2">Date/Time</th>
                  <th className="p-2">Symbol</th>
                  <th className="p-2">Side</th>
                  <th className="p-2 text-right">Size</th>
                  <th className="p-2 text-right">Price</th>
                  <th className="p-2 text-center">Type</th>
                  <th className="p-2 text-center">Status</th>
                  <th className="p-2">Protection Details</th>
                  <th className="p-2">Result/Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {sortedSevenDaysLifecycles.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-12 text-center text-slate-400">
                      <Clock className="w-6 h-6 mx-auto mb-1.5 text-slate-600" />
                      <p className="text-xs font-bold text-slate-300">No records found</p>
                      <p className="text-[10px] text-slate-500 mt-1">No log matches within the strict 7-day query timeframe.</p>
                    </td>
                  </tr>
                ) : (
                  sortedSevenDaysLifecycles.map((item) => {
                    const isLong = item.side === "LONG";
                    const isExpanded = expandedId === item.id;
                    const formattedDate = new Date(item.timestamp).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });

                    return (
                      <React.Fragment key={item.id}>
                        <tr
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                        >
                          <td className="p-2 text-center">
                            {isExpanded ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
                          </td>
                          <td className="p-2 text-slate-400 font-sans">{formattedDate}</td>
                          <td className="p-2 font-bold text-slate-200">{item.symbol}</td>
                          <td className="p-2">
                            <span className={`text-[10px] font-bold ${isLong ? "text-emerald-400" : "text-rose-400"}`}>
                              {item.side}
                            </span>
                          </td>
                          <td className="p-2 text-right">${item.order.sizeUsdt.toFixed(1)}</td>
                          <td className="p-2 text-right">${item.signal.price.toFixed(2)}</td>
                          <td className="p-2 text-center text-[10px] text-slate-400">{item.order.type}</td>
                          <td className="p-2 text-center">{renderStatusBadge(item.finalStatus, item.failureReason)}</td>
                          <td className="p-2 text-slate-300 text-[10px]">
                            SL: {item.protection.stopLoss ? item.protection.stopLoss : "None"} • TP: {item.protection.takeProfit ? item.protection.takeProfit : "None"}
                          </td>
                          <td className="p-2 text-slate-400 text-[10px] font-sans truncate max-w-xs">
                            {item.failureReason || item.guard.blockedReason || "Triggered & Filled"}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-slate-950/40">
                            <td colSpan={10} className="p-3">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px] font-mono text-slate-400 border border-slate-800 p-2.5 rounded bg-slate-900/40">
                                <div>
                                  <div className="font-bold text-slate-300 mb-1">Signal Details</div>
                                  <div>Condition: <span className="text-slate-200">{item.signal.condition}</span></div>
                                  <div>Confidence: <span className="text-slate-200">{item.signal.confidence}%</span></div>
                                  <div>Scan Score: <span className="text-slate-200">{item.signal.scanScore}</span></div>
                                </div>
                                <div>
                                  <div className="font-bold text-slate-300 mb-1">Guard Checks</div>
                                  <div>Status: <span className="text-slate-200">{item.guard.status}</span></div>
                                  <div>Checks Passed:
                                    <div className="text-[9px] text-emerald-400 pl-1 mt-0.5">
                                      {item.guard.checksPassed.map((c, i) => (
                                        <div key={i}>✔ {c}</div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                <div>
                                  <div className="font-bold text-slate-300 mb-1">API Evidence Log</div>
                                  <div>ID: <span className="text-slate-200">{item.id}</span></div>
                                  <div>Slippage: <span className="text-slate-200">{item.order.slippageTolerance}%</span></div>
                                  {item.failureReason && (
                                    <div className="mt-1 text-rose-400">
                                      Error Details: {item.failureReason}
                                    </div>
                                  )}
                                </div>
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
      )}

      {/* 5. Close Position Confirmation Modal */}
      {closeConfirmPos && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/40 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <ShieldAlert className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-slate-100">Confirm Close Position</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to market close <strong className="text-slate-100">{closeConfirmPos.symbol} ({closeConfirmPos.side})</strong>? This action will execute directly through the Bybit Demo API endpoint.
            </p>
            <div className="bg-slate-800/80 p-3 rounded-lg text-xs space-y-1 font-mono text-slate-300 border border-slate-700">
              <div>Position Value: <span className="font-bold text-slate-100">{formatCurrency(closeConfirmPos.notionalUsdt)}</span></div>
              <div>Current Floating PnL: <span className={`font-bold ${closeConfirmPos.floatingPnL >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{formatCurrency(closeConfirmPos.floatingPnL)}</span></div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setCloseConfirmPos(null)}
                disabled={isClosing}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClose}
                disabled={isClosing}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isClosing ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : null}
                Confirm Market Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Update SL/TP Modal */}
      {editSLTPPos && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveSLTP} className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-blue-400" />
                Update Protection: {editSLTPPos.symbol}
              </h3>
              <button
                type="button"
                onClick={() => setEditSLTPPos(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1">Stop Loss (USDT)</label>
                <input
                  type="number"
                  step="any"
                  value={newSL}
                  onChange={(e) => setNewSL(e.target.value)}
                  placeholder="e.g. 66500.00"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1">Take Profit (USDT)</label>
                <input
                  type="number"
                  step="any"
                  value={newTP}
                  onChange={(e) => setNewTP(e.target.value)}
                  placeholder="e.g. 68800.00"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEditSLTPPos(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUpdatingSLTP}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow transition-all cursor-pointer flex items-center gap-1.5"
              >
                {isUpdatingSLTP ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : null}
                Save Protection
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
