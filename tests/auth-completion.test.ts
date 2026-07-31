import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Render registers login and logout before the generic BFF fallback", async () => {
  const source = await read("render-server.ts");
  assert.ok(source.includes('app.post("/api/auth/login"'));
  assert.ok(source.includes('app.post("/api/auth/logout"'));
  assert.ok(source.indexOf('app.post("/api/auth/login"') < source.indexOf('app.all("/api/*"'));
});

test("Render generic mutation fallback requires and tags operator sessions", async () => {
  const source = await read("render-server.ts");
  assert.ok(source.includes("requireControlSession(req)"));
  assert.ok(source.includes('!["GET", "HEAD", "OPTIONS"].includes(method)'));
  assert.ok(source.includes('res.setHeader("X-Control-Auth-Error", "session")'));
  assert.ok(source.includes('code: "CONTROL_SESSION_INVALID"'));
});

test("Vercel exposes canonical auth routes including session verification", async () => {
  const config = await read("vercel.json");
  const middleware = await read("middleware.ts");
  assert.ok(config.includes('"api/auth/session.ts"'));
  assert.ok(config.includes('"source": "/api/auth/session"'));
  assert.ok(middleware.includes('matcher: "/api/:path*"'));
  assert.ok(middleware.includes('"/api/auth/login"'));
  assert.ok(middleware.includes('"/api/auth/logout"'));
  assert.ok(middleware.includes('"/api/bot/toggle"'));
  assert.ok(middleware.includes("Legacy generic mutation endpoint is disabled"));
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

test("bot toggle waits for the asynchronous authoritative state without repeating the mutation", async () => {
  const source = await read("api/bot-toggle.ts");
  assert.ok(source.includes("STATE_VERIFY_ATTEMPTS"));
  assert.ok(source.includes("STATE_VERIFY_DELAY_MS"));
  assert.ok(source.includes("waitForBotState(expectedRunning)"));
  assert.ok(source.includes("Backend did not confirm the requested bot state within 5 seconds."));
  assert.equal((source.match(/backendJson\("\/api\/bot\/stop"/g) || []).length, 1);
  assert.equal((source.match(/backendJson\("\/api\/bot\/start"/g) || []).length, 1);
});
