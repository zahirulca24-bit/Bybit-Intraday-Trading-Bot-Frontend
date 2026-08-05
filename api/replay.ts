declare const process: { env: Record<string, string | undefined> };

type RequestLike = any;
type ResponseLike = any;

const DEFAULT_BACKEND_URL = "https://bybit-intraday-trading-bot.onrender.com";
const BACKEND_URL = (process.env.BACKEND_API_URL || DEFAULT_BACKEND_URL).replace(/\/$/, "");
const ADMIN_TOKEN = (process.env.BACKEND_ADMIN_TOKEN || "").trim();
const SESSION_ID = "[A-Za-z0-9_-]{8,80}";
const ALLOWED_GET_PATHS = [
  /^\/api\/replay\/status$/,
  /^\/api\/replay\/sessions$/,
  new RegExp(`^/api/replay/sessions/${SESSION_ID}$`),
  new RegExp(`^/api/replay/sessions/${SESSION_ID}/performance$`),
  new RegExp(`^/api/replay/sessions/${SESSION_ID}/journal$`),
  new RegExp(`^/api/replay/sessions/${SESSION_ID}/visualization$`),
];
const ALLOWED_POST_PATHS = [
  /^\/api\/replay\/start$/,
  /^\/api\/replay\/step$/,
  new RegExp(`^/api/replay/sessions/${SESSION_ID}/reset$`),
];

function sendJson(res: ResponseLike, status: number, payload: unknown): void {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.json(payload);
}

function replayTarget(req: RequestLike, method: string): { path: string; target: string } {
  const source = String(req.originalUrl || req.url || "");
  const parsed = new URL(source, "https://render.local");
  const allowed = method === "GET" ? ALLOWED_GET_PATHS : method === "POST" ? ALLOWED_POST_PATHS : [];
  if (!allowed.some((pattern) => pattern.test(parsed.pathname))) {
    throw new Error("Unsupported Historical Replay route.");
  }
  return { path: parsed.pathname, target: `${parsed.pathname}${parsed.search}` };
}

export default async function replayHandler(req: RequestLike, res: ResponseLike): Promise<void> {
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    sendJson(res, 405, { ok: false, error: `Method ${method} not allowed` });
    return;
  }
  if (!ADMIN_TOKEN) {
    sendJson(res, 503, {
      ok: false,
      error: "Render frontend is missing BACKEND_ADMIN_TOKEN.",
    });
    return;
  }

  try {
    const { target } = replayTarget(req, method);
    const headers = new Headers({
      Accept: "application/json",
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    });
    const init: RequestInit = {
      method,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(35_000),
    };
    if (method === "POST") {
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify({
        ...(req.body || {}),
        runtimeMode: "historical_replay",
        executionMode: "simulated_only",
        externalExecutionAllowed: false,
      });
    }

    const upstream = await fetch(`${BACKEND_URL}${target}`, init);
    const text = await upstream.text();
    let payload: unknown = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { ok: false, error: text };
      }
    }
    sendJson(res, upstream.status, payload);
  } catch (error: any) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    const unsupported = String(error?.message || "").includes("Unsupported Historical Replay route");
    sendJson(res, unsupported ? 404 : timeout ? 504 : 502, {
      ok: false,
      error: unsupported
        ? "Unsupported Historical Replay route."
        : timeout
          ? "Historical Replay backend timed out. Render may still be waking up."
          : String(error?.message || "Unable to reach Historical Replay backend."),
    });
  }
}