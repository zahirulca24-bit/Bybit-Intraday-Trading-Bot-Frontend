import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const panel = fs.readFileSync("src/components/ReplayVisualizationPanel.tsx", "utf8");
const workspace = fs.readFileSync("src/components/HistoricalReplayPhase2View.tsx", "utf8");
const app = fs.readFileSync("src/App.tsx", "utf8");
const replayBff = fs.readFileSync("api/replay.ts", "utf8");
const types = fs.readFileSync("src/replay-visualization-types.ts", "utf8");

test("Phase 2 route is authenticated through the existing replay BFF", () => {
  assert.ok(replayBff.includes("/visualization$"));
  assert.ok(replayBff.includes("Authorization: `Bearer ${ADMIN_TOKEN}`"));
  assert.ok(replayBff.includes('cache: "no-store"'));
});

test("replay chart renders authoritative OHLC candles and trade markers", () => {
  for (const field of ["row.open", "row.high", "row.low", "row.close"]) {
    assert.ok(panel.includes(field), field);
  }
  for (const marker of ["entry", "stop_loss", "take_profit", "exit"]) {
    assert.ok(panel.includes(marker), marker);
  }
  assert.ok(panel.includes('data-testid="replay-candlestick-chart"'));
});

test("trade detail preserves execution evidence", () => {
  for (const field of ["grossPnl", "fees", "netPnl", "rMultiple", "holdingDurationMs", "exitReason", "sameCandleConflict", "sameCandlePolicy"]) {
    assert.ok(panel.includes(field), field);
    assert.ok(types.includes(field), field);
  }
  assert.ok(panel.includes("External execution disabled"));
  assert.ok(panel.includes("Closed candles only"));
});

test("existing Historical Replay controls remain mounted with Phase 2 workspace", () => {
  assert.ok(workspace.includes("<HistoricalReplayView />"));
  assert.ok(workspace.includes("<ReplayVisualizationPanel"));
  assert.ok(app.includes("<HistoricalReplayPhase2View />"));
});

test("visualization follows the authoritative Phase 1 selected session", () => {
  assert.ok(workspace.includes('data-testid="replay-selected-id"'));
  assert.ok(workspace.includes("selectedSessionId(root)"));
  assert.ok(workspace.includes("MutationObserver"));
  assert.ok(workspace.includes("setRefreshKey((value) => value + 1)"));
  assert.ok(!workspace.includes("api.listReplaySessions"));
  assert.ok(!workspace.includes("setInterval"));
  assert.ok(!workspace.includes("replay-visualization-session-select"));
});

test("active replay lookahead is never requested by the frontend", () => {
  assert.ok(panel.includes('includeFuture: "false"'));
  assert.ok(types.includes("activeSessionLookaheadBlocked: true"));
  assert.ok(types.includes("externalExecutionAllowed: false"));
});
