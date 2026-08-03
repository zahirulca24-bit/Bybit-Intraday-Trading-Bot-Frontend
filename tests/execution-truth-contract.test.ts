import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const endpoint = fs.readFileSync("api/execution-truth.ts", "utf8");
const component = fs.readFileSync("src/components/WorkerPipelineTruth.tsx", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");

const states = ["AVAILABLE", "RESERVED", "ORDER_PENDING", "PARTIALLY_FILLED", "MANAGING", "CLOSING", "CLOSED", "FAILED"];
const stages = ["Daily Top100", "4H Top50", "1H Top20", "15M Classification", "5M Confirmation", "Risk Verdict", "Sizing Verdict", "PostgreSQL Outbox", "Node Execution", "Trade Management"];

test("execution truth uses canonical Cloud Run backend and existing worker endpoints", () => {
  assert.match(endpoint, /bybit-intraday-backend-608992045433\.asia-south1\.run\.app/);
  for (const path of ["/api/workers/status", "/api/workers/symbols", "/api/workers/setups", "/api/workers/execution"]) {
    assert.ok(endpoint.includes(path), path);
  }
});

test("all authoritative Node states and pipeline stages are represented", () => {
  for (const state of states) assert.ok(endpoint.includes(state), state);
  for (const stage of stages) assert.ok(endpoint.includes(stage), stage);
});

test("locked policy remains visible and unchanged", () => {
  for (const token of ["ISOLATED", "leverage: 5", '"A+": 1', '"A": 0.75', '"B+": "REJECT"', "maxOpenPositions: 3", "perTradeMarginCapPct: 25", "combinedMarginCapPct: 60", "freeReservePct: 40"]) {
    assert.ok(endpoint.includes(token), token);
  }
  assert.match(component, /TP1 40% at 1\.5R/);
  assert.match(component, /TP2 30% at 2R/);
  assert.match(component, /Runner trail: 0\.5R/);
});

test("Vercel routes the dedicated truth adapter before generic BFF", () => {
  const config = JSON.parse(vercel);
  const routeIndex = config.rewrites.findIndex((row: any) => row.source === "/api/execution-truth");
  const genericIndex = config.rewrites.findIndex((row: any) => row.source === "/api/:path*");
  assert.ok(routeIndex >= 0);
  assert.ok(genericIndex > routeIndex);
});
