import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const endpoint = fs.readFileSync("api/execution-truth.ts", "utf8");
const component = fs.readFileSync("src/components/WorkerPipelineTruth.tsx", "utf8");
const cloudRunServer = fs.readFileSync("cloud-run-server.ts", "utf8");

const states = ["AVAILABLE", "RESERVED", "ORDER_PENDING", "PARTIALLY_FILLED", "MANAGING", "CLOSING", "CLOSED", "FAILED"];
const stages = ["1H Top20", "15M Classification", "5M Confirmation", "Risk Verdict", "Sizing Calculator", "PostgreSQL Support", "Node Execution", "Trade Management"];

test("execution truth uses canonical Cloud Run backend and existing worker endpoints", () => {
  assert.match(endpoint, /bybit-intraday-backend-608992045433\.asia-south1\.run\.app/);
  for (const path of ["/api/workers/status", "/api/workers/symbols", "/api/workers/setups", "/api/workers/execution"]) {
    assert.ok(endpoint.includes(path), path);
  }
});

test("all authoritative Node states and 1H-first pipeline stages are represented", () => {
  for (const state of states) assert.ok(endpoint.includes(state), state);
  for (const stage of stages) assert.ok(endpoint.includes(stage), stage);
  assert.ok(!endpoint.includes('stage("Daily Top100"'), "Daily Top100 must not be an execution-truth stage");
  assert.ok(!endpoint.includes('stage("4H Top50"'), "4H Top50 must not be an execution-truth stage");
});

test("risk is the eligibility authority while sizing is calculator-only", () => {
  assert.ok(endpoint.includes("approvedRiskQueue"));
  assert.ok(endpoint.includes("approvedSizingQueue"));
  assert.ok(endpoint.includes("riskOwnsTradeEligibility: true"));
  assert.ok(endpoint.includes("sizingIsTradeRejectionGate: false"));
  assert.ok(endpoint.includes("no trade rejection"));
  assert.ok(!endpoint.includes('sizingState = "BLOCKED"'));
});

test("current-cycle risk rows are preferred over accumulated history", () => {
  assert.ok(endpoint.includes("function currentCycleRows"));
  assert.ok(endpoint.includes("const riskRows = currentCycleRows(allRiskRows, confirmed)"));
  assert.ok(endpoint.includes("current-cycle risk result(s)"));
});

test("locked policy reflects 08 Aug 2026 plan", () => {
  for (const token of [
    "ISOLATED",
    "maximumLeverage: 10",
    '"A+": 1',
    '"A": 1',
    '"B+": "REJECT"',
    "maxOpenPositions: 3",
    "fixedPerTradeMarginCapEnabled: false",
    "fixedCombinedMarginCapEnabled: false",
    "fixedFreeReserveEnabled: false",
    "outboxIsTradeRejectionGate: false",
    "journalIsTradeRejectionGate: false",
  ]) {
    assert.ok(endpoint.includes(token), token);
  }
  assert.match(component, /MAX \{maxLeverage\}x/);
  assert.match(component, /Fixed margin caps/);
  assert.match(component, /REMOVED/);
  assert.match(component, /TP1 40% at 1\.5R/);
  assert.match(component, /TP2 30% at 2R/);
  assert.match(component, /Runner trail: 0\.5R/);
});

test("PostgreSQL support degradation never appears as trade rejection", () => {
  assert.ok(endpoint.includes("SQL degraded/unverified — support retry only, trade eligibility unchanged"));
  assert.ok(endpoint.includes("SQL support operation(s) waiting/retrying — not a trade rejection"));
  assert.ok(endpoint.includes("PostgreSQL Support"));
  assert.ok(!endpoint.includes('outboxState = "BLOCKED"'));
});

test("support WAIT_RETRY rows are not fabricated into AVAILABLE Node commands", () => {
  assert.ok(endpoint.includes("const nodeCommandRows = outboxRows.filter"));
  assert.ok(endpoint.includes('=== "WAIT_RETRY"'));
  assert.ok(endpoint.includes("const commands = nodeCommandRows.map(normalizeCommand)"));
});

test("Cloud Run server routes the dedicated truth adapter before generic BFF", () => {
  const routeIndex = cloudRunServer.indexOf('app.get("/api/execution-truth"');
  const genericIndex = cloudRunServer.indexOf('app.all("/api/*"');
  assert.ok(routeIndex >= 0);
  assert.ok(genericIndex > routeIndex);
});
