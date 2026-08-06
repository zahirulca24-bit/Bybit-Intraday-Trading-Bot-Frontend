import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("scanner reads the canonical Cloud Run scanner endpoint", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(source.includes("bybit-intraday-backend-608992045433.asia-south1.run.app"));
  assert.ok(source.includes("/api/bot/scanner?interval="));
  assert.ok(source.includes("Authorization: `Bearer ${ADMIN_TOKEN}`"));
});

test("scanner normalizes backend percentage points to frontend ratios", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(source.includes("function percentToRatio(value: any): number"));
  assert.ok(source.includes("spreadPct: percentToRatio(row?.spreadPct)"));
  assert.ok(source.includes("maxSpreadThresholdPct: percentToRatio(policy?.maxSpreadPct)"));
});

test("scanner renders policy values returned by the backend", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(source.includes("const policy = universe?.policy || raw?.policy || {}"));
  assert.ok(source.includes("normalSpreadThresholdPct: percentToRatio(policy?.normalSpreadPct)"));
  assert.ok(source.includes("minTurnoverUsdt: numberValue(policy?.minimumTurnover)"));
  assert.ok(source.includes("minGrossRR: numberValue(policy?.minimumGrossRr)"));
  assert.ok(source.includes("maxCostToRiskLimitPct: numberValue(policy?.maximumCostRiskPct)"));
});

test("scanner counts agreement-filtered candidates as rejected", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(source.includes("numberValue(metrics?.agreementRequiredExcluded)"));
  assert.ok(source.includes("rejected: rejectedCount"));
});

test("frontend does not apply a second scanner threshold policy", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(!source.includes("MAX_SPREAD_PCT ="));
  assert.ok(!source.includes("MIN_VOLUME_RATIO ="));
  assert.ok(!source.includes("integrityFailures("));
  assert.ok(source.includes('if (signal === "Buy" || signal === "Sell") return "PENDING_RISK"'));
});

test("missing frontend evidence is not promoted to executable", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(source.includes('if (signal === "Blocked") return "BLOCKED"'));
  assert.ok(source.includes('if (signal === "Error") return "ERROR"'));
  assert.ok(source.includes('return "NOT_EXECUTABLE"'));
});
