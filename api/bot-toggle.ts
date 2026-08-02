import { ControlAuthError, requireControlSession } from "./_lib/control-auth.js";

declare const process: { env: Record<string, string | undefined> };
type RequestLike = any;
type ResponseLike = any;

class UpstreamError extends Error {
  constructor(public status: number, message: string, public payload?: any) {
    super(message);
    this.name = "UpstreamError";
  }
}

const DEFAULT_BACKEND_URL = "https://bybit-intraday-backend-608992045433.asia-south1.run.app";
const BACKEND_URL = (process.env.BACKEND_API_URL || DEFAULT_BACKEND_URL).replace(/\/$/, "");
const ADMIN_TOKEN = (process.env.BACKEND_ADMIN_TOKEN || "").trim();
const STATE_VERIFY_ATTEMPTS = 6;
const STATE_VERIFY_DELAY_MS = 500;
const LEADER_RETRY_ATTEMPTS = 3;

function sendJson(res: ResponseLike, status: number, payload: any): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

function textValue(value: any, fallback: string): string {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backendJson(path: string, init: RequestInit = {}): Promise<any> {
  if (!ADMIN_TOKEN) throw new UpstreamError(503, "Vercel server is missing BACKEND_ADMIN_TOKEN.");
  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${ADMIN_TOKEN}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let payload: any = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text };
  }
  if (!response.ok) {
    throw new UpstreamError(
      response.status,
      textValue(payload?.error || payload?.reason || payload?.message, `Backend request failed (${response.status})`),
      payload,
    );
  }
  return payload;
}

function isStandbyResponse(error: unknown): boolean {
  if (!(error instanceof UpstreamError) || error.status !== 503) return false;
  const leadership = error.payload?.runtimeLeadership || error.payload?.upstream?.runtimeLeadership || {};
  const status = textValue(leadership?.status, "").toLowerCase();
  const reason = textValue(error.payload?.reason || error.message, "").toLowerCase();
  return status === "standby" || reason.includes("not the automatic-execution leader");
}

async function mutateThroughLeader(path: string, body: string): Promise<any> {
  let lastError: unknown;
  for (let attempt = 0; attempt < LEADER_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await backendJson(path, { method: "POST", body });
    } catch (error) {
      lastError = error;
      if (!isStandbyResponse(error) || attempt === LEADER_RETRY_ATTEMPTS - 1) throw error;
      await sleep(350 * (attempt + 1));
    }
  }
  throw lastError;
}

async function waitForBotState(expectedRunning: boolean): Promise<{ isRunning: boolean; status: any }> {
  let latestStatus: any = null;
  let latestRunning = !expectedRunning;

  for (let attempt = 0; attempt < STATE_VERIFY_ATTEMPTS; attempt += 1) {
    latestStatus = await backendJson("/api/bot/status");
    latestRunning = (latestStatus?.bot || latestStatus || {})?.enabled === true;
    if (latestRunning === expectedRunning) {
      return { isRunning: latestRunning, status: latestStatus };
    }
    if (attempt < STATE_VERIFY_ATTEMPTS - 1) await sleep(STATE_VERIFY_DELAY_MS);
  }

  return { isRunning: latestRunning, status: latestStatus };
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  try {
    if (String(req.method || "GET").toUpperCase() !== "POST") {
      res.setHeader("Allow", "POST");
      throw new UpstreamError(405, "Method not allowed");
    }
    requireControlSession(req);

    const before = await backendJson("/api/bot/status");
    const bot = before?.bot || before || {};
    const wasRunning = bot?.enabled === true;
    const expectedRunning = !wasRunning;

    const mutation = wasRunning
      ? await mutateThroughLeader("/api/bot/stop", "{}")
      : await mutateThroughLeader(
          "/api/bot/start",
          JSON.stringify({
            symbol: textValue(bot?.symbol, "BTCUSDT"),
            interval: textValue(bot?.interval, "5"),
            mode: textValue(bot?.mode, "conservative"),
            riskPerTradePct: 2.0,
          }),
        );

    if (mutation?.ok === false) {
      throw new UpstreamError(
        409,
        textValue(mutation?.reason || mutation?.error, "Backend blocked bot state change"),
        mutation,
      );
    }

    const verified = await waitForBotState(expectedRunning);
    if (verified.isRunning !== expectedRunning) {
      throw new UpstreamError(409, "Cloud Run backend did not confirm the requested bot state within 3 seconds.", {
        mutation,
        status: verified.status,
        expectedRunning,
      });
    }

    sendJson(res, 200, {
      success: true,
      isRunning: verified.isRunning,
      authoritative: true,
      verifiedAt: Date.now(),
    });
  } catch (error: any) {
    if (error instanceof ControlAuthError) {
      res.setHeader("X-Control-Auth-Error", "session");
      sendJson(res, error.status, { error: error.message, code: "CONTROL_SESSION_INVALID" });
      return;
    }
    if (error instanceof UpstreamError) {
      sendJson(res, error.status, { error: error.message, upstream: error.payload });
      return;
    }
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    sendJson(res, timeout ? 504 : 502, {
      error: timeout
        ? "Google Cloud Run backend timed out. Check backend readiness and retry."
        : textValue(error?.message, "Unable to reach Google Cloud Run backend"),
    });
  }
}
