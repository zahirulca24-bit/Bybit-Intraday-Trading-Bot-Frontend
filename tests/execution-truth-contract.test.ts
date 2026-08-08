import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const endpoint = fs.readFileSync("api/execution-truth.ts", "utf8");
const component = fs.readFileSync("src/components/WorkerPipelineTruth.tsx", "utf8");
const cloudRunServer = fs.readFileSync("cloud-run-server.ts", "utf8");

const states = ["AVAILABLE", "RESERVED", "ORDER_PENDING", "PARTIALLY_FILLED", "MANAGING", "CLOSING", "CLOSED", "FAILED"];
const canonicalStages = ["1H Top50", "15M Classification", "5M Confirmation", "Entry Safety", "Node Handoff", "Node Live Sizing", "Node Execution", "Trade Management"];
const supportStages = ["Python Sizing Audit", "PostgreSQL Support", "Journal/Persistence"];

test("execution truth uses canonical Cloud Run backend and existing worker endpoints", () => {
  assert.match(endpoint, /bybit-intraday-backend-608992045433\.asia-south1\.run\.app/);
  for (const path of ["/api/workers/status", "/api/workers/symbols", "/api/workers/setups", "/api/workers/execution"]) {
    assert.ok(endpoint.includes(path), path);
  }
});

test("all authoritative Node states and direct Top50 canonical stages are represented", () => {
  for (const state of states) assert.ok(endpoint.includes(state), state);
  for (const stage of canonicalStages) assert.ok(endpoint.includes(stage), stage);
  assert.ok(!endpoint.includes('stage("1H Top20"'));
  assert.ok(!endpoint.includes('stage("Sizing Calculator"'));
  assert.ok(!endpoint.includes('stage("PostgreSQL Support"'));
});

test("Python sizing and PostgreSQL are support-only and cannot own current pipeline point", () => {
  for (const stage of supportStages) assert.ok(endpoint.includes(stage), stage);
  assert.ok(endpoint.includes("supportOnly: true"));
  assert.ok(endpoint.includes("tradeRejectionAuthority: false"));
  assert.ok(endpoint.includes("pythonSizingRole: \"SUPPORT_DIAGNOSTIC_ONLY\""));
  assert.ok(endpoint.includes("postgresRole: \"SUPPORT_RECONCILIATION_ONLY\""));
  assert.ok(component.includes("Current pipeline point is derived ONLY from canonical execution stages"));
  assert.ok(component.includes("const canonicalStages = truth?.stages || []"));
  assert.ok(!component.includes("supportSystems.find"));
});

test("risk is eligibility authority and Node live sizing is authoritative", () => {
  assert.ok(endpoint.includes("approvedRiskQueue"));
  assert.ok(endpoint.includes("approvedSizingQueue"));
  assert.ok(endpoint.includes("riskOwnsTradeEligibility: true"));
  assert.ok(endpoint.includes("sizingIsTradeRejectionGate: false"));
  assert.ok(endpoint.includes("NODE_LIVE_CURRENT_EQUITY_1PCT_STRUCTURAL_STOP_BYBIT_RULES"));
  assert.ok(endpoint.includes("nodeLiveSizing"));
  assert.ok(endpoint.includes("WAITING_FOR_CANDIDATE"));
  assert.ok(endpoint.includes("NODE_SIZING_READY"));
});

test("current-cycle risk rows are preferred over accumulated history", () => {
  assert.ok(endpoint.includes("function currentCycleRows"));
  assert.ok(endpoint.includes("const riskRows = currentCycleRows(allRiskRows, confirmed)"));
});

test("locked policy retains six engines, one percent risk, max 10x and three slots", () => {
  for (const token of [
    "ISOLATED",
    "maximumLeverage: 10",
    '"A+": 1',
    '"A": 1',
    '"B+": "REJECT"',
    "maxOpenPositions: 3",
    "strategyEngines: 6",
    "fixedPerTradeMarginCapEnabled: false",
    "fixedCombinedMarginCapEnabled: false",
    "fixedFreeReserveEnabled: false",
    "outboxIsTradeRejectionGate: false",
    "journalIsTradeRejectionGate: false",
  ]) assert.ok(endpoint.includes(token), token);
  assert.match(component, /Active strategy engines/);
  assert.match(component, /MAX \{maxLeverage\}x/);
  assert.match(component, /TP1 40% at 1\.5R/);
  assert.match(component, /TP2 30% at 2R/);
  assert.match(component, /Runner trail: 0\.5R/);
});

test("PostgreSQL degradation is support-only and does not fabricate Node readiness", () => {
  assert.ok(endpoint.includes("Persistence unavailable or retrying; execution eligibility unchanged."));
  assert.ok(endpoint.includes("PostgreSQL Support"));
  assert.ok(endpoint.includes("postgresSupportCommands"));
  assert.ok(endpoint.includes("const nodeCommands = slots.map"));
  assert.ok(!endpoint.includes("const commands = postgresCommands"));
});

test("Node is not shown PASS before candidate/live sizing evidence exists", () => {
  assert.ok(endpoint.includes('nodeSizingCode = text(nodeSizing?.code, delivered > 0 ? "WAITING_FOR_NODE_STATUS" : "WAITING_FOR_CANDIDATE")'));
  assert.ok(endpoint.includes('delivered > 0\n        ? "RUNNING"\n        : "NOT_REACHED"'));
  assert.ok(component.includes("No active candidate assigned."));
});

test("component labels canonical pipeline and support diagnostics separately", () => {
  assert.match(component, /Canonical Execution Pipeline/);
  assert.match(component, /1H Top50 → 15M → closed 5M → Entry Safety → Node Handoff → Node Live Sizing → Node Execution → Trade Management/);
  assert.match(component, /Support \/ Diagnostics — non-blocking/);
  assert.ok(!component.includes("1H Top20"));
  assert.ok(!component.includes("Risk → Sizing → PostgreSQL → Node"));
});

test("Cloud Run server routes the dedicated truth adapter before generic BFF", () => {
  const routeIndex = cloudRunServer.indexOf('app.get("/api/execution-truth"');
  const genericIndex = cloudRunServer.indexOf('app.all("/api/*"');
  assert.ok(routeIndex >= 0);
  assert.ok(genericIndex > routeIndex);
});
