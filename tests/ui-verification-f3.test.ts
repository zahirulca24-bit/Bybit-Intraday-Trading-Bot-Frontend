import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const endpoint = fs.readFileSync("api/execution-truth.ts", "utf8");
const component = fs.readFileSync("src/components/WorkerPipelineTruth.tsx", "utf8");
const server = fs.readFileSync("cloud-run-server.ts", "utf8");

test("durable execution truth reports PostgreSQL as support-only without turning it into a trade rejection", () => {
  assert.ok(endpoint.includes('backend === "POSTGRESQL" && restartSafe && !degraded'));
  assert.ok(endpoint.includes('postgresRole: "SUPPORT_RECONCILIATION_ONLY"'));
  assert.ok(endpoint.includes("outboxIsTradeRejectionGate: false"));
  assert.ok(endpoint.includes("PostgreSQL Support"));
  assert.ok(endpoint.includes("Persistence unavailable or retrying; execution eligibility unchanged."));
  assert.ok(endpoint.includes("tradeRejectionAuthority: false"));
  assert.ok(!endpoint.includes('stage("PostgreSQL Support"'));
  assert.ok(!endpoint.includes('outboxState = "BLOCKED"'));
});

test("Python sizing audit is support-only and cannot become a BLOCKED canonical trade gate", () => {
  assert.ok(endpoint.includes("Python Sizing Audit"));
  assert.ok(endpoint.includes("sizingIsTradeRejectionGate: false"));
  assert.ok(endpoint.includes('pythonSizingRole: "SUPPORT_DIAGNOSTIC_ONLY"'));
  assert.ok(component.includes("Support / Diagnostics — non-blocking"));
  assert.ok(component.includes("Current pipeline point is derived ONLY from canonical execution stages"));
  assert.ok(!endpoint.includes('stage("Sizing Calculator"'));
  assert.ok(!endpoint.includes('sizingState = "BLOCKED"'));
});

test("canonical durable state is fetched server-side with the existing authenticated backend client", () => {
  assert.ok(endpoint.includes('backendJson("/api/durable-state/status")'));
  assert.ok(endpoint.includes("normalizeDurable(status, execution, durableStatus)"));
  assert.ok(endpoint.includes("durableStatus?.durableState || durableStatus?.status || durableStatus"));
  assert.ok(endpoint.includes("migrationVersion: source?.migrationVersion ?? null"));
});

test("stale or failed truth refresh cannot remain visually connected", () => {
  assert.ok(component.includes("ageSeconds > 20"));
  assert.ok(component.includes("Boolean(error)"));
  assert.ok(component.includes("Previous data is not treated as current"));
  assert.ok(component.includes('stale ? "TRUTH STALE"'));
  assert.ok(component.includes('stale ? "UNVERIFIED"'));
});

test("all authoritative Node states remain visible", () => {
  for (const state of ["AVAILABLE", "RESERVED", "ORDER_PENDING", "PARTIALLY_FILLED", "MANAGING", "CLOSING", "CLOSED", "FAILED"]) {
    assert.ok(endpoint.includes(state), state);
  }
  assert.ok(component.includes("Management: "));
});

test("production BFF registers execution truth before generic fallback", () => {
  assert.ok(server.includes('import executionTruthHandler from "./api/execution-truth"'));
  assert.ok(server.includes('app.get("/api/execution-truth"'));
  assert.ok(server.indexOf('app.get("/api/execution-truth"') < server.indexOf('app.all("/api/*"'));
});
