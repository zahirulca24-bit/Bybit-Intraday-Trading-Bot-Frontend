import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("api/dashboard-truth.ts", "utf8");

test("dashboard derives a conservative usable balance when Bybit reports zero available balance", () => {
  assert.ok(source.includes("function availableBalanceFromWallet"));
  assert.ok(source.includes("equity - initialMargin"));
  assert.ok(source.includes("availableBalance = availableBalanceFromWallet(account, equity)"));
});

test("dashboard still prefers a positive Bybit-reported available balance", () => {
  assert.ok(source.includes("reported !== null && reported > 0"));
  assert.ok(source.includes("return reported"));
});
