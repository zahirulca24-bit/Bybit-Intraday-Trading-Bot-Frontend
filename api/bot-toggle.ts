declare const process: { env: Record<string, string | undefined> };

type RequestLike = any;
type ResponseLike = any;

class UpstreamError extends Error {
  status: number;
  payload: any;

  constructor(status: number, message: string, payload?: any) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
    this.payload = payload;
  }
}

const DEFAULT_BACKEND_URL = "https://bybit-intraday-trading-bot.onrender.com";
const BACKEND_URL = (
  process.env.BACKEND_API_URL ||
  process.env.VITE_API_BASE_URL ||
  DEFAULT_BACKEND_URL
).replace(/\/$/, "");
const ADMIN_TOKEN = (process.env.BACKEND_ADMIN_TOKEN || "").trim();

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

function enabledFromStatus(payload: any): boolean {
  const bot = payload?.bot || payload || {};
  return bot?.enabled === true;
}

async function backendJson(path: string, init: RequestInit = {}): Promise<any> {
  if (!ADMIN_TOKEN) {
    throw new UpstreamError(
      503,
      "Vercel server is missing BACKEND_ADMIN_TOKEN. Configure it as a server-side environment variable.",
    );
  }

  const headers = new Headers(init.headers || {});
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${ADMIN_TOKEN}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });

  const text = await response.text();
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!response.ok) {
    throw new UpstreamError(
      response.status,
      textValue(
        payload?.error || payload?.reason || payload?.message || payload?.retMsg,
        `Backend request failed (${response.status})`,
      ),
      payload,
    );
  }
  return payload;
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  try {
    if (String(req.method || "GET").toUpperCase() !== "POST") {
      res.setHeader("Allow", "POST");
      throw new UpstreamError(405, "Method not allowed");
    }

    const before = await backendJson("/api/bot/status");
    const bot = before?.bot || before || {};
    const wasRunning = enabledFromStatus(before);
    const expectedRunning = !wasRunning;
    let mutation: any;

    if (wasRunning) {
      mutation = await backendJson("/api/bot/stop", {
        method: "POST",
        body: "{}",
      });
    } else {
      // This value is the legacy start-contract handshake required by the
      // backend validator. Actual order risk is selected later by the A+/A
      // quality-based sizing engine and is never taken from this field.
      const startPayload = {
        symbol: textValue(bot?.symbol, "BTCUSDT"),
        interval: textValue(bot?.interval, "5"),
        mode: textValue(bot?.mode, "conservative"),
        riskPerTradePct: 2.0,
      };

      mutation = await backendJson("/api/bot/start", {
        method: "POST",
        body: JSON.stringify(startPayload),
      });
      if (mutation?.ok === false) {
        throw new UpstreamError(
          409,
          textValue(mutation?.reason || mutation?.error, "Backend blocked bot startup"),
          mutation,
        );
      }
    }

    const after = await backendJson("/api/bot/status");
    const isRunning = enabledFromStatus(after);
    const afterBot = after?.bot || after || {};

    if (isRunning !== expectedRunning) {
      throw new UpstreamError(
        409,
        `Backend did not confirm the requested ${expectedRunning ? "RUNNING" : "STOPPED"} state. Current authoritative state is ${isRunning ? "RUNNING" : "STOPPED"}.`,
        { mutation, status: after },
      );
    }

    sendJson(res, 200, {
      success: true,
      isRunning,
      reason: textValue(
        afterBot?.lastReason || mutation?.reason || mutation?.message,
        isRunning ? "Backend confirmed bot running." : "Backend confirmed bot stopped.",
      ),
      authoritative: true,
      verifiedAt: Date.now(),
    });
  } catch (error: any) {
    if (error instanceof UpstreamError) {
      sendJson(res, error.status, {
        error: error.message,
        upstream: error.payload,
      });
      return;
    }

    const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    sendJson(res, isTimeout ? 504 : 502, {
      error: isTimeout
        ? "Bybit Demo backend timed out. Render may be waking up; retry shortly."
        : textValue(error?.message, "Unable to reach Bybit Demo backend"),
    });
  }
}
