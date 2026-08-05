import React, { useEffect, useRef, useState } from "react";

import { HistoricalReplayView } from "./HistoricalReplayView";
import { ReplayVisualizationPanel } from "./ReplayVisualizationPanel";

function installStableReplaySelectors(root: HTMLElement): void {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("button, span, div"));

  const safetyBadge = elements.find((element) => element.textContent?.trim() === "EXTERNAL EXECUTION BLOCKED");
  if (safetyBadge && safetyBadge.dataset.testid !== "replay-safety-badge") {
    safetyBadge.dataset.testid = "replay-safety-badge";
  }

  const journalTab = elements.find((element) => element.tagName === "BUTTON" && element.textContent?.trim() === "Journal");
  if (journalTab && journalTab.dataset.testid !== "replay-journal-tab") {
    journalTab.dataset.testid = "replay-journal-tab";
  }

  const journalEntries = elements.filter((element) => {
    const text = element.textContent?.trim() || "";
    return element.tagName === "DIV" && /^#\d+\s+[a-z0-9_.-]+/i.test(text);
  });
  journalEntries.forEach((entry) => {
    if (entry.dataset.testid !== "replay-journal-entry") entry.dataset.testid = "replay-journal-entry";
  });
  const journalList = journalEntries[0]?.parentElement;
  if (journalList && journalList.dataset.testid !== "replay-journal-list") {
    journalList.dataset.testid = "replay-journal-list";
  }
}

function replaySignature(root: HTMLElement): string {
  const selectedId = root.querySelector<HTMLElement>('[data-testid="replay-selected-id"]')?.textContent?.trim() || "";
  const cursor = root.querySelector<HTMLElement>('[data-testid="replay-cursor"]')?.textContent?.trim() || "";
  const status = root.querySelector<HTMLElement>('[data-testid="replay-status"]')?.textContent?.trim() || "";
  const trades = root.querySelector<HTMLElement>('[data-testid="replay-total-trades"]')?.textContent?.trim() || "";
  return `${selectedId}|${cursor}|${status}|${trades}`;
}

export const HistoricalReplayPhase2View: React.FC = () => {
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const refreshTimer = useRef<number | null>(null);
  const lastSignature = useRef("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const synchronize = () => {
      installStableReplaySelectors(controls);
      const signature = replaySignature(controls);
      if (signature === lastSignature.current) return;

      lastSignature.current = signature;
      const nextSelectedId = signature.split("|", 1)[0] || null;
      setSelectedId((current) => (current === nextSelectedId ? current : nextSelectedId));
      setRefreshKey((value) => value + 1);
    };

    const scheduleSynchronize = () => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(synchronize, 120);
    };

    synchronize();
    const observer = new MutationObserver(scheduleSynchronize);
    observer.observe(controls, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, []);

  return (
    <div className="space-y-3" data-testid="historical-replay-phase-2-view">
      <div ref={controlsRef} data-testid="historical-replay-controls-host">
        <HistoricalReplayView />
      </div>
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
