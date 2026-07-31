import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Lock,
  Radio,
  RotateCw,
  Server,
  Settings,
  XCircle,
} from "lucide-react";

import { BotStatusResponse, ScannerPolicy } from "../types";
import { getOperatorSession, loginOperator, logoutOperator } from "../services/operatorSession";

interface SettingsAndHealthViewProps {
  status: BotStatusResponse | null;
  policy?: ScannerPolicy | null;
  onRefresh: () => void;
}

function textValue(value: unknown, fallback = "N/A"): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
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

export const SettingsAndHealthView: React.FC<SettingsAndHealthViewProps> = ({ status, policy, onRefresh }) => {
  const [tokenInput, setTokenInput] = useState("");
  const [sessionAuthenticated, setSessionAuthenticated] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    try {
      setSessionAuthenticated(await getOperatorSession());
      setAuthError(null);
    } catch (error: any) {
      setSessionAuthenticated(false);
      setAuthError(error?.message || "Unable to verify operator session.");
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = tokenInput.trim();
    if (!token) {
      setAuthError("Operator control token is required.");
      return;
    }

    setAuthBusy(true);
    try {
      await loginOperator(token);
      setTokenInput("");
      await refreshSession();
      onRefresh();
    } catch (error: any) {
      setSessionAuthenticated(false);
      setAuthError(error?.message || "Operator authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = async () => {
    setAuthBusy(true);
    try {
      await logoutOperator();
      setSessionAuthenticated(false);
      setTokenInput("");
      setAuthError(null);
    } catch (error: any) {
      setAuthError(error?.message || "Unable to end operator session.");
    } finally {
      setAuthBusy(false);
    }
  };

  const degraded = Boolean(status?.stateDegraded ?? status?.durableState === "DEGRADED");
  const durableBackend = textValue(status?.durableBackend, degraded ? "unknown" : "persistent").toLowerCase();
  const isPostgres = durableBackend === "postgresql" || durableBackend === "postgres";
  const durableLabel = status?.durableState || (degraded ? "DEGRADED" : "PERSISTENT");
  const executionReadiness = textValue(
    status?.executionReadinessStatus,
    status?.automaticExecutionAllowed ? "ready" : "blocked",
  );
  const startupReconciliation = textValue(status?.startupReconciliationStatus, "unknown");
  const bffConfigured = status?.authConfigured === true;

  return (
    <div className="space-y-6 max-w-[1700px] mx-auto text-slate-200" id="settings-health-container">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Settings className="w-5 h-5 text-cyan-400" />
            Settings & Runtime Health
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Browser requests use the same-origin Vercel BFF. Cloud Run credentials remain server-side.
          </p>
        </div>
        <button
          onClick={() => {
            onRefresh();
            void refreshSession();
          }}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
        >
          <RotateCw className="w-3.5 h-3.5 text-cyan-400" />
          Poll Health State
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
            <Server className="w-4 h-4 text-blue-400" />
            Runtime Status
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <ValueTile label="Trading Environment" value={status?.bybitMode || "BYBIT_DEMO"} />
            <ValueTile label="Backend Gateway" value={status?.backendConnected ? "CONNECTED" : "OFFLINE"} tone={status?.backendConnected ? "good" : "bad"} />
            <ValueTile label="Engine Status" value={status?.isRunning ? "RUNNING" : "STOPPED"} tone={status?.isRunning ? "good" : "warn"} />
            <ValueTile label="API Latency" value={`${status?.apiLatencyMs || 0} ms`} tone="info" />
            <ValueTile label="Router Mode" value={status?.routerMode || "balanced"} wide />
            <ValueTile label="BFF Upstream Authentication" value={bffConfigured ? "CONFIGURED" : "MISSING"} tone={bffConfigured ? "good" : "bad"} />
            <ValueTile label="Operator Session" value={sessionAuthenticated ? "AUTHENTICATED" : "UNAUTHENTICATED"} tone={sessionAuthenticated ? "good" : "warn"} />
            <ValueTile label="Frontend BFF Origin" value={window.location.origin} wide />
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
            <Database className="w-4 h-4 text-purple-400" />
            Durable State
          </h3>
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <ValueTile label="Durable State" value={durableLabel} tone={degraded ? "warn" : "good"} />
            <ValueTile label="Storage Backend" value={isPostgres ? "POSTGRESQL" : durableBackend.toUpperCase()} tone={isPostgres ? "good" : "warn"} />
            <ValueTile label="Restart Safe" value={status?.restartSafe ? "YES" : "NO"} tone={status?.restartSafe ? "good" : "warn"} />
            <ValueTile label="State Degraded" value={degraded ? "YES" : "NO"} tone={degraded ? "bad" : "good"} />
            <ValueTile label="Startup Reconciliation" value={startupReconciliation.toUpperCase()} tone={startupReconciliation.toLowerCase() === "ready" ? "good" : "warn"} />
            <ValueTile label="Execution Readiness" value={executionReadiness.toUpperCase()} tone={executionReadiness.toLowerCase() === "ready" ? "good" : "warn"} />
            <ValueTile label="Migration Version" value={`${textValue(status?.migrationVersion, "?")} / required ${textValue(status?.requiredMigrationVersion, "?")}`} wide />
          </div>
          {degraded ? (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-300 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span className="text-xs">Backend durable state is degraded. Execution must remain blocked.</span>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span className="text-xs">Backend reports restart-safe persistent state.</span>
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
            <Radio className="w-4 h-4 text-emerald-400" />
            Scanner Policy & Parameters
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs font-mono">
            <ValueTile label="Shortlist Size" value={`${policy?.shortlistSize || 30} pairs`} />
            <ValueTile label="Deep Scan Size" value={`${policy?.deepScanSize || 10} pairs`} />
            <ValueTile label="Normal Spread" value={`${policy?.normalSpreadThresholdPct ?? 0.03}%`} tone="good" />
            <ValueTile label="Max Spread" value={`${policy?.maxSpreadThresholdPct ?? 0.14}%`} tone="warn" />
            <ValueTile label="Minimum Turnover" value={`$${(policy?.minTurnoverUsdt || 1_500_000).toLocaleString("en-US")}`} />
            <ValueTile label="Preferred Net RR" value={policy?.preferredNetRR ?? 2.2} />
          </div>
        </section>

        <section className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              Operator Authentication
            </h3>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${sessionAuthenticated ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"}`}>
              {sessionAuthenticated ? "AUTHENTICATED" : "UNAUTHENTICATED"}
            </span>
          </div>

          <p className="text-xs text-slate-400">
            The control token is submitted once to the server and exchanged for an HttpOnly session cookie. It is never stored in localStorage.
          </p>

          {!sessionAuthenticated ? (
            <form onSubmit={handleLogin} className="space-y-3">
              <input
                type="password"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                autoComplete="off"
                placeholder="Enter FRONTEND_CONTROL_TOKEN"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={authBusy}
                className="w-full px-3 py-2 rounded-lg bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-slate-950 font-bold text-sm"
              >
                {authBusy ? "Authenticating…" : "Authenticate Operator"}
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={handleLogout}
              disabled={authBusy}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-sm font-semibold"
            >
              {authBusy ? "Ending session…" : "End Operator Session"}
            </button>
          )}

          {authError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-300 flex items-start gap-2">
              <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="text-xs">{authError}</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
