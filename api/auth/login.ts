import { ControlAuthError, issueControlSession, verifyControlPassword } from "../_lib/control-auth.js";

type RequestLike = any;
type ResponseLike = any;

type AttemptState = { failures: number; windowStartedAt: number; lockedUntil: number };
const attempts = new Map<string, AttemptState>();
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function sendJson(res: ResponseLike, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function clientKey(req: RequestLike): string {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || String(req.socket?.remoteAddress || "unknown");
}

function stateFor(key: string, now: number): AttemptState {
  const current = attempts.get(key);
  if (!current || now - current.windowStartedAt >= WINDOW_MS) {
    const fresh = { failures: 0, windowStartedAt: now, lockedUntil: 0 };
    attempts.set(key, fresh);
    return fresh;
  }
  return current;
}

function assertNotLocked(key: string, now: number): AttemptState {
  const state = stateFor(key, now);
  if (state.lockedUntil > now) {
    throw new ControlAuthError(429, "Too many failed login attempts. Try again later.");
  }
  return state;
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (String(req.method || "GET").toUpperCase() !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const now = Date.now();
  const key = clientKey(req);
  try {
    const state = assertNotLocked(key, now);
    verifyControlPassword(req.body?.token);
    attempts.delete(key);
    issueControlSession(res);
    sendJson(res, 200, { ok: true, authenticated: true });
  } catch (error) {
    const authError = error as ControlAuthError;
    if (authError.status === 401 || authError.status === 403) {
      const state = stateFor(key, now);
      state.failures += 1;
      if (state.failures >= MAX_FAILURES) state.lockedUntil = now + LOCK_MS;
    }
    if (authError.status === 429) res.setHeader("Retry-After", String(Math.ceil(LOCK_MS / 1000)));
    sendJson(res, authError.status || 500, {
      error: authError.status === 403 ? "Operator credentials are invalid." : authError.message || "Unable to authenticate operator",
    });
  }
}
