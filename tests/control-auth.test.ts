import assert from "node:assert/strict";
import test from "node:test";

function freshModule() {
  return import(`../api/_lib/control-auth.ts?test=${Date.now()}-${Math.random()}`);
}

function responseMock() {
  const headers = new Map<string, string | string[]>();
  return { headers, setHeader(name: string, value: string | string[]) { headers.set(name, value); } };
}

test("missing server configuration returns 503", async () => {
  delete process.env.FRONTEND_CONTROL_TOKEN;
  const auth = await freshModule();
  assert.throws(() => auth.verifyControlToken("x"), (error: any) => error.status === 503);
});

test("missing token returns 401 and invalid token returns 403", async () => {
  process.env.FRONTEND_CONTROL_TOKEN = "expected-secret";
  const auth = await freshModule();
  assert.throws(() => auth.verifyControlToken(""), (error: any) => error.status === 401);
  assert.throws(() => auth.verifyControlToken("wrong-secret"), (error: any) => error.status === 403);
});

test("valid token issues a valid HttpOnly session", async () => {
  process.env.FRONTEND_CONTROL_TOKEN = "expected-secret";
  process.env.NODE_ENV = "test";
  const auth = await freshModule();
  auth.verifyControlToken("expected-secret");
  const res = responseMock();
  auth.issueControlSession(res);
  const setCookie = String(res.headers.get("Set-Cookie"));
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
  const cookie = setCookie.split(";")[0];
  assert.doesNotThrow(() => auth.requireControlSession({ headers: { cookie } }));
});
