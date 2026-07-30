import React from "react";
import {
  LayoutDashboard,
  Zap,
  Activity,
  BookOpen,
  BarChart3,
  RotateCcw,
  ShieldAlert,
  Sliders,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  X,
} from "lucide-react";
import { BotStatusResponse } from "../types";

export type TabId =
  | "dashboard"
  | "scanner"
  | "active-trades"
  | "journal"
  | "strategy-analytics"
  | "historical-replay"
  | "risk-controls"
  | "settings-health";

export interface SidebarItem {
  id: TabId;
  label: string;
  icon: React.ElementType;
  badgeKey?: "positionsCount" | "signalsCount" | "logsCount";
}

export const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "scanner", label: "Scanner & Signals", icon: Zap, badgeKey: "signalsCount" },
  { id: "active-trades", label: "Active Trades", icon: Activity, badgeKey: "positionsCount" },
  { id: "journal", label: "Journal", icon: BookOpen, badgeKey: "logsCount" },
  { id: "strategy-analytics", label: "Strategy Analytics", icon: BarChart3 },
  { id: "historical-replay", label: "Historical Replay", icon: RotateCcw },
  { id: "risk-controls", label: "Risk & Controls", icon: ShieldAlert },
  { id: "settings-health", label: "Settings & Health", icon: Sliders },
];

interface SidebarProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  status: BotStatusResponse | null;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  badgeCounts?: {
    positionsCount?: number;
    signalsCount?: number;
    logsCount?: number;
  };
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  status,
  isMobileOpen,
  onCloseMobile,
  isCollapsed,
  onToggleCollapse,
  badgeCounts,
}) => {
  const isBackendConnected = status?.backendConnected ?? true;
  const isRunning = status?.isRunning ?? false;

  const renderNavContent = () => (
    <div className="flex flex-col h-full select-none">
      {/* 1. Header / Logo Branding */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="p-1.5 rounded bg-blue-600/10 border border-blue-500/20 text-blue-400 shrink-0">
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <div className="font-bold text-slate-200 text-xs truncate flex items-center gap-1.5">
                <span>Bybit Intraday</span>
              </div>
              <div className="text-[9px] font-mono text-amber-400/80 flex items-center gap-1">
                <ShieldCheck size={10} className="shrink-0" />
                <span>BYBIT DEMO API</span>
              </div>
            </div>
          )}
        </div>

        {/* Desktop Collapse Toggle */}
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          id="sidebar-toggle-btn"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* Mobile Close Button */}
        <button
          onClick={onCloseMobile}
          className="md:hidden p-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200"
        >
          <X size={16} />
        </button>
      </div>

      {/* 2. Simplified Status Area (Reduced font sizes, cleaner, no heavy borders) */}
      {!isCollapsed && (
        <div className="px-3 py-1.5 mx-2 my-1.5 rounded bg-slate-900/50 border border-slate-900 space-y-1 text-[10px] font-mono">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isBackendConnected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
              API Feed
            </span>
            <span className={`font-bold ${isBackendConnected ? "text-emerald-400" : "text-rose-400"}`}>
              {isBackendConnected ? "LIVE" : "DOWN"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-500 flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-emerald-500" : "bg-slate-600"}`} />
              Engine
            </span>
            <span className={`font-bold ${isRunning ? "text-emerald-400" : "text-slate-500"}`}>
              {isRunning ? "ON" : "OFF"}
            </span>
          </div>
        </div>
      )}

      {/* 3. Navigation List */}
      <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800">
        {SIDEBAR_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const count = item.badgeKey && badgeCounts ? badgeCounts[item.badgeKey] : undefined;

          return (
            <button
              key={item.id}
              onClick={() => {
                onSelectTab(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                isActive
                  ? "bg-blue-600/20 text-blue-300 border border-blue-500/30 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent"
              } ${isCollapsed ? "justify-center px-1" : ""}`}
              title={isCollapsed ? item.label : undefined}
              id={`nav-item-${item.id}`}
            >
              <Icon
                className={`w-3.5 h-3.5 shrink-0 ${
                  isActive ? "text-blue-400" : "text-slate-400"
                }`}
              />
              {!isCollapsed && (
                <span className="truncate flex-1 text-left">{item.label}</span>
              )}
              {!isCollapsed && count !== undefined && count > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* 4. Simplified Footer Info */}
      {!isCollapsed && (
        <div className="px-3 py-2 text-[9px] text-slate-600 font-mono flex items-center justify-between">
          <span>Bybit Demo v2.4</span>
          <span>0.0.0.0:3000</span>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden md:block bg-[#0c101a] border-r border-slate-800 h-screen sticky top-0 transition-all duration-300 shrink-0 z-20 ${
          isCollapsed ? "w-16" : "w-52"
        }`}
        id="desktop-sidebar"
      >
        {renderNavContent()}
      </aside>

      {/* Mobile Drawer Backdrop */}
      {isMobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40"
          onClick={onCloseMobile}
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={`md:hidden fixed inset-y-0 left-0 w-52 bg-[#0c101a] border-r border-slate-800 z-50 transform transition-transform duration-300 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        id="mobile-drawer"
      >
        {renderNavContent()}
      </div>
    </>
  );
};
