import React, { useEffect, useRef, useState } from "react";

import { HistoricalReplayView } from "./HistoricalReplayView";
import { ReplayVisualizationPanel } from "./ReplayVisualizationPanel";

function installStableReplaySelectors(root: HTMLElement): void {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("button, span, div"));

  const safetyBadge = elements.find((element) => element.textContent?.trim() === "EXTERNAL EXECUTION BLOCKED");
  if (safetyBadge) safetyBadge.dataset.testid = "replay-safety-badge";

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

function selectedSessionId(root: HTMLElement): string | null {
  const value = root.querySelector<HTMLElement>('[data-testid="replay-selected-id"]')?.textContent?.trim();
  return value || null;
}

export const HistoricalReplayPhase2View: React.FC = () => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const refreshTimer = useRef<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const synchronize = () => {
      installStableReplaySelectors(root);
      setSelectedId(selectedSessionId(root));
      setRefreshKey((value) => value + 1);
    };

    const scheduleSynchronize = () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(synchronize, 120);
    };

    synchronize();
    const observer = new MutationObserver(scheduleSynchronize);
    observer.observe(root, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, []);

  return (
    <div ref={rootRef} className="space-y-3" data-testid="historical-replay-phase-2-view">
      <HistoricalReplayView />
      {selectedId ? (
        <ReplayVisualizationPanel sessionId={selectedId} refreshKey={refreshKey} />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-800 bg-[#0b0f18] p-5 text-center text-xs text-slate-500" data-testid="replay-visualization-empty">
          Create or select a replay session to load its authoritative chart and trade evidence.
        </div>
      )}
    </div>
  );
};
