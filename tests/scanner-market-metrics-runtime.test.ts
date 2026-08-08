import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../api/scanner-live.ts", import.meta.url), "utf8");

test("scanner preserves unavailable authoritative metrics as null instead of inventing zero", () => {
  assert.match(source, /function optionalNumber\(value: any\): number \| null/);
  assert.match(source, /marketDataStatus: classification\?\.atr15mPct != null && classification\?\.volumeRatio != null/);
});
