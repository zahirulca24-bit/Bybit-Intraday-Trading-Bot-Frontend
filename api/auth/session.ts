import { ControlAuthError, requireControlSession } from "../_lib/control-auth.js";

type RequestLike = any;
type ResponseLike = any;

function sendJson(res: ResponseLike, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (String(req.method || "GET").toUpperCase() !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    requireControlSession(req);
    sendJson(res, 200, { ok: true, authenticated: true });
  } catch (error) {
    const authError = error as ControlAuthError;
    res.setHeader("X-Control-Auth-Error", "session");
    sendJson(res, authError.status || 500, {
      ok: false,
      authenticated: false,
      error: authError.message || "Unable to validate operator session",
      code: "CONTROL_SESSION_INVALID",
    });
  }
}
