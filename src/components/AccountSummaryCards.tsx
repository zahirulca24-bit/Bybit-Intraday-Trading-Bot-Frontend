import React from "react";
import {
  Wallet,
  Coins,
  TrendingUp,
  TrendingDown,
  Layers,
  ShieldAlert,
  Activity,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { AccountSummary } from "../types";

interface AccountSummaryCardsProps {
  account: AccountSummary | null;
  loading?: boolean;
}

export const AccountSummaryCards: React.FC<AccountSummaryCardsProps> = ({
  account,
  loading = false,
}) => {
  if (loading || !account) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-3 bg-[#0a0d14]">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-lg bg-[#161b26] border border-slate-800 p-3 animate-pulse flex flex-col justify-between"
          >
            <div className="h-3 w-20 bg-slate-800 rounded" />
            <div className="h-6 w-28 bg-slate-800 rounded" />
            <div className="h-2 w-full bg-slate-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const formatUsdt = (val: number) =>
    val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const isPositivePnL = account.floatingPnL >= 0;
  const riskPercent = Math.min(
    100,
    Math.round((account.dailyRiskUsedPercent / account.maxDailyRiskPercent) * 100)
  );

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-3 bg-[#0a0d14]">
      {/* 1. Equity */}
      <div className="rounded-lg bg-[#161b26] border border-slate-800 p-3 flex flex-col justify-between hover:border-slate-700 transition-colors shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono font-medium">TOTAL EQUITY</span>
          <Wallet size={15} className="text-cyan-400" />
        </div>
        <div className="my-1">
          <div className="text-lg md:text-xl font-mono font-bold text-white tracking-tight">
            ${formatUsdt(account.equity)}
          </div>
          <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
            <span className="text-emerald-400 font-semibold">+2.4%</span> 24h gain
          </div>
        </div>
        <div className="w-full bg-slate-800/80 h-1 rounded-full overflow-hidden">
          <div className="bg-cyan-400 h-full w-3/4 rounded-full" />
        </div>
      </div>

      {/* 2. Available Balance */}
      <div className="rounded-lg bg-[#161b26] border border-slate-800 p-3 flex flex-col justify-between hover:border-slate-700 transition-colors shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono font-medium">AVAIL BALANCE</span>
          <Coins size={15} className="text-emerald-400" />
        </div>
        <div className="my-1">
          <div className="text-lg md:text-xl font-mono font-bold text-slate-200 tracking-tight">
            ${formatUsdt(account.availableBalance)}
          </div>
          <div className="text-[10px] font-mono text-slate-400">
            Free Margin for Trades
          </div>
        </div>
        <div className="w-full bg-slate-800/80 h-1 rounded-full overflow-hidden">
          <div
            className="bg-emerald-400 h-full rounded-full"
            style={{ width: `${Math.round((account.availableBalance / account.equity) * 100)}%` }}
          />
        </div>
      </div>

      {/* 3. Floating PnL */}
      <div
        className={`rounded-lg bg-[#161b26] border p-3 flex flex-col justify-between transition-colors shadow-sm ${
          isPositivePnL ? "border-emerald-500/30 bg-emerald-950/10" : "border-rose-500/30 bg-rose-950/10"
        }`}
      >
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono font-medium">FLOATING P&L</span>
          {isPositivePnL ? (
            <TrendingUp size={15} className="text-emerald-400" />
          ) : (
            <TrendingDown size={15} className="text-rose-400" />
          )}
        </div>
        <div className="my-1">
          <div
            className={`text-lg md:text-xl font-mono font-bold tracking-tight ${
              isPositivePnL ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {isPositivePnL ? "+" : ""}
            ${formatUsdt(account.floatingPnL)}
          </div>
          <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
            <span
              className={`font-semibold ${isPositivePnL ? "text-emerald-400" : "text-rose-400"}`}
            >
              ({isPositivePnL ? "+" : ""}
              {account.floatingPnLPercent.toFixed(2)}%)
            </span>
            open ROI
          </div>
        </div>
        <div className="w-full bg-slate-800/80 h-1 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${isPositivePnL ? "bg-emerald-400" : "bg-rose-400"}`}
            style={{ width: `${Math.min(100, Math.abs(account.floatingPnLPercent) * 10)}%` }}
          />
        </div>
      </div>

      {/* 4. Open Trades */}
      <div className="rounded-lg bg-[#161b26] border border-slate-800 p-3 flex flex-col justify-between hover:border-slate-700 transition-colors shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono font-medium">OPEN TRADES</span>
          <Layers size={15} className="text-amber-400" />
        </div>
        <div className="my-1">
          <div className="text-lg md:text-xl font-mono font-bold text-white tracking-tight">
            {account.openTradesCount}{" "}
            <span className="text-xs font-normal text-slate-400">/ {account.maxOpenTrades} Max</span>
          </div>
          <div className="text-[10px] font-mono text-slate-400">
            {account.maxOpenTrades - account.openTradesCount} Slots Available
          </div>
        </div>
        <div className="w-full bg-slate-800/80 h-1 rounded-full overflow-hidden">
          <div
            className="bg-amber-400 h-full rounded-full"
            style={{ width: `${(account.openTradesCount / account.maxOpenTrades) * 100}%` }}
          />
        </div>
      </div>

      {/* 5. Daily Risk Used */}
      <div className="rounded-lg bg-[#161b26] border border-slate-800 p-3 flex flex-col justify-between hover:border-slate-700 transition-colors shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono font-medium">DAILY RISK USED</span>
          <ShieldAlert size={15} className="text-rose-400" />
        </div>
        <div className="my-1">
          <div className="text-lg md:text-xl font-mono font-bold text-white tracking-tight">
            {account.dailyRiskUsedPercent.toFixed(2)}%{" "}
            <span className="text-xs font-normal text-slate-400">/ {account.maxDailyRiskPercent.toFixed(2)}% Limit</span>
          </div>
          <div className="text-[10px] font-mono text-slate-400">
            Drawdown Guard Active
          </div>
        </div>
        <div className="w-full bg-slate-800/80 h-1 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              riskPercent > 70 ? "bg-rose-500" : riskPercent > 40 ? "bg-amber-400" : "bg-emerald-400"
            }`}
            style={{ width: `${riskPercent}%` }}
          />
        </div>
      </div>

      {/* 6. Trades Today */}
      <div className="rounded-lg bg-[#161b26] border border-slate-800 p-3 flex flex-col justify-between hover:border-slate-700 transition-colors shadow-sm">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono font-medium">TRADES TODAY</span>
          <Activity size={15} className="text-purple-400" />
        </div>
        <div className="my-1">
          <div className="text-lg md:text-xl font-mono font-bold text-white tracking-tight flex items-baseline justify-between">
            <span>{account.tradesTodayCount}</span>
            <span className="text-xs font-semibold text-emerald-400">
              {account.winRatePercent.toFixed(0)}% Win
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2">
            <span className="flex items-center gap-0.5 text-emerald-400">
              <CheckCircle2 size={10} /> {account.winsToday}W
            </span>
            <span className="flex items-center gap-0.5 text-rose-400">
              <XCircle size={10} /> {account.lossesToday}L
            </span>
          </div>
        </div>
        <div className="w-full bg-slate-800/80 h-1 rounded-full overflow-hidden">
          <div
            className="bg-purple-400 h-full rounded-full"
            style={{ width: `${account.winRatePercent}%` }}
          />
        </div>
      </div>
    </div>
  );
};
