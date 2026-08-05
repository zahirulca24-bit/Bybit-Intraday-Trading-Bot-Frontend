import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Cloud Run production server registers login and logout before the generic BFF fallback", async () => {
  const source = await read("cloud-run-server.ts");
  assert.ok(source.includes('app.post("/api/auth/login"'));
  assert.ok(source.includes('app.post("/api/auth/logout"'));
  assert.ok(source.indexOf('app.post("/api/auth/login"') < source.indexOf('app.all("/api/*"'));
});

test("Cloud Run generic mutation fallback requires and tags operator sessions", async () => {
  const source = await read("cloud-run-server.ts");
  assert.ok(source.includes("requireControlSession(req)"));
  assert.ok(source.includes('!["GET", "HEAD", "OPTIONS"].includes(method)'));
  assert.ok(source.includes('res.setHeader("X-Control-Auth-Error", "session")'));
  assert.ok(source.includes('code: "CONTROL_SESSION_INVALID"'));
});

test("Cloud Run keeps backend credentials server-only and exposes canonical auth routes", async () => {
  const server = await read("cloud-run-server.ts");
  const dockerfile = await read("Dockerfile");
  const envExample = await read(".env.example");
  const toggle = await read("api/bot-toggle.ts");
  const scanner = await read("api/scanner-live.ts");
  assert.ok(server.includes('app.post("/api/auth/login"'));
  assert.ok(server.includes('app.post("/api/auth/logout"'));
  assert.ok(server.includes('app.get("/api/auth/session"'));
  assert.ok(dockerfile.includes("cloud-run-server.ts"));
  assert.ok(envExample.includes("BACKEND_API_URL="));
  assert.ok(envExample.includes("BACKEND_ADMIN_TOKEN="));
  assert.ok(envExample.includes("FRONTEND_OPERATOR_PASSWORD_SCRYPT="));
  assert.ok(envExample.includes("FRONTEND_SESSION_SIGNING_SECRET="));
  assert.ok(!envExample.includes("VITE_BACKEND_ADMIN_TOKEN"));
  assert.ok(toggle.includes("bybit-intraday-backend-608992045433.asia-south1.run.app"));
  assert.ok(scanner.includes("bybit-intraday-backend-608992045433.asia-south1.run.app"));
});

test("browser retries only tagged control-session failures", async () => {
  const source = await read("src/services/operatorSession.ts");
  const toggle = await read("api/bot-toggle.ts");
  assert.ok(source.includes('nativeFetch("/api/auth/login"'));
  assert.ok(source.includes("window.prompt"));
  assert.ok(source.includes('response.headers.get("X-Control-Auth-Error") === "session"'));
  assert.ok(source.includes("response.status === 401 || response.status === 403"));
  assert.ok(toggle.includes('res.setHeader("X-Control-Auth-Error", "session")'));
  assert.ok(toggle.includes('code: "CONTROL_SESSION_INVALID"'));
  assert.ok(!source.includes("localStorage"));
  assert.ok(!source.includes("sessionStorage"));
  assert.ok(!source.includes("VITE_FRONTEND_CONTROL_TOKEN"));
});

test("settings authentication uses server-verified HttpOnly session only", async () => {
  const settings = await read("src/components/SettingsAndHealthView.tsx");
  const sessionRoute = await read("api/auth/session.ts");
  assert.ok(settings.includes("getOperatorSession"));
  assert.ok(settings.includes("loginOperator"));
  assert.ok(settings.includes("logoutOperator"));
  assert.ok(settings.includes("It is never stored in localStorage"));
  assert.ok(!settings.includes('localStorage.setItem("admin_token"'));
  assert.ok(!settings.includes('localStorage.getItem("admin_token"'));
  assert.ok(sessionRoute.includes("requireControlSession(req)"));
  assert.ok(sessionRoute.includes('authenticated: true'));
});

test("bot toggle verifies state and retries Cloud Run standby routing", async () => {
  const source = await read("api/bot-toggle.ts");
  assert.ok(source.includes("STATE_VERIFY_ATTEMPTS"));
  assert.ok(source.includes("STATE_VERIFY_DELAY_MS"));
  assert.ok(source.includes("LEADER_RETRY_ATTEMPTS"));
  assert.ok(source.includes("mutateThroughLeader"));
  assert.ok(source.includes("isStandbyResponse"));
  assert.ok(source.includes("waitForBotState(expectedRunning)"));
  assert.ok(source.includes("Cloud Run backend did not confirm the requested bot state within 3 seconds."));
  assert.equal((source.match(/mutateThroughLeader\("\/api\/bot\/stop"/g) || []).length, 1);
  assert.equal((source.match(/mutateThroughLeader\(\s*"\/api\/bot\/start"/g) || []).length, 1);
});

test("local development uses real BFF routes instead of synthetic trading data", async () => {
  const source = await read("server.ts");
  assert.ok(source.includes('import indexHandler from "./api/index"'));
  assert.ok(source.includes("createViteServer"));
  assert.ok(source.includes("All trading data is proxied"));
  assert.ok(!source.includes("Math.random"));
  assert.ok(!source.includes("positionsState"));
  assert.ok(!source.includes("generateKlines"));
});
