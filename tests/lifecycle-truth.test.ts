import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard lifecycle is locked to the canonical Cloud Run backend", async () => {
  const source = await read("api/dashboard-truth.ts");
  assert.ok(source.includes("bybit-intraday-backend-608992045433.asia-south1.run.app"));
  assert.ok(!source.includes("bybit-intraday-trading-bot.onrender.com"));
});

test("informational journal events are not promoted to order lifecycle rows", async () => {
  const source = await read("api/dashboard-truth.ts");
  assert.ok(source.includes("function executionEvent"));
  assert.ok(source.includes("if (!executionEvent(entry)) return null"));
  assert.ok(source.includes(".filter((entry): entry is AnyRecord => entry !== null)"));
});

test("successful lifecycle status requires explicit exchange evidence", async () => {
  const source = await read("api/dashboard-truth.ts");
  assert.ok(source.includes("const hasSuccessEvidence"));
  assert.ok(source.includes("return hasSuccessEvidence ? \"PASS\" : \"WAIT\""));
  assert.ok(source.includes("evidenceComplete: hasSuccessEvidence"));
  assert.ok(!source.includes('return "PASS";\n}'));
});

test("missing trade values remain unavailable instead of fabricated zero truth", async () => {
  const source = await read("api/dashboard-truth.ts");
  assert.ok(source.includes("function optionalNumber"));
  assert.ok(source.includes("price: entryPrice"));
  assert.ok(source.includes("sizeUsdt: notional"));
  assert.ok(source.includes("leverage,"));
  assert.ok(source.includes("stopLoss,"));
  assert.ok(source.includes("takeProfit,"));
});
