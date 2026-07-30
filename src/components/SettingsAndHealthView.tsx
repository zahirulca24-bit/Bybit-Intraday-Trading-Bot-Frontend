import React, { useState, useEffect } from "react";
import { BotStatusResponse, ScannerPolicy } from "../types";
import {
  Settings,
  Server,
  Database,
  Lock,
  Eye,
  EyeOff,
  RotateCw,
  Key,
  Radio,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface SettingsAndHealthViewProps {
  status: BotStatusResponse | null;
  policy?: ScannerPolicy | null;
  onRefresh: () => void;
  onUpdateConfig?: (config: { apiKey?: string; apiSecret?: string }) => Promise<void>;
}

function textValue(value: unknown, fallback = "N/A"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function yesNo(value: boolean | undefined, fallback = false): string {
  return value ?? fallback ? "YES" : "NO";
}

const ValueTile: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "info";
  wide?: boolean;
}> = ({ label, value, tone = "default", wide }) => {
  const toneClass = {
    default: "text-slate-200",
    good: "text-emerald-400",
    warn: "text-amber-400",
    bad: "text-rose-400",
    info: "text-cyan-400",
  }[tone];

  return (
    <div className={`bg-slate-950 p-3 rounded-lg border border-slate-800 ${wide ? "col-span-2" : ""}`}>
      <span className="text-slate-500 text-[10px] block font-sans">{label}</span>
      <span className={`font-bold break-words ${toneClass}`}>{value}</span>
    </div>
  );
};

const StatusPill: React.FC<{ label: string; degraded: boolean }> = ({ label, degraded }) => (
  <span
    className={`px-2 py-0.5 rounded text-[10px] font-mono ${
      degraded
        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
        : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
    }`}
  >
    {label}
  </span>
);

export const SettingsAndHealthView: React.FC<SettingsAndHealthViewProps> = ({
  status,
  policy,
  onRefresh,
}) => {
  const [tokenInput, setTokenInput] = useState<string>("");
  const [showToken, setShowToken] = useState<boolean>(false);
  const [tokenSaved, setTokenSaved] = useState<boolean>(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    Boolean(localStorage.getItem("admin_token"))
  );

  useEffect(() => {
    setIsAuthenticated(Boolean(localStorage.getItem("admin_token")));
  }, []);

  const handleSaveToken = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setTokenError("Admin token cannot be empty.");
      return;
    }
    if (tokenInput.length < 8) {
      setTokenError("Admin token must be at least 8 characters in length.");
      return;
    }
    localStorage.setItem("admin_token", tokenInput.trim());
    setIsAuthenticated(true);
    setTokenSaved(true);
    setTokenInput("");
    setTokenError(null);
    setTimeout(() => setTokenSaved(false), 3000);
  };

  const handleClearToken = () => {
    localStorage.removeItem("admin_token");
    setIsAuthenticated(false);
    setTokenInput("");
    setTokenSaved(false);
  };

  const degraded = Boolean(status?.stateDegraded ?? status?.durableState === "DEGRADED");
  const backend = textValue(status?.durableBackend, degraded ? "local-fallback" : "persistent").toLowerCase();
  const isPostgres = backend === "postgresql" || backend === "postgres";
  const durableLabel = status?.durableState || (degraded ? "DEGRADED" : "PERSISTENT");
  const databasePath = status?.databasePath || (isPostgres ? "PostgreSQL / DATABASE_URL" : degraded ? "Memory / LocalStorage Fallback" : "Persistent backend");
  const journalStatus = status?.journalPersistenceStatus || (isPostgres && !degraded ? "POSTGRESQL" : degraded ? "LOCAL FALLBACK" : "ACTIVE");
  const restartSurvival = status?.restartSafe ? "DURABLE" : degraded ? "VOLATILE" : "SURVIVES RESTART";
  const executionReadiness = textValue(status?.executionReadinessStatus, status?.automaticExecutionAllowed ? "ready" : "blocked");
  const startupReconciliation = textValue(status?.startupReconciliationStatus, "unknown");
  const executionReady = ["ready", "ok", "healthy"].includes(executionReadiness.toLowerCase());

  return (
    <div className="space-y-6 max-w-[1700px] mx-auto text-slate-200" id="settings-health-container">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Settings className="w-5 h-5 text-cyan-400" />
              Settings & Runtime Health
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              Bybit Demo API
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-3">
            <span>
              Engine: <strong className={status?.isRunning ? "text-emerald-400 font-mono" : "text-amber-400 font-mono"}>{status?.isRunning ? "Engine Running" : "Engine Stopped"}</strong>
            </span>
            <span>•</span>
            <span>
              Durable State: <strong className={degraded ? "text-amber-400 font-mono" : "text-emerald-400 font-mono"}>{durableLabel}</strong>
            </span>
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shadow transition-all cursor-pointer"
          id="refresh-health-btn"
        >
          <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
          Poll Health State
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-400" />
              Runtime Status
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-300 border border-blue-500/20">
              LIVE METRICS
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <ValueTile label="Trading Environment" value={status?.bybitMode || "BYBIT_DEMO"} />
            <ValueTile label="Backend Gateway" value={status?.backendConnected ? "CONNECTED" : "OFFLINE"} tone={status?.backendConnected ? "good" : "bad"} />
            <ValueTile label="Engine Status" value={status?.isRunning ? "Engine Running" : "Engine Stopped"} tone={status?.isRunning ? "good" : "warn"} />
            <ValueTile label="API Latency" value={`${status?.apiLatencyMs || 0} ms`} tone="warn" />
            <ValueTile label="Current Router Mode" value={status?.routerMode || "balanced"} wide />
            <ValueTile label="Next Scan Countdown" value={`${status?.nextScanSeconds || 30}s`} tone="info" />
            <ValueTile label="Scan Interval" value={`${policy?.refreshIntervalSec || 30}s`} />
            <ValueTile label="Universe Refresh Interval" value="300s" />
            <ValueTile label="Authentication Status" value={status?.authConfigured ? "AUTHENTICATED" : "UNAUTHENTICATED"} tone={status?.authConfigured ? "good" : "warn"} />
            <ValueTile label="Backend Base URL" value={window.location.origin} wide />
          </div>
        </div>

        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-400" />
              Durable State & Journal Persistence
            </h3>
            <StatusPill label={durableLabel} degraded={degraded} />
          </div>

          <div className="space-y-3 text-xs font-mono">
            <div className="grid grid-cols-2 gap-3">
              <ValueTile label="Persistent Storage Configured" value={yesNo(status?.persistentPathConfigured, !degraded)} tone={status?.persistentPathConfigured || !degraded ? "good" : "warn"} />
              <ValueTile label="State Degraded" value={degraded ? "YES" : "NO"} tone={degraded ? "warn" : "good"} />
              <ValueTile label="Storage Backend" value={isPostgres ? "PostgreSQL" : textValue(status?.durableBackend, "Local fallback")} tone={isPostgres && !degraded ? "good" : degraded ? "warn" : "default"} />
              <ValueTile label="Automatic Execution Allowed" value={yesNo(status?.automaticExecutionAllowed, false)} tone={status?.automaticExecutionAllowed ? "good" : "warn"} />
              <ValueTile label="Current Database Path" value={databasePath} wide />
              <ValueTile label="Journal Persistence Status" value={journalStatus} tone={!degraded ? "good" : "warn"} />
              <ValueTile label="Restart Survival Status" value={restartSurvival} tone={status?.restartSafe ? "good" : degraded ? "warn" : "default"} />
              <ValueTile label="Startup Reconciliation" value={startupReconciliation.toUpperCase()} tone={startupReconciliation.toLowerCase() === "ready" ? "good" : "warn"} />
              <ValueTile label="Execution Readiness" value={executionReadiness.toUpperCase()} tone={executionReady ? "good" : "warn"} />
              <ValueTile label="Migration Version" value={`${textValue(status?.migrationVersion, "?")} / required ${textValue(status?.requiredMigrationVersion, "?")}`} wide />
            </div>

            {degraded && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-300 flex items-start gap-2.5 font-sans">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-xs mb-0.5">Durable State Degraded Warning</div>
                  <p className="text-xs leading-relaxed">
                    State and journal data may be lost after restart or redeploy. Backend error: {textValue(status?.durableError, "not reported")}
                  </p>
                </div>
              </div>
            )}

            {!degraded && isPostgres && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 flex items-start gap-2.5 font-sans">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-xs mb-0.5">PostgreSQL Durable State Active</div>
                  <p className="text-xs leading-relaxed">
                    Backend reports restart-safe PostgreSQL persistence. Journal, claims, risk state, reconciliation, and execution readiness are now sourced from backend truth.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              Scanner Policy & Parameters
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
              READ-ONLY API VALUES
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs font-mono">
            <ValueTile label="Shortlist Size" value={`${policy?.shortlistSize || 30} pairs`} />
            <ValueTile label="Deep Scan Size" value={`${policy?.deepScanSize || 10} pairs`} />
            <ValueTile label="Normal Spread Threshold" value={`${policy?.normalSpreadThresholdPct ?? 0.03}%`} tone="good" />
            <ValueTile label="Reduced Spread Threshold" value={`${policy?.reducedSizeSpreadThresholdPct ?? 0.05}%`} tone="warn" />
            <ValueTile label="Max Spread Threshold" value={`${policy?.maxSpreadThresholdPct ?? 0.14}%`} tone="bad" />
            <ValueTile label="Minimum 24h Turnover" value={`$${(policy?.minTurnoverUsdt || 1_500_000).toLocaleString("en-US")} USDT`} />
            <ValueTile label="Min Net RR" value={policy?.minNetRR ?? 1.5} />
            <ValueTile label="Preferred Net RR" value={policy?.preferredNetRR ?? 2.2} />
            <ValueTile label="Cost/Risk Limit" value={`${policy?.normalCostToRiskLimitPct ?? 5}% / ${policy?.maxCostToRiskLimitPct ?? 10}%`} />
          </div>
        </div>

        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              Security & Operator Authentication
            </h3>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${isAuthenticated ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"}`}>
              {isAuthenticated ? "AUTHENTICATED" : "UNAUTHENTICATED"}
            </span>
          </div>

          <form onSubmit={handleSaveToken} className="space-y-3">
            <label className="text-xs text-slate-400 font-semibold" htmlFor="admin-token-input">Admin Security Token</label>
            <div className="relative">
              <input
                id="admin-token-input"
                type={showToken ? "text" : "password"}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 pr-10 text-sm text-slate-100 outline-none focus:border-cyan-500"
                placeholder="Enter backend admin token"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                aria-label="Toggle token visibility"
              >
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {tokenError && <p className="text-xs text-rose-400 flex items-center gap-1"><XCircle size={13} />{tokenError}</p>}
            {tokenSaved && <p className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 size={13} />Admin token saved in this browser.</p>}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">{isAuthenticated ? "Token stored in browser localStorage" : "Unauthenticated mode"}</span>
              <div className="flex gap-2">
                {isAuthenticated && (
                  <button type="button" onClick={handleClearToken} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700">
                    Clear
                  </button>
                )}
                <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-500 text-white hover:bg-orange-400 flex items-center gap-1">
                  <Key size={13} />
                  Set Admin Token
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
