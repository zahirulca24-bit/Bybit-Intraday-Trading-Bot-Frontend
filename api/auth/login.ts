import { ControlAuthError, issueControlSession, verifyControlToken } from "../_lib/control-auth.js";

type RequestLike = any;
type ResponseLike = any;

function sendJson(res: ResponseLike, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (String(req.method || "GET").toUpperCase() !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    verifyControlToken(req.body?.token);
    issueControlSession(res);
    sendJson(res, 200, { ok: true, authenticated: true });
  } catch (error) {
    const authError = error as ControlAuthError;
    sendJson(res, authError.status || 500, { error: authError.message || "Unable to authenticate operator" });
  }
}
