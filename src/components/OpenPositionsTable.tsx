import React, { useState } from "react";
import {
  Layers,
  XCircle,
  Sliders,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Edit2,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Position } from "../types";

interface OpenPositionsTableProps {
  positions: Position[];
  onClosePosition: (id: string) => Promise<void>;
  onUpdateSLTP: (id: string, sl?: number, tp?: number) => Promise<void>;
  loading?: boolean;
}

export const OpenPositionsTable: React.FC<OpenPositionsTableProps> = ({
  positions,
  onClosePosition,
  onUpdateSLTP,
  loading = false,
}) => {
  const [closingId, setClosingId] = useState<string | null>(null);
  const [editingPos, setEditingPos] = useState<Position | null>(null);
  const [slInput, setSlInput] = useState<string>("");
  const [tpInput, setTpInput] = useState<string>("");
  const [savingSltp, setSavingSltp] = useState<boolean>(false);

  const handleStartEdit = (pos: Position) => {
    setEditingPos(pos);
    setSlInput(pos.stopLoss ? String(pos.stopLoss) : "");
    setTpInput(pos.takeProfit ? String(pos.takeProfit) : "");
  };

  const handleSaveEdit = async () => {
    if (!editingPos) return;
    setSavingSltp(true);
    try {
      await onUpdateSLTP(
        editingPos.id,
        slInput ? Number(slInput) : undefined,
        tpInput ? Number(tpInput) : undefined
      );
      setEditingPos(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingSltp(false);
    }
  };

  const handleClose = async (id: string) => {
    setClosingId(id);
    try {
      await onClosePosition(id);
    } catch (err) {
      console.error(err);
    } finally {
      setClosingId(null);
    }
  };

  return (
    <div className="bg-[#121621] border border-slate-800 rounded-lg overflow-hidden shadow-lg flex flex-col font-mono text-xs">
      {/* Header Bar */}
      <div className="bg-[#181d29] border-b border-slate-800 px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-emerald-400" />
          <h2 className="font-bold text-sm text-slate-100 tracking-wide">
            ACTIVE INTRADAY POSITIONS ({positions.length})
          </h2>
        </div>
        <span className="text-[10px] text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
          Bybit V5 Unified Trading Demo
        </span>
      </div>

      {/* Table Content */}
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
              <th className="px-3 py-2">Floating P&L</th>
              <th className="px-3 py-2">SL / TP</th>
              <th className="px-3 py-2 text-right">Actions</th>
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
                      Bot is scanning markets for intraday momentum & breakout setups.
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              positions.map((pos) => {
                const isPositive = pos.floatingPnL >= 0;

                return (
                  <tr
                    key={pos.id}
                    className="hover:bg-[#181e2b] transition-colors text-slate-200 text-xs"
                  >
                    {/* Symbol / Side */}
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

                    {/* Size / Notional */}
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-100">{pos.size} {pos.symbol.replace("USDT", "")}</div>
                      <div className="text-[10px] text-slate-400">${pos.notionalUsdt.toLocaleString()} USDT</div>
                    </td>

                    {/* Entry Price */}
                    <td className="px-3 py-2.5 font-mono text-slate-300">
                      ${pos.entryPrice.toLocaleString()}
                    </td>

                    {/* Mark Price */}
                    <td className="px-3 py-2.5 font-mono font-bold text-cyan-300">
                      ${pos.markPrice.toLocaleString()}
                    </td>

                    {/* Liq. Price */}
                    <td className="px-3 py-2.5 font-mono text-amber-400 text-[11px]">
                      ${pos.liquidationPrice.toLocaleString()}
                    </td>

                    {/* Margin */}
                    <td className="px-3 py-2.5 font-mono text-slate-300">
                      ${pos.marginUsdt.toFixed(2)}
                    </td>

                    {/* Floating PnL */}
                    <td className="px-3 py-2.5 font-mono">
                      <div
                        className={`font-bold flex items-center gap-1 ${
                          isPositive ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                        <span>
                          {isPositive ? "+" : ""}${pos.floatingPnL.toFixed(2)}
                        </span>
                      </div>
                      <div
                        className={`text-[10px] font-semibold ${
                          isPositive ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        ({isPositive ? "+" : ""}{pos.pnlPercent.toFixed(2)}%)
                      </div>
                    </td>

                    {/* SL / TP */}
                    <td className="px-3 py-2.5 font-mono text-[11px]">
                      <div className="text-rose-400">SL: ${pos.stopLoss || "--"}</div>
                      <div className="text-emerald-400">TP: ${pos.takeProfit || "--"}</div>
                    </td>

                    {/* Action Buttons */}
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Edit SL/TP Button */}
                        <button
                          onClick={() => handleStartEdit(pos)}
                          className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
                          title="Modify Stop Loss & Take Profit"
                        >
                          <Edit2 size={12} />
                          <span>SL/TP</span>
                        </button>

                        {/* One-Click Close Button */}
                        <button
                          onClick={() => handleClose(pos.id)}
                          disabled={closingId === pos.id}
                          className="px-2 py-1 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30 transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-semibold"
                          title="Market Close Position Immediately"
                        >
                          {closingId === pos.id ? (
                            <div className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <XCircle size={12} />
                          )}
                          <span>CLOSE</span>
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

      {/* Edit SL/TP Modal */}
      {editingPos && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#181d29] border border-slate-700 rounded-lg p-4 w-full max-w-md text-slate-200 shadow-2xl font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
              <div className="font-bold text-sm text-white flex items-center gap-2">
                <Sliders size={16} className="text-cyan-400" />
                <span>Adjust SL/TP: {editingPos.symbol} ({editingPos.side})</span>
              </div>
              <button
                onClick={() => setEditingPos(null)}
                className="text-slate-400 hover:text-white text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-[#0f131d] p-2 rounded border border-slate-800 grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-slate-500">Entry Price:</span>{" "}
                  <span className="text-white font-bold">${editingPos.entryPrice}</span>
                </div>
                <div>
                  <span className="text-slate-500">Mark Price:</span>{" "}
                  <span className="text-cyan-400 font-bold">${editingPos.markPrice}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 text-[11px]">
                  Stop Loss Price (USDT):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={slInput}
                  onChange={(e) => setSlInput(e.target.value)}
                  placeholder="e.g. 66500"
                  className="w-full bg-[#0d1017] border border-slate-700 rounded px-2.5 py-1.5 text-rose-300 font-bold focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 text-[11px]">
                  Take Profit Price (USDT):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={tpInput}
                  onChange={(e) => setTpInput(e.target.value)}
                  placeholder="e.g. 68800"
                  className="w-full bg-[#0d1017] border border-slate-700 rounded px-2.5 py-1.5 text-emerald-300 font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  onClick={() => setEditingPos(null)}
                  className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={savingSltp}
                  className="px-4 py-1.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-colors cursor-pointer font-bold flex items-center gap-1.5"
                >
                  {savingSltp ? (
                    <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check size={14} />
                  )}
                  <span>Save Protection</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
