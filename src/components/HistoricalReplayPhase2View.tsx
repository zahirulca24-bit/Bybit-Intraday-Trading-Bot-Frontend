import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import { api } from "../services/api";
import { ReplaySession } from "../types";
import { HistoricalReplayView } from "./HistoricalReplayView";
import { ReplayVisualizationPanel } from "./ReplayVisualizationPanel";

function installStableReplaySelectors(root: HTMLElement): void {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("button, span, div"));

  const safetyBadge = elements.find((element) => element.textContent?.trim() === "EXTERNAL EXECUTION BLOCKED");
  if (safetyBadge) safetyBadge.dataset.testid = "replay-safety-badge";

  const selectedId = elements.find((element) => /^replay_ui_[A-Za-z0-9_-]+$/.test(element.textContent?.trim() || ""));
  if (selectedId) selectedId.dataset.testid = "replay-selected-id";

  const journalTab = elements.find((element) => element.tagName === "BUTTON" && element.textContent?.trim() === "Journal");
  if (journalTab) journalTab.dataset.testid = "replay-journal-tab";

  const journalEntries = elements.filter((element) => {
    const text = element.textContent?.trim() || "";
    return element.tagName === "DIV" && /^#\d+\s+[a-z0-9_.-]+/i.test(text);
  });
  journalEntries.forEach((entry) => { entry.dataset.testid = "replay-journal-entry"; });
  const journalList = journalEntries[0]?.parentElement;
  if (journalList) journalList.dataset.testid = "replay-journal-list";
}

export const HistoricalReplayPhase2View: React.FC = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [sessions, setSessions] = useState<ReplaySession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listReplaySessions(50);
      setSessions(response.sessions);
      setSelectedId((current) => current && response.sessions.some((session) => session.sessionId === current)
        ? current
        : response.sessions[0]?.sessionId ?? null);
      setRefreshKey((value) => value + 1);
    } catch (reason: any) {
      setError(reason?.message || "Unable to load replay sessions for visualization.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
    const interval = window.setInterval(() => void loadSessions(), 15_000);
    return () => window.clearInterval(interval);
  }, [loadSessions]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    installStableReplaySelectors(root);
    const observer = new MutationObserver(() => installStableReplaySelectors(root));
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const selected = sessions.find((session) => session.sessionId === selectedId) ?? null;

  return (
    <div ref={rootRef} className="space-y-3" data-testid="historical-replay-phase-2-view">
      <HistoricalReplayView />
      <div className="rounded-xl border border-slate-800 bg-[#0b0f18] p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <label className="text-[10px] text-slate-500">Visualization session
            <select value={selectedId ?? ""} onChange={(event) => setSelectedId(event.target.value || null)} className="mt-1 block min-w-[300px] max-w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-100" data-testid="replay-visualization-session-select">
              {sessions.length === 0 && <option value="">No replay sessions</option>}
              {sessions.map((session) => <option key={session.sessionId} value={session.sessionId}>{session.symbol} · {session.timeframe}m · {session.status} · {session.sessionId.slice(-12)}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-2">
            {selected && <span className="text-[10px] text-slate-500">Cursor {selected.cursorTime ? new Date(selected.cursorTime).toLocaleString() : "not started"}</span>}
            <button onClick={() => void loadSessions()} disabled={loading} className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-950 px-3 py-2 text-[10px] font-bold text-slate-300 disabled:opacity-50"><RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh chart data</button>
          </div>
        </div>
        {error && <div className="mt-2 text-xs text-rose-300">{error}</div>}
      </div>
      {selectedId && <ReplayVisualizationPanel sessionId={selectedId} refreshKey={refreshKey + (selected?.cursorTime ?? 0)} />}
    </div>
  );
};
