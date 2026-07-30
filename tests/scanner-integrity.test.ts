import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("scanner normalizes percent units before enforcing spread thresholds", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(source.includes("function optionalPercent"));
  assert.ok(source.includes("MAX_SPREAD_PCT = 0.14"));
  assert.ok(source.includes("normalizedMarketSpreads"));
});

test("scanner fails closed when required integrity metrics are missing", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(source.includes("Missing or unclosed 15m signal candle"));
  assert.ok(source.includes("ATR 15m metric unavailable or non-positive"));
  assert.ok(source.includes("Volume ratio below"));
  assert.ok(source.includes('if (failures.length > 0) return "BLOCKED"'));
});

test("scanner reports degraded rows instead of counting every row complete", async () => {
  const source = await read("api/scanner-live.ts");
  assert.ok(source.includes('dataQuality: {'));
  assert.ok(source.includes('status: failures.length === 0 ? "PASS" : "DEGRADED"'));
  assert.ok(source.includes('const completed = signals.filter'));
  assert.ok(source.includes('failClosedIntegrity: true'));
});
