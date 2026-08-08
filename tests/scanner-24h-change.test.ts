import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(new URL("../api/scanner-live.ts", import.meta.url), "utf8");

test("authoritative scanner uses backend 24h change instead of hardcoded zero", () => {
  assert.match(source, /change24hPct:\s*numberValue\(market\?\.change24hPct\)/);
  assert.doesNotMatch(source, /change24hPct:\s*0,/);
});
