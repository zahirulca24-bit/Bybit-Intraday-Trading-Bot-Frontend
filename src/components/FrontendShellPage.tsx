import React from "react";
import { TabId } from "./Sidebar";
import {
  BarChart3,
  RotateCcw,
  ShieldAlert,
  Sliders,
  ShieldCheck,
  Lock,
  Server,
  Info,
} from "lucide-react";

interface FrontendShellPageProps {
  tabId: TabId;
}

const PAGE_CONFIG: Record<
  TabId,
  {
    title: string;
    subtitle: string;
    icon: React.ElementType;
    requiredBackendEndpoints: string[];
    description: string;
  }
> = {
  "strategy-analytics": {
    title: "Strategy Analytics",
    subtitle: "Quant performance metrics, win rates, Sharpe ratio, and expectancy analysis",
    icon: BarChart3,
    requiredBackendEndpoints: [
      "GET /api/analytics/summary",
      "GET /api/analytics/winrate-breakdown",
      "GET /api/analytics/drawdown-curve",
    ],
    description:
      "This module calculates risk-adjusted performance metrics across active strategy engines. It requires backend quantitative aggregation endpoints.",
  },
  "historical-replay": {
    title: "Historical Replay & Backtesting",
    subtitle: "Candle-by-candle tick simulation and strategy validation against past market regimes",
    icon: RotateCcw,
    requiredBackendEndpoints: [
      "GET /api/replay/sessions",
      "POST /api/replay/start",
      "POST /api/replay/step",
    ],
    description:
      "This module allows step-by-step market execution replay. It requires backend tick persistence and simulation engine endpoints.",
  },
  "risk-controls": {
    title: "Risk & Controls Management",
    subtitle: "Safety guards configuration, circuit breakers, max daily drawdown, and position limits",
    icon: ShieldAlert,
    requiredBackendEndpoints: [
      "GET /api/risk/rules",
      "POST /api/risk/update-limits",
      "POST /api/risk/kill-switch",
    ],
    description:
      "This module governs risk parameter limits and global panic circuit breakers. It requires backend risk manager endpoints.",
  },
  "settings-health": {
    title: "Settings & System Health",
    subtitle: "Exchange API keys, WebSocket telemetry, memory usage, and environment diagnostics",
    icon: Sliders,
    requiredBackendEndpoints: [
      "GET /api/health/diagnostics",
      "GET /api/system/metrics",
      "POST /api/settings/exchange-keys",
    ],
    description:
      "This module monitors system telemetry, WebSocket latency, and exchange API credentials. It requires backend system health endpoints.",
  },
  dashboard: { title: "Dashboard", subtitle: "", icon: Info, requiredBackendEndpoints: [], description: "" },
  scanner: { title: "Scanner", subtitle: "", icon: Info, requiredBackendEndpoints: [], description: "" },
  "active-trades": { title: "Active Trades", subtitle: "", icon: Info, requiredBackendEndpoints: [], description: "" },
  journal: { title: "Journal", subtitle: "", icon: Info, requiredBackendEndpoints: [], description: "" },
};

export const FrontendShellPage: React.FC<FrontendShellPageProps> = ({ tabId }) => {
  const config = PAGE_CONFIG[tabId];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto text-slate-200 py-4" id={`shell-page-${tabId}`}>
      {/* 1. Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-400">
            <Icon className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-slate-100">{config.title}</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Truthful Frontend Shell
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">{config.subtitle}</p>
          </div>
        </div>
      </div>

      {/* 2. Clear Not Available Notice */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center max-w-2xl mx-auto shadow-2xl space-y-4">
        <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
          <Lock className="w-6 h-6 text-amber-400" />
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-100">Not yet available from backend</h3>
          <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
            {config.description} No mock data or fake action buttons are generated for this view.
          </p>
        </div>

        {/* Required Endpoints Checklist */}
        <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-left font-mono text-xs space-y-2">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 font-sans">
            <Server className="w-3.5 h-3.5 text-blue-400" />
            Required Backend API Endpoints:
          </div>
          <ul className="space-y-1">
            {config.requiredBackendEndpoints.map((endpoint, idx) => (
              <li key={idx} className="text-slate-300 flex items-center gap-2 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                <span>{endpoint}</span>
                <span className="text-[10px] text-slate-500">(Pending)</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="pt-2 text-[11px] text-slate-500 font-mono">
          Bybit Demo API • Operational Scope Constraint Applied
        </div>
      </div>
    </div>
  );
};
