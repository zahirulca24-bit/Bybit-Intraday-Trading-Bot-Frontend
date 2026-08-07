import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const statusTruth = fs.readFileSync("api/status-truth.ts", "utf8");
const lifecycleTruth = fs.readFileSync("api/lifecycle-truth.ts", "utf8");
const executionTruth = fs.readFileSync("api/execution-truth.ts", "utf8");
const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));

test("settings status is sourced from canonical durable and worker endpoints", () => {
  for (const path of ["/api/bot/status", "/api/durable-state/status", "/api/workers/status"]) {
    assert.ok(statusTruth.includes(path), path);
  }
  assert.ok(statusTruth.includes('backend === "postgresql"'));
  assert.ok(statusTruth.includes("migrationVersion"));
  assert.ok(statusTruth.includes("restartSafe"));
});

test("staged execution truth reads canonical 1H 15M 5M snapshots", () => {
  for (const path of [
    "runtime?.hourlyWatchlist?.rows",
    "runtime?.fifteenMinuteStrategyClassification?.rows",
    "runtime?.fiveMinuteEntryConfirmation?.rows",
    "runtime?.authoritativeEntryRisk?.rows",
    "runtime?.positionSizingMargin?.rows",
    "runtime?.executionCommandOutbox?.rows",
  ]) {
    assert.ok(executionTruth.includes(path), path);
  }
  assert.ok(!executionTruth.includes("runtime?.dailyUniverse?.rows"));
  assert.ok(!executionTruth.includes("runtime?.fourHourDirectionalPool?.rows"));
});

test("lifecycle PASS accepts complete isolated execution evidence up to 10x", () => {
  assert.ok(lifecycleTruth.includes("hasCompleteExecutionEvidence"));
  assert.ok(lifecycleTruth.includes("evidence.leverage > 0"));
  assert.ok(lifecycleTruth.includes("evidence.leverage <= 10"));
  for (const token of ["evidence.orderId", "evidence.price > 0", "evidence.sizeUsdt > 0", "evidence.stopLoss > 0", "evidence.takeProfit > 0"]) {
    assert.ok(lifecycleTruth.includes(token), token);
  }
});

test("dedicated truth routes precede the generic BFF fallback", () => {
  const rewrites = vercel.rewrites;
  const generic = rewrites.findIndex((row: any) => row.source === "/api/:path*");
  for (const route of ["/api/status", "/api/orders/lifecycle", "/api/execution-truth"]) {
    const index = rewrites.findIndex((row: any) => row.source === route);
    assert.ok(index >= 0, route);
    assert.ok(index < generic, `${route} must precede generic fallback`);
  }
});
