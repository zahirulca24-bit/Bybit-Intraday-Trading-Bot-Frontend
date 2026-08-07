import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("scanner reads the authoritative worker runtime instead of the legacy scanner endpoint", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(source.includes("bybit-intraday-backend-608992045433.asia-south1.run.app"));
  assert.ok(source.includes('backendJson("/api/workers/status")'));
  assert.ok(!source.includes("/api/bot/scanner?interval="));
  assert.ok(source.includes("Authorization: `Bearer ${ADMIN_TOKEN}`"));
});

test("scanner consumes the same staged snapshots as execution truth", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(source.includes("runtime?.dailyUniverse"));
  assert.ok(source.includes("runtime?.fourHourDirectionalPool"));
  assert.ok(source.includes("runtime?.hourlyWatchlist"));
  assert.ok(source.includes("runtime?.fifteenMinuteStrategyClassification"));
  assert.ok(source.includes("runtime?.fiveMinuteEntryConfirmation"));
  assert.ok(source.includes("runtime?.authoritativeEntryRisk"));
  assert.ok(source.includes("runtime?.positionSizingMargin"));
  assert.ok(source.includes("runtime?.executionCommandOutbox"));
});

test("scanner rejects cross-cycle 5m and risk snapshots", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(source.includes('currentCycle(five, "setupFifteenMinuteCandleTime", classificationCandle)'));
  assert.ok(source.includes('currentCycle(risk, "fiveMinuteCandleTime", fiveCandle)'));
  assert.ok(source.includes("fiveAligned ? rows(five?.rows) : []"));
  assert.ok(source.includes("riskAligned ? rows(risk?.rows) : []"));
});

test("scanner never promotes a 15m setup to Buy or Sell before closed 5m confirmation", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(source.includes('else if (fiveStatus === "ENTRY_CONFIRMED") signal = text(five?.side) === "Sell" ? "Sell" : "Buy"'));
  assert.ok(source.includes('let signal: "Buy" | "Sell" | "WAIT" | "Blocked" | "Error" = "WAIT"'));
});

test("scanner only reports executable when a durable command exists", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(source.includes('else if (command && !["FAILED", "CLOSED"].includes(commandState))'));
  assert.ok(source.includes('executionReadiness = "EXECUTABLE"'));
  assert.ok(source.includes('executionReadiness = "PENDING_RISK"'));
});

test("scanner normalizes backend percentage points to frontend ratios without a second threshold policy", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(source.includes("function percentToRatio(value: any): number"));
  assert.ok(source.includes("spreadPct: percentToRatio(market?.spreadPct)"));
  assert.ok(!source.includes("MAX_SPREAD_PCT ="));
  assert.ok(!source.includes("MIN_VOLUME_RATIO ="));
  assert.ok(!source.includes("integrityFailures("));
});

test("scanner exposes authoritative source and candle identities", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(source.includes('universeLabel: "AUTHORITATIVE_EXECUTION_PIPELINE"'));
  assert.ok(source.includes('source: "/api/workers/status"'));
  assert.ok(source.includes("classificationCandleTime: classificationCandle || null"));
  assert.ok(source.includes("fiveMinuteCandleTime: fiveCandle || null"));
});
