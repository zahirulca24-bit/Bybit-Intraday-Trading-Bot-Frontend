declare const process: { env: Record<string, string | undefined> };

type RequestLike = any;
type ResponseLike = any;

const BACKEND_URL = (
  process.env.BACKEND_API_URL ||
  process.env.VITE_API_BASE_URL ||
  "https://bybit-intraday-trading-bot.onrender.com"
).replace(/\/$/, "");
const ADMIN_TOKEN = (process.env.BACKEND_ADMIN_TOKEN || "").trim();
const ALLOWED = new Set(["summary", "winrate-breakdown", "drawdown-curve"]);

function sendJson(res: ResponseLike, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (String(req.method || "GET").toUpperCase() !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  if (!ADMIN_TOKEN) {
    sendJson(res, 503, { error: "Frontend BFF is missing BACKEND_ADMIN_TOKEN." });
    return;
  }

  const parsed = new URL(req.url || "/api/analytics", "https://frontend.local");
  const routedPath = String(
    req.query?.path ||
    parsed.searchParams.get("path") ||
    parsed.pathname.replace(/^\/api\/analytics\/?/, ""),
  );
  const endpoint = routedPath.replace(/^\/+|\/+$/g, "");
  if (!ALLOWED.has(endpoint)) {
    sendJson(res, 404, { error: "Unsupported analytics endpoint" });
    return;
  }

  const upstreamSearch = new URLSearchParams();
  for (const key of ["limit", "force"]) {
    const queryValue = req.query?.[key];
    const value = Array.isArray(queryValue)
      ? queryValue[0]
      : queryValue ?? parsed.searchParams.get(key);
    if (value !== null && value !== undefined) upstreamSearch.set(key, String(value));
  }
  const query = upstreamSearch.toString();
  const target = `${BACKEND_URL}/api/analytics/${endpoint}${query ? `?${query}` : ""}`;

  try {
    const headers = new Headers({ Accept: "application/json" });
    headers.set("Authorization", ["Bearer", ADMIN_TOKEN].join(" "));
    const response = await fetch(target, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const text = await response.text();
    let payload: any = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { error: text || `Backend request failed (${response.status})` };
    }
    sendJson(res, response.status, payload);
  } catch (error: any) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    sendJson(res, timeout ? 504 : 502, {
      error: timeout
        ? "Analytics backend timed out; retry shortly."
        : String(error?.message || "Unable to reach analytics backend"),
    });
  }
}
