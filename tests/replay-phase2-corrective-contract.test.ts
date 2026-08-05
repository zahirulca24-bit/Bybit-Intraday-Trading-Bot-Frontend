import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync("src/components/HistoricalReplayPhase2View.tsx", "utf8");
const panel = fs.readFileSync("src/components/ReplayVisualizationPanel.tsx", "utf8");

test("Phase 2 uses one authoritative selected session and invalidates immediately", () => {
  assert.ok(workspace.includes('querySelector<HTMLElement>(\'[data-testid="replay-selected-id"]\')'));
  assert.ok(workspace.includes("MutationObserver"));
  assert.ok(workspace.includes("setRefreshKey((value) => value + 1)"));
  assert.ok(!workspace.includes("listReplaySessions"));
  assert.ok(!workspace.includes("setInterval"));
  assert.ok(!workspace.includes("Visualization session"));
});

test("visualization remains read-only and lookahead-safe", () => {
  assert.ok(panel.includes('includeFuture: "false"'));
  assert.ok(panel.includes("ReplayVisualizationPanel"));
  assert.ok(panel.includes("External execution disabled"));
});
