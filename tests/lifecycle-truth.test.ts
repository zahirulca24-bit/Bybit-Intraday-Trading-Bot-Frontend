import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("lifecycle adapter is locked to the canonical Cloud Run backend", async () => {
  const source = await read("api/lifecycle-truth.ts");
  assert.ok(source.includes("bybit-intraday-backend-608992045433.asia-south1.run.app"));
  assert.ok(!source.includes("bybit-intraday-trading-bot.onrender.com"));
});

test("missing numeric evidence remains unavailable rather than fabricated zero", async () => {
  const source = await read("api/lifecycle-truth.ts");
  assert.ok(source.includes("function optionalNumber"));
  assert.ok(!source.includes("function numberValue"));
  assert.ok(source.includes("price: evidence.price"));
  assert.ok(source.includes("sizeUsdt: evidence.sizeUsdt"));
  assert.ok(source.includes("stopLoss: evidence.stopLoss"));
  assert.ok(source.includes("takeProfit: evidence.takeProfit"));
});

test("PASS requires complete exchange execution evidence", async () => {
  const source = await read("api/lifecycle-truth.ts");
  assert.ok(source.includes("function hasCompleteExecutionEvidence"));
  assert.ok(source.includes('return hasCompleteExecutionEvidence(entry) ? "PASS" : "WAIT"'));
  assert.ok(source.includes("evidence.leverage === 5"));
  assert.ok(source.includes("evidenceComplete"));
});

test("frontend never supplies fake leverage, size, or successful outcome", async () => {
  const source = await read("src/components/OrderLifecycleSection.tsx");
  assert.ok(source.includes('textValue(item.order?.leverage, "x")'));
  assert.ok(source.includes("Complete backend execution evidence is unavailable"));
  assert.ok(source.includes("WAIT — evidence incomplete"));
  assert.ok(source.includes('value === "UNAVAILABLE"'));
  assert.ok(!source.includes("item.order?.leverage || 10"));
  assert.ok(!source.includes("item.order?.sizeUsdt || 0"));
  assert.ok(!source.includes('failureReason ? "Failed / Blocked" : "Engine Processed"'));
});
