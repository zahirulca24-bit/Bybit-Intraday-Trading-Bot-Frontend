import React from "react";
import { Layers, TrendingUp, TrendingDown, LockKeyhole } from "lucide-react";
import { Position } from "../types";

interface OpenPositionsTableProps {
  positions: Position[];
  onClosePosition: (id: string) => Promise<void>;
  onUpdateSLTP: (id: string, sl?: number, tp?: number) => Promise<void>;
  loading?: boolean;
}

export const OpenPositionsTable: React.FC<OpenPositionsTableProps> = ({
  positions,
  loading = false,
}) => {
  return (
    <div className="bg-[#121621] border border-slate-800 rounded-lg overflow-hidden shadow-lg flex flex-col font-mono text-xs">
      <div className="bg-[#181d29] border-b border-slate-800 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-emerald-400" />
          <h2 className="font-bold text-sm text-slate-100 tracking-wide">
            ACTIVE INTRADAY POSITIONS ({positions.length})
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
            Bybit V5 Unified Trading Demo
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
            <LockKeyhole size={11} /> Backend-managed controls
          </span>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-slate-800 bg-amber-500/5 text-[10px] text-amber-200">
        Position data is live. Manual Close and SL/TP editing remain disabled until verified single-position endpoints are available in the Cloud Run backend.
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#141824] border-b border-slate-800 text-[11px] text-slate-400 uppercase font-semibold">
              <th className="px-3 py-2">Symbol / Side</th>
              <th className="px-3 py-2">Size / Notional</th>
              <th className="px-3 py-2">Entry Price</th>
              <th className="px-3 py-2">Mark Price</th>
              <th className="px-3 py-2">Liq. Price</th>
              <th className="px-3 py-2">Margin</th>
              <th className="px-3 py-2">Floating P&amp;L</th>
              <th className="px-3 py-2">SL / TP</th>
              <th className="px-3 py-2 text-right">Control</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {loading ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  <div className="inline-flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    <span>Loading Open Positions...</span>
                  </div>
                </td>
              </tr>
            ) : positions.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-1">
                    <Layers size={24} className="text-slate-600 mb-1" />
                    <span className="font-semibold text-slate-400">No Open Positions</span>
                    <span className="text-[11px] text-slate-500">
                      The Cloud Run backend currently reports a flat Bybit Demo account.
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              positions.map((pos) => {
                const isPositive = pos.floatingPnL >= 0;
                return (
                  <tr key={pos.id} className="hover:bg-[#181e2b] transition-colors text-slate-200 text-xs">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white text-sm">{pos.symbol}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            pos.side === "LONG"
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {pos.side} {pos.leverage}x
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-100">{pos.size} {pos.symbol.replace("USDT", "")}</div>
                      <div className="text-[10px] text-slate-400">${pos.notionalUsdt.toLocaleString()} USDT</div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-300">${pos.entryPrice.toLocaleString()}</td>
                    <td className="px-3 py-2.5 font-bold text-cyan-300">${pos.markPrice.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-amber-400 text-[11px]">${pos.liquidationPrice.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-slate-300">${pos.marginUsdt.toFixed(2)}</td>
                    <td className="px-3 py-2.5">
                      <div className={`font-bold flex items-center gap-1 ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                        {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                        <span>{isPositive ? "+" : ""}${pos.floatingPnL.toFixed(2)}</span>
                      </div>
                      <div className={`text-[10px] font-semibold ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                        ({isPositive ? "+" : ""}{pos.pnlPercent.toFixed(2)}%)
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[11px]">
                      <div className="text-rose-400">SL: ${pos.stopLoss || "--"}</div>
                      <div className="text-emerald-400">TP: ${pos.takeProfit || "--"}</div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        disabled
                        className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/60 border border-slate-700 text-slate-500 cursor-not-allowed text-[10px]"
                        title="Cloud Run backend does not expose a verified single-position mutation endpoint yet"
                      >
                        <LockKeyhole size={11} /> Read only
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
