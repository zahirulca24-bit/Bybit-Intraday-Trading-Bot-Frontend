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

test("Render generic mutation fallback requires an operator session", async () => {
  const source = await read("render-server.ts");
  assert.ok(source.includes("requireControlSession(req)"));
  assert.ok(source.includes('!["GET", "HEAD", "OPTIONS"].includes(method)'));
});

test("Vercel blocks rewritten generic mutation routes", async () => {
  const source = await read("middleware.ts");
  assert.ok(source.includes('matcher: "/api/:path*"'));
  assert.ok(source.includes('"/api/auth/login"'));
  assert.ok(source.includes('"/api/auth/logout"'));
  assert.ok(source.includes('"/api/bot/toggle"'));
  assert.ok(source.includes("Legacy generic mutation endpoint is disabled"));
});

test("browser reauthenticates rejected sessions without storing the control token", async () => {
  const source = await read("src/services/operatorSession.ts");
  assert.ok(source.includes('nativeFetch("/api/auth/login"'));
  assert.ok(source.includes("window.prompt"));
  assert.ok(source.includes("response.status === 401 || response.status === 403"));
  assert.ok(!source.includes("localStorage"));
  assert.ok(!source.includes("sessionStorage"));
  assert.ok(!source.includes("VITE_FRONTEND_CONTROL_TOKEN"));
});
