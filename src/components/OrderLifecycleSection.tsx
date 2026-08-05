import React, { useMemo, useState } from "react";
import { Info, Zap } from "lucide-react";
import { OrderLifecycle } from "../types";
import { StatusBadge } from "./StatusBadges";

interface OrderLifecycleSectionProps {
  lifecycles: OrderLifecycle[];
  loading?: boolean;
}

const available = (value: unknown): boolean => value !== null && value !== undefined && value !== "";
const textValue = (value: unknown, suffix = ""): string => available(value) ? `${String(value)}${suffix}` : "UNAVAILABLE";
const moneyValue = (value: unknown): string => available(value) ? `$${String(value)} USDT` : "UNAVAILABLE";

export const OrderLifecycleSection: React.FC<OrderLifecycleSectionProps> = ({ lifecycles, loading = false }) => {
  const [filter, setFilter] = useState("ALL");
  const rows = useMemo(
    () => filter === "ALL" ? lifecycles : lifecycles.filter((item) => item.finalStatus === filter),
    [filter, lifecycles],
  );
  const filters = ["ALL", "PASS", "WAIT", "BLOCKED", "ERROR", "DEGRADED"];

  return (
    <section className="bg-[#121621] border border-slate-800 rounded-lg overflow-hidden shadow-lg font-mono text-xs">
      <header className="bg-[#181d29] border-b border-slate-800 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-cyan-400" />
          <h2 className="font-bold text-sm text-slate-100 tracking-wide">INTRADAY ORDER LIFECYCLE PIPELINE</h2>
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">Backend canonical truth</span>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {filters.map((value) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-2 py-1 rounded border ${filter === value ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-slate-800 text-slate-400"}`}
            >
              {value} ({value === "ALL" ? lifecycles.length : lifecycles.filter((row) => row.finalStatus === value).length})
            </button>
          ))}
        </div>
      </header>

      <div className="p-3 space-y-3 max-h-[560px] overflow-y-auto">
        {loading ? (
          <div className="py-8 text-center text-slate-500">Syncing canonical lifecycle evidence…</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-slate-500 flex flex-col items-center gap-2">
            <Info size={24} />
            <span>No verified lifecycle evidence matches this filter.</span>
          </div>
        ) : rows.map((item) => {
          const row = item as OrderLifecycle & { evidenceComplete?: boolean };
          const evidenceComplete = row.evidenceComplete === true;
          return (
            <article key={item.id} className="rounded-lg border border-slate-800 bg-[#0f131d] p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">{textValue(item.symbol)}</span>
                  <span className="text-slate-400">{item.side}</span>
                  <span className="text-slate-500">{textValue(item.order?.leverage, "x")}</span>
                  <span className="text-slate-500">{textValue(item.timeframe)}</span>
                </div>
                <StatusBadge status={item.finalStatus} size="sm" />
              </div>

              {!evidenceComplete && (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-300">
                  Complete backend execution evidence is unavailable. This row is not proof of an exchange order or successful execution.
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <TruthCell label="Entry price" value={moneyValue(item.signal?.price)} />
                <TruthCell label="Notional" value={moneyValue(item.order?.sizeUsdt)} />
                <TruthCell label="Stop loss" value={moneyValue(item.protection?.stopLoss)} />
                <TruthCell label="Take profit" value={moneyValue(item.protection?.takeProfit)} />
                <TruthCell label="Order type" value={textValue(item.order?.type)} />
              </div>

              <div className="grid md:grid-cols-2 gap-2 text-[11px]">
                <div className="rounded border border-slate-800 p-2">
                  <div className="text-slate-500 uppercase mb-1">Backend reason</div>
                  <div className="text-slate-200">{textValue(item.signal?.condition)}</div>
                </div>
                <div className="rounded border border-slate-800 p-2">
                  <div className="text-slate-500 uppercase mb-1">Evidence verdict</div>
                  <div className={evidenceComplete ? "text-emerald-400" : "text-amber-300"}>
                    {evidenceComplete ? "Complete exchange execution evidence verified" : "WAIT — evidence incomplete"}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

const TruthCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded border border-slate-800 bg-[#121621] p-2">
    <div className="text-[9px] uppercase text-slate-500">{label}</div>
    <div className={value === "UNAVAILABLE" ? "text-amber-300 mt-1" : "text-slate-200 mt-1"}>{value}</div>
  </div>
);
