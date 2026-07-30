import React, { useState } from "react";
import {
  ScannerDataResponse,
  ScannerSignalItem,
  BotStatusResponse,
} from "../types";
import {
  Search,
  RotateCw,
  Clock,
  ShieldAlert,
  Sliders,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  Layers,
  Zap,
  Info,
  Check,
} from "lucide-react";

interface ScannerAndSignalsViewProps {
  scannerData: ScannerDataResponse | null;
  botStatus: BotStatusResponse | null;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRefresh: () => void;
}

type SortField =
  | "symbol"
  | "signal"
  | "change24hPct"
  | "turnoverUsdt"
  | "spreadPct"
  | "atr15m"
  | "volumeRatio"
  | "costTier"
  | "routerConfidencePct"
  | "signalCandleTime"
  | "executionReadiness";

export const ScannerAndSignalsView: React.FC<ScannerAndSignalsViewProps> = ({
  scannerData,
  botStatus,
  isLoading,
  isError,
  errorMessage,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [signalFilter, setSignalFilter] = useState<string>("ALL");
  const [readinessFilter, setReadinessFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<SortField>("routerConfidencePct");
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>("BTCUSDT");
  const [showPolicy, setShowPolicy] = useState<boolean>(false);

  if (isLoading && !scannerData) {
    return (
      <div className="p-6 space-y-4 max-w-[1600px] mx-auto animate-pulse" id="scanner-skeleton">
        <div className="h-8 bg-slate-800 rounded w-1/4"></div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-800/60 rounded border border-slate-700/50"></div>
          ))}
        </div>
        <div className="h-96 bg-slate-800/40 rounded border border-slate-700/50"></div>
      </div>
    );
  }

  const summary = scannerData?.summary;
  const policy = scannerData?.policy;
  const rawSignals = scannerData?.signals || [];

  // Filter signals
  const filteredSignals = rawSignals.filter((item) => {
    const matchesSearch =
      item.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.routerReason.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSignal =
      signalFilter === "ALL" ? true : item.signal === signalFilter;

    const matchesReadiness =
      readinessFilter === "ALL"
        ? true
        : item.executionReadiness === readinessFilter;

    return matchesSearch && matchesSignal && matchesReadiness;
  });

  // Sort signals
  const sortedSignals = [...filteredSignals].sort((a, b) => {
    let aVal: any = a[sortField];
    let bVal: any = b[sortField];

    if (sortField === "signalCandleTime") {
      aVal = a.signalCandleTime ?? 0;
      bVal = b.signalCandleTime ?? 0;
    }

    if (typeof aVal === "string") {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortAsc ? (aVal > bVal ? 1 : -1) : aVal < bVal ? 1 : -1;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const toggleExpand = (symbol: string) => {
    setExpandedSymbol(expandedSymbol === symbol ? null : symbol);
  };

  const formatCurrency = (num: number) => {
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toFixed(2)}`;
  };

  const renderSignalBadge = (signal: string) => {
    switch (signal) {
      case "Buy":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> BUY
          </span>
        );
      case "Sell":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <XCircle className="w-3 h-3" /> SELL
          </span>
        );
      case "WAIT":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" /> WAIT
          </span>
        );
      case "Blocked":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30">
            <ShieldAlert className="w-3 h-3" /> Blocked
          </span>
        );
      case "Error":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
            <AlertTriangle className="w-3 h-3" /> Error
          </span>
        );
      default:
        return <span className="text-slate-400 text-xs">{signal}</span>;
    }
  };

  const renderReadinessBadge = (item: ScannerSignalItem) => {
    // Enforcement rule: WAIT is NEVER executable
    if (item.signal === "WAIT") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-amber-300 border border-amber-500/30" title={item.readinessReason}>
          <Clock className="w-3 h-3 text-amber-400" /> NOT EXECUTABLE (WAIT)
        </span>
      );
    }

    // Enforcement rule: signalCandleTime missing/null is NEVER executable
    if (item.signalCandleTime === null) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700" title="Closed-candle identity missing">
          <AlertTriangle className="w-3 h-3 text-amber-400" /> Candle Unconfirmed
        </span>
      );
    }

    switch (item.executionReadiness) {
      case "EXECUTABLE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" title={item.readinessReason}>
            <Check className="w-3 h-3 text-emerald-400" /> EXECUTABLE
          </span>
        );
      case "PENDING_RISK":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30" title={item.readinessReason}>
            <Activity className="w-3 h-3 text-purple-400" /> Risk Evaluation Pending
          </span>
        );
      case "BLOCKED":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/30" title={item.readinessReason}>
            <ShieldAlert className="w-3 h-3 text-orange-400" /> BLOCKED BY GUARD
          </span>
        );
      case "ERROR":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30" title={item.readinessReason}>
            <XCircle className="w-3 h-3 text-red-400" /> ERROR
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700" title={item.readinessReason}>
            NOT EXECUTABLE
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 max-w-[1700px] mx-auto text-slate-200" id="scanner-and-signals-container">
      {/* 1. Header & Quick Controls Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              Scanner & Execution Readiness Truth
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
              {summary?.universeLabel || "Liquid Intraday Top Movers"}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {summary?.bybitMode || "Bybit Demo API"}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-3">
            <span>Entry Timeframe: <strong className="text-slate-200">{summary?.entryTimeframe || "5m"}</strong></span>
            <span>•</span>
            <span>Router Mode: <strong className="text-amber-400">{summary?.routerMode || botStatus?.routerMode || "HYBRID"}</strong></span>
            <span>•</span>
            <span>Strategy Rule: <strong className="text-blue-400">Shortlist 20 → Deep Scan 10</strong></span>
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-right text-xs text-slate-400 hidden lg:block">
            <div>Last Updated: <span className="font-mono text-slate-200">{summary?.lastUpdated ? new Date(summary.lastUpdated).toLocaleTimeString() : "--:--:--"}</span></div>
            <div>Scan Time: <span className="font-mono text-emerald-400">{summary?.scanDurationMs || 0}ms</span> | Next Scan: <span className="font-mono text-amber-400">{botStatus?.nextScanSeconds ?? 15}s</span></div>
          </div>

          <button
            onClick={() => setShowPolicy(!showPolicy)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showPolicy
                ? "bg-blue-600 text-white border-blue-500"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
            }`}
            id="toggle-policy-panel-btn"
          >
            <Sliders className="w-3.5 h-3.5" />
            {showPolicy ? "Hide Policy Panel" : "View Scanner Policy"}
          </button>

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 shadow transition-all disabled:opacity-50 cursor-pointer"
            id="manual-scanner-refresh-btn"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh Signals
          </button>
        </div>
      </div>

      {/* Warning Banners if Error or Offline */}
      {isError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <div>
            <strong>Scanner Warning:</strong> {errorMessage || "Failed to fetch latest scanner truth payload from backend API."}
          </div>
        </div>
      )}

      {!botStatus?.backendConnected && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-amber-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <div>
            <strong>Backend Disconnected:</strong> Scanner updates are operating in degraded mode. Showing last cached memory state.
          </div>
        </div>
      )}

      {/* 2. Scanner Summary Metrics Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-2.5" id="scanner-summary-cards">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
            <span className="text-[10px] text-slate-400 font-medium block">Total Contracts</span>
            <span className="text-base font-bold text-slate-100 font-mono">{summary.totalContracts}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
            <span className="text-[10px] text-slate-400 font-medium block">Valid USDT</span>
            <span className="text-base font-bold text-blue-400 font-mono">{summary.validUsdtContracts}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
            <span className="text-[10px] text-slate-400 font-medium block">Spread Passed</span>
            <span className="text-base font-bold text-emerald-400 font-mono">{summary.spreadPassed}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
            <span className="text-[10px] text-slate-400 font-medium block">Liquidity Passed</span>
            <span className="text-base font-bold text-cyan-400 font-mono">{summary.liquidityPassed}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
            <span className="text-[10px] text-slate-400 font-medium block">Enriched</span>
            <span className="text-base font-bold text-indigo-400 font-mono">{summary.enriched}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
            <span className="text-[10px] text-slate-400 font-medium block">Shortlisted</span>
            <span className="text-base font-bold text-purple-400 font-mono">{summary.shortlisted}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
            <span className="text-[10px] text-slate-400 font-medium block">Deep Scanned</span>
            <span className="text-base font-bold text-amber-400 font-mono">{summary.deepScanned}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
            <span className="text-[10px] text-slate-400 font-medium block">Completed</span>
            <span className="text-base font-bold text-emerald-400 font-mono">{summary.completed}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
            <span className="text-[10px] text-slate-400 font-medium block">Rejected</span>
            <span className="text-base font-bold text-rose-400 font-mono">{summary.rejected}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-center">
            <span className="text-[10px] text-slate-400 font-medium block">Timed Out</span>
            <span className="text-base font-bold text-slate-400 font-mono">{summary.timedOut}</span>
          </div>
        </div>
      )}

      {/* 3. Scanner Policy Panel (Expandable) */}
      {showPolicy && policy && (
        <div className="bg-slate-900/90 border border-blue-500/30 rounded-xl p-4 text-xs space-y-3 shadow-xl backdrop-blur" id="scanner-policy-panel">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-blue-400 flex items-center gap-1.5 text-sm">
              <Sliders className="w-4 h-4" /> Scanner Strategy & Execution Threshold Policy
            </span>
            <span className="text-slate-400 text-[11px]">Enforced by Intraday Router Kernel</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 font-mono">
            <div className="bg-slate-800/60 p-2 rounded border border-slate-700/60">
              <div className="text-slate-400 text-[10px]">Shortlist Size</div>
              <div className="text-slate-100 font-bold">{policy.shortlistSize} pairs</div>
            </div>
            <div className="bg-slate-800/60 p-2 rounded border border-slate-700/60">
              <div className="text-slate-400 text-[10px]">Deep Scan Size</div>
              <div className="text-slate-100 font-bold">{policy.deepScanSize} pairs</div>
            </div>
            <div className="bg-slate-800/60 p-2 rounded border border-slate-700/60">
              <div className="text-slate-400 text-[10px]">Max Spread</div>
              <div className="text-emerald-400 font-bold">{(policy.maxSpreadThresholdPct * 100).toFixed(2)}%</div>
            </div>
            <div className="bg-slate-800/60 p-2 rounded border border-slate-700/60">
              <div className="text-slate-400 text-[10px]">Min 24h Turnover</div>
              <div className="text-slate-100 font-bold">{formatCurrency(policy.minTurnoverUsdt)}</div>
            </div>
            <div className="bg-slate-800/60 p-2 rounded border border-slate-700/60">
              <div className="text-slate-400 text-[10px]">Min Vol Ratio</div>
              <div className="text-amber-400 font-bold">{policy.minVolumeRatio.toFixed(2)}x</div>
            </div>
            <div className="bg-slate-800/60 p-2 rounded border border-slate-700/60">
              <div className="text-slate-400 text-[10px]">Min Net RR</div>
              <div className="text-blue-400 font-bold">{policy.minNetRR.toFixed(2)} R</div>
            </div>
            <div className="bg-slate-800/60 p-2 rounded border border-slate-700/60">
              <div className="text-slate-400 text-[10px]">Cost-to-Risk Limit</div>
              <div className="text-indigo-400 font-bold">{policy.normalCostToRiskLimitPct.toFixed(1)}%</div>
            </div>
            <div className="bg-slate-800/60 p-2 rounded border border-slate-700/60">
              <div className="text-slate-400 text-[10px]">Scan Deadline</div>
              <div className="text-purple-400 font-bold">{policy.scanDeadlineMs} ms</div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Table Controls (Search & Filters) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter symbol or reason..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-400 focus:outline-none focus:border-blue-500"
              id="scanner-search-input"
            />
          </div>

          <select
            value={signalFilter}
            onChange={(e) => setSignalFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            id="scanner-signal-filter"
          >
            <option value="ALL">All Signals</option>
            <option value="Buy">Buy</option>
            <option value="Sell">Sell</option>
            <option value="WAIT">WAIT</option>
            <option value="Blocked">Blocked</option>
            <option value="Error">Error</option>
          </select>

          <select
            value={readinessFilter}
            onChange={(e) => setReadinessFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            id="scanner-readiness-filter"
          >
            <option value="ALL">All Readiness</option>
            <option value="EXECUTABLE">Executable</option>
            <option value="NOT_EXECUTABLE">Not Executable</option>
            <option value="PENDING_RISK">Pending Risk</option>
            <option value="BLOCKED">Blocked</option>
          </select>
        </div>

        <div className="text-slate-400 text-xs text-right w-full md:w-auto">
          Showing <strong className="text-slate-100">{sortedSignals.length}</strong> of <strong className="text-slate-100">{rawSignals.length}</strong> scanned contracts
        </div>
      </div>

      {/* 5. Scanner Results Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl" id="scanner-table-wrapper">
        <div className="overflow-x-auto max-h-[650px] scrollbar-thin scrollbar-thumb-slate-700">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800/90 text-slate-300 font-semibold sticky top-0 z-10 border-b border-slate-700 backdrop-blur">
              <tr>
                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort("symbol")}>
                  <div className="flex items-center gap-1">
                    Symbol {sortField === "symbol" && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="p-3 cursor-pointer hover:text-white" onClick={() => handleSort("signal")}>
                  <div className="flex items-center gap-1">
                    Signal {sortField === "signal" && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="p-3">Router Reason</th>
                <th className="p-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort("change24hPct")}>
                  <div className="flex items-center justify-end gap-1">
                    24h Change {sortField === "change24hPct" && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="p-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort("turnoverUsdt")}>
                  <div className="flex items-center justify-end gap-1">
                    Turnover {sortField === "turnoverUsdt" && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="p-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort("spreadPct")}>
                  <div className="flex items-center justify-end gap-1">
                    Spread {sortField === "spreadPct" && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="p-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort("atr15m")}>
                  <div className="flex items-center justify-end gap-1">
                    ATR 15m {sortField === "atr15m" && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="p-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort("volumeRatio")}>
                  <div className="flex items-center justify-end gap-1">
                    Vol Ratio {sortField === "volumeRatio" && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="p-3 cursor-pointer hover:text-white text-center" onClick={() => handleSort("costTier")}>
                  <div className="flex items-center justify-center gap-1">
                    Cost Tier {sortField === "costTier" && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="p-3 cursor-pointer hover:text-white text-right" onClick={() => handleSort("routerConfidencePct")}>
                  <div className="flex items-center justify-end gap-1">
                    Confidence {sortField === "routerConfidencePct" && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="p-3 cursor-pointer hover:text-white text-center" onClick={() => handleSort("signalCandleTime")}>
                  <div className="flex items-center justify-center gap-1">
                    Candle Time {sortField === "signalCandleTime" && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                  </div>
                </th>
                <th className="p-3 text-center">Execution Readiness</th>
                <th className="p-3 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {sortedSignals.length === 0 ? (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-slate-400 font-sans">
                    <Info className="w-6 h-6 mx-auto mb-2 text-slate-500" />
                    No contracts match the selected search/filter criteria.
                  </td>
                </tr>
              ) : (
                sortedSignals.map((item) => {
                  const isExpanded = expandedSymbol === item.symbol;
                  return (
                    <React.Fragment key={item.symbol}>
                      <tr
                        onClick={() => toggleExpand(item.symbol)}
                        className={`hover:bg-slate-800/60 cursor-pointer transition-colors ${
                          isExpanded ? "bg-slate-800/40" : ""
                        }`}
                      >
                        <td className="p-3 font-bold text-slate-100 font-sans">
                          {item.symbol}
                        </td>
                        <td className="p-3">{renderSignalBadge(item.signal)}</td>
                        <td className="p-3 font-sans text-slate-300 text-[11px] max-w-xs truncate">
                          {item.routerReason}
                        </td>
                        <td
                          className={`p-3 text-right font-bold ${
                            item.change24hPct >= 0
                              ? "text-emerald-400"
                              : "text-rose-400"
                          }`}
                        >
                          {item.change24hPct >= 0 ? "+" : ""}
                          {item.change24hPct.toFixed(2)}%
                        </td>
                        <td className="p-3 text-right text-slate-300">
                          {formatCurrency(item.turnoverUsdt)}
                        </td>
                        <td className="p-3 text-right text-slate-300">
                          {(item.spreadPct * 100).toFixed(3)}%
                        </td>
                        <td className="p-3 text-right text-slate-300">
                          {item.atr15m.toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-bold text-amber-400">
                          {item.volumeRatio.toFixed(2)}x
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              item.costTier === "LOW"
                                ? "bg-emerald-500/10 text-emerald-400"
                                : item.costTier === "MEDIUM"
                                ? "bg-amber-500/10 text-amber-400"
                                : "bg-rose-500/10 text-rose-400"
                            }`}
                          >
                            {item.costTier}
                          </span>
                        </td>
                        <td className="p-3 text-right font-bold text-blue-400">
                          {item.routerConfidencePct}%
                        </td>
                        <td className="p-3 text-center text-slate-400 text-[11px] font-sans">
                          {item.signalCandleTime
                            ? new Date(item.signalCandleTime).toLocaleTimeString()
                            : "MISSING"}
                        </td>
                        <td className="p-3 text-center">
                          {renderReadinessBadge(item)}
                        </td>
                        <td className="p-3 text-center text-slate-500">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </td>
                      </tr>

                      {/* Expandable Details Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-950/80">
                          <td colSpan={13} className="p-4 font-sans border-b border-slate-800">
                            <div className="space-y-4 text-xs">
                              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                <span className="font-bold text-slate-200 text-sm flex items-center gap-2">
                                  <Layers className="w-4 h-4 text-blue-400" />
                                  {item.symbol} Engine Votes & Truth Breakdown
                                </span>
                                <span className="text-slate-400 text-[11px] font-mono">
                                  Raw Candle Timestamp: {item.signalCandleTime ?? "null"}
                                </span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Strategy Engine Votes */}
                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
                                  <div className="font-semibold text-slate-300 text-xs flex items-center justify-between">
                                    <span>Strategy Engine Votes</span>
                                    <span className="text-[10px] text-slate-400">{item.strategyVotes.length} Active Engines</span>
                                  </div>
                                  <div className="space-y-1.5">
                                    {item.strategyVotes.map((vote, idx) => (
                                      <div
                                        key={idx}
                                        className="bg-slate-800/60 p-2 rounded border border-slate-700/50 flex items-center justify-between gap-2"
                                      >
                                        <div>
                                          <div className="font-bold text-slate-200">{vote.engineName}</div>
                                          <div className="text-[11px] text-slate-400">{vote.voteReason}</div>
                                        </div>
                                        <div className="text-right flex items-center gap-2">
                                          <span className="font-mono text-slate-300 font-bold">{vote.voteStrengthPct}%</span>
                                          {renderSignalBadge(vote.voteSignal)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {/* Indicator & Pipeline Verification */}
                                <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-3">
                                  <div>
                                    <div className="font-semibold text-slate-300 text-xs mb-1.5">Indicator Status Matrix</div>
                                    <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                                      <div className="bg-slate-800/60 p-1.5 rounded border border-slate-700/50">
                                        <span className="text-slate-400 text-[9px] block">1H Trend</span>
                                        <span className="font-bold text-slate-200">{item.indicators.trend1h}</span>
                                      </div>
                                      <div className="bg-slate-800/60 p-1.5 rounded border border-slate-700/50">
                                        <span className="text-slate-400 text-[9px] block">RSI 15m</span>
                                        <span className="font-bold text-slate-200">{item.indicators.rsi15m}</span>
                                      </div>
                                      <div className="bg-slate-800/60 p-1.5 rounded border border-slate-700/50">
                                        <span className="text-slate-400 text-[9px] block">RSI 5m</span>
                                        <span className="font-bold text-slate-200">{item.indicators.rsi5m}</span>
                                      </div>
                                      <div className="bg-slate-800/60 p-1.5 rounded border border-slate-700/50">
                                        <span className="text-slate-400 text-[9px] block">EMA 20 1H</span>
                                        <span className="font-bold text-slate-200">{item.indicators.ema20_1h}</span>
                                      </div>
                                      <div className="bg-slate-800/60 p-1.5 rounded border border-slate-700/50">
                                        <span className="text-slate-400 text-[9px] block">EMA 50 1H</span>
                                        <span className="font-bold text-slate-200">{item.indicators.ema50_1h}</span>
                                      </div>
                                      <div className="bg-slate-800/60 p-1.5 rounded border border-slate-700/50">
                                        <span className="text-slate-400 text-[9px] block">Timeframe</span>
                                        <span className="font-bold text-amber-400">{item.indicators.entryTimeframe}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div>
                                    <div className="font-semibold text-slate-300 text-xs mb-1.5">Pipeline Status Checkpoints</div>
                                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                                      <div className="flex items-center justify-between bg-slate-800/40 px-2 py-1 rounded">
                                        <span className="text-slate-400">Market Data:</span>
                                        <span className="font-mono text-emerald-400">{item.pipelineStatuses.marketDataStatus}</span>
                                      </div>
                                      <div className="flex items-center justify-between bg-slate-800/40 px-2 py-1 rounded">
                                        <span className="text-slate-400">Indicators:</span>
                                        <span className="font-mono text-blue-400">{item.pipelineStatuses.indicatorStatus}</span>
                                      </div>
                                      <div className="flex items-center justify-between bg-slate-800/40 px-2 py-1 rounded">
                                        <span className="text-slate-400">Strategy Consensus:</span>
                                        <span className="font-mono text-amber-400">{item.pipelineStatuses.strategyStatus}</span>
                                      </div>
                                      <div className="flex items-center justify-between bg-slate-800/40 px-2 py-1 rounded">
                                        <span className="text-slate-400">Risk Status:</span>
                                        <span className="font-mono text-purple-400">{item.pipelineStatuses.riskStatus}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
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
    </div>
  );
};
