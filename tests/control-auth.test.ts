import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";

function freshModule() {
  return import(`../api/_lib/control-auth.ts?test=${Date.now()}-${Math.random()}`);
}

function responseMock() {
  const headers = new Map<string, string | string[]>();
  return { headers, setHeader(name: string, value: string | string[]) { headers.set(name, value); } };
}

function configure(password = "expected-secret") {
  const salt = "test-salt";
  process.env.FRONTEND_OPERATOR_PASSWORD_SCRYPT = `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;
  process.env.FRONTEND_SESSION_SIGNING_SECRET = "independent-session-signing-secret-for-tests";
}

test("missing server configuration returns 503", async () => {
  delete process.env.FRONTEND_OPERATOR_PASSWORD_SCRYPT;
  delete process.env.FRONTEND_SESSION_SIGNING_SECRET;
  const auth = await freshModule();
  assert.throws(() => auth.verifyControlPassword("x"), (error: any) => error.status === 503);
});

test("missing password returns 401 and invalid password returns 403", async () => {
  configure();
  const auth = await freshModule();
  assert.throws(() => auth.verifyControlPassword(""), (error: any) => error.status === 401);
  assert.throws(() => auth.verifyControlPassword("wrong-secret"), (error: any) => error.status === 403);
});

test("valid password issues a valid HttpOnly session", async () => {
  configure();
  process.env.NODE_ENV = "test";
  const auth = await freshModule();
  auth.verifyControlPassword("expected-secret");
  const res = responseMock();
  auth.issueControlSession(res);
  const setCookie = String(res.headers.get("Set-Cookie"));
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(";")[0];
  assert.doesNotThrow(() => auth.requireControlSession({ headers: { cookie } }));
});
