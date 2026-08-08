import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../api/scanner-live.ts", import.meta.url), "utf8");

test("authoritative scanner maps backend 15m ATR and volume ratio instead of hardcoded zeros", () => {
  assert.match(source, /atr15m:\s*optionalNumber\(classification\?\.atr15mPct\)/);
  assert.match(source, /volumeRatio:\s*optionalNumber\(classification\?\.volumeRatio\)/);
  assert.doesNotMatch(source, /atr15m:\s*0,/);
  assert.doesNotMatch(source, /volumeRatio:\s*0,/);
});
