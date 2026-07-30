import React, { useState, useEffect, useCallback } from "react";
import { Menu, ShieldCheck, Key } from "lucide-react";

import {
  BotStatusResponse,
  AccountSummary,
  Position,
  OrderLifecycle,
  Kline,
  BotLog,
  ScannerDataResponse,
} from "./types";
import { api } from "./services/api";
import { Sidebar, TabId } from "./components/Sidebar";
import { RuntimeStatusBar } from "./components/RuntimeStatusBar";
import { AccountSummaryCards } from "./components/AccountSummaryCards";
import { OrderLifecycleSection } from "./components/OrderLifecycleSection";
import { TradingChart } from "./components/TradingChart";
import { OpenPositionsTable } from "./components/OpenPositionsTable";
import { LogsAndScannerPanel } from "./components/LogsAndScannerPanel";
import { ScannerAndSignalsView } from "./components/ScannerAndSignalsView";
import { WorkerPipelineTruth } from "./components/WorkerPipelineTruth";
import { ActiveTradesView } from "./components/ActiveTradesView";
import { JournalView } from "./components/JournalView";
import { RiskAndControlsView } from "./components/RiskAndControlsView";
import { SettingsAndHealthView } from "./components/SettingsAndHealthView";
import { StrategyAnalyticsView } from "./components/StrategyAnalyticsView";
import { HistoricalReplayView } from "./components/HistoricalReplayView";
import { FrontendShellPage } from "./components/FrontendShellPage";
import { OfflineBanner, ServerErrorAlert, UnauthorizedModal } from "./components/StateViews";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  const [status, setStatus] = useState<BotStatusResponse | null>(null);
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [lifecycles, setLifecycles] = useState<OrderLifecycle[]>([]);
  const [klines, setKlines] = useState<Kline[]>([]);
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [scannerData, setScannerData] = useState<ScannerDataResponse | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("BTCUSDT");
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("5m");
  const [loading, setLoading] = useState<boolean>(true);
  const [scannerLoading, setScannerLoading] = useState<boolean>(false);
  const [isTogglingBot, setIsTogglingBot] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showUnauthorizedModal, setShowUnauthorizedModal] = useState<boolean>(false);

  const loadScannerData = useCallback(async () => {
    setScannerLoading(true);
    try {
      const scanData = await api.getScanner();
      setScannerData(scanData);
    } catch (err) {
      console.error("Scanner fetch error:", err);
    } finally {
      setScannerLoading(false);
    }
  }, []);

  const loadDashboardData = useCallback(async () => {
    try {
      setServerError(null);
      const [st, acc, pos, life, kl, lg, scanData] = await Promise.all([
        api.getStatus(),
        api.getAccount(),
        api.getPositions(),
        api.getOrderLifecycles(),
        api.getKlines(selectedSymbol, selectedTimeframe),
        api.getLogs("ALL"),
        api.getScanner().catch(() => null),
      ]);
      setStatus(st);
      setAccount(acc);
      setPositions(pos);
      setLifecycles(life);
      setKlines(kl);
      setLogs(lg);
      if (scanData) setScannerData(scanData);
      setIsOffline(false);
      if (st.authConfigured === false) setShowUnauthorizedModal(true);
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
      setIsOffline(true);
      setServerError(err?.message || "Failed to sync with Bybit Demo Engine backend.");
    } finally {
      setLoading(false);
    }
  }, [selectedSymbol, selectedTimeframe]);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 3000);
    return () => clearInterval(interval);
  }, [loadDashboardData]);

  const handleToggleBot = async (): Promise<{ isRunning: boolean; reason?: string }> => {
    if (isTogglingBot) {
      throw new Error("A bot state change is already in progress.");
    }
    setIsTogglingBot(true);
    setServerError(null);
    try {
      const mutation = await api.toggleBot();
      const authoritative = await api.getStatus();
      setStatus(authoritative);

      if (authoritative.isRunning !== mutation.isRunning) {
        throw new Error(
          `Bot state verification mismatch: toggle returned ${mutation.isRunning ? "RUNNING" : "STOPPED"}, but backend status reports ${authoritative.isRunning ? "RUNNING" : "STOPPED"}.`,
        );
      }

      void loadDashboardData();
      return {
        isRunning: authoritative.isRunning,
        reason: mutation.reason,
      };
    } catch (err: any) {
      const message = err?.message || "Failed to toggle bot running state.";
      setServerError(message);
      throw new Error(message);
    } finally {
      setIsTogglingBot(false);
    }
  };

  const handleChangeRouterMode = async (mode: string) => {
    try {
      await api.updateConfig({ routerMode: mode });
      if (status) setStatus({ ...status, routerMode: mode });
    } catch (err) {
      console.error(err);
    }
  };

  const handleClosePosition = async (id: string) => {
    await api.closePosition(id);
    await loadDashboardData();
  };

  const handleUpdateSLTP = async (id: string, sl?: number, tp?: number) => {
    await api.updateSLTP(id, sl, tp);
    await loadDashboardData();
  };

  const handleRefreshLogs = async (filterVal: string) => {
    try {
      setLogs(await api.getLogs(filterVal));
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveKeys = async (apiKey: string, apiSecret: string) => {
    await api.updateConfig({ apiKey, apiSecret });
    setShowUnauthorizedModal(false);
    await loadDashboardData();
  };

  const badgeCounts = {
    positionsCount: positions.length,
    signalsCount: scannerData?.signals ? scannerData.signals.length : 0,
    historyCount: lifecycles.length,
    logsCount: logs.length,
  };

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 font-sans antialiased flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        status={status}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        badgeCounts={badgeCounts}
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <div className="md:hidden bg-[#0c101a] border-b border-slate-800 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setIsMobileSidebarOpen(true)} className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white" id="mobile-hamburger-btn">
              <Menu size={20} />
            </button>
            <span className="font-bold text-sm text-slate-100">Bybit Intraday Bot</span>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">BYBIT DEMO</span>
        </div>

        {isOffline && <OfflineBanner onRetry={loadDashboardData} />}
        <RuntimeStatusBar status={status} onToggleBot={handleToggleBot} onRefresh={loadDashboardData} onChangeRouterMode={handleChangeRouterMode} isToggling={isTogglingBot} />
        {serverError && <ServerErrorAlert message={serverError} onRetry={loadDashboardData} />}

        <main className="flex-1 max-w-[1800px] w-full mx-auto p-3 overflow-y-auto">
          {activeTab === "dashboard" && (
            <>
              <AccountSummaryCards account={account} loading={loading} />
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 items-start mt-3">
                <div className="lg:col-span-7 space-y-3">
                  <TradingChart klines={klines} selectedSymbol={selectedSymbol} selectedTimeframe={selectedTimeframe} onSelectSymbol={setSelectedSymbol} onSelectTimeframe={setSelectedTimeframe} positions={positions} loading={loading} />
                  <OpenPositionsTable positions={positions} onClosePosition={handleClosePosition} onUpdateSLTP={handleUpdateSLTP} loading={loading} />
                </div>
                <div className="lg:col-span-5 space-y-3">
                  <OrderLifecycleSection lifecycles={lifecycles} loading={loading} />
                  <LogsAndScannerPanel logs={logs} onRefreshLogs={handleRefreshLogs} loading={loading} />
                </div>
              </div>
            </>
          )}

          {activeTab === "scanner" && (
            <div className="space-y-4">
              <WorkerPipelineTruth />
              <ScannerAndSignalsView
                scannerData={scannerData}
                botStatus={status}
                isLoading={scannerLoading}
                isError={isOffline}
                errorMessage={serverError || undefined}
                onRefresh={loadScannerData}
              />
            </div>
          )}

          {activeTab === "active-trades" && (
            <ActiveTradesView positions={positions} lifecycles={lifecycles} status={status} isLoading={loading} isError={isOffline} errorMessage={serverError || undefined} onRefresh={loadDashboardData} onClosePosition={handleClosePosition} onUpdateSLTP={handleUpdateSLTP} />
          )}

          {activeTab === "journal" && (
            <JournalView logs={logs} status={status} isLoading={loading} isError={isOffline} errorMessage={serverError || undefined} onRefresh={loadDashboardData} />
          )}

          {activeTab === "strategy-analytics" && <StrategyAnalyticsView />}

          {activeTab === "historical-replay" && <HistoricalReplayView />}

          {activeTab === "risk-controls" && (
            <RiskAndControlsView
              status={status}
              account={account}
              positions={positions}
              signals={scannerData?.signals}
              selectedSymbol={selectedSymbol}
              onSelectSymbol={setSelectedSymbol}
              onToggleBot={handleToggleBot}
              onRefresh={loadDashboardData}
            />
          )}

          {activeTab === "settings-health" && (
            <SettingsAndHealthView status={status} policy={scannerData?.policy} onRefresh={loadDashboardData} />
          )}
        </main>

        <footer className="mt-auto border-t border-slate-900 bg-[#0a0d14] py-2 px-4 text-center font-mono text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-amber-400 shrink-0" />
            <span>BYBIT DEMO INTRADAY TRADING BOT • V5 UNIFIED DEMO API</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Server Version: {status?.version || "v2.4.1-demo"}</span>
            <span>•</span>
            <button onClick={() => setShowUnauthorizedModal(true)} className="text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer flex items-center gap-1">
              <Key size={12} />
              <span>Demo API Keys</span>
            </button>
          </div>
        </footer>
      </div>

      {showUnauthorizedModal && <UnauthorizedModal onSaveKeys={handleSaveKeys} onDismiss={() => setShowUnauthorizedModal(false)} />}
    </div>
  );
}