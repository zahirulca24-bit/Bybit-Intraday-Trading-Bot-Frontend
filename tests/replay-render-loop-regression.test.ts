import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync("src/components/HistoricalReplayPhase2View.tsx", "utf8");

test("visualization mutations cannot retrigger the controls observer", () => {
  assert.ok(workspace.includes('data-testid="historical-replay-controls-host"'));
  assert.ok(workspace.includes("observer.observe(controls"));
  assert.ok(!workspace.includes("observer.observe(root"));
});

test("refresh only occurs when the authoritative replay signature changes", () => {
  assert.ok(workspace.includes("lastSignature"));
  assert.ok(workspace.includes("if (signature === lastSignature.current) return"));
  assert.ok(workspace.includes("replay-selected-id"));
  assert.ok(workspace.includes("replay-cursor"));
  assert.ok(workspace.includes("replay-status"));
  assert.ok(workspace.includes("replay-total-trades"));
});
