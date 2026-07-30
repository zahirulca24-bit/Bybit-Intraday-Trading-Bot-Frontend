import { clearControlSession } from "../_lib/control-auth.js";

type RequestLike = any;
type ResponseLike = any;

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (String(req.method || "GET").toUpperCase() !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  clearControlSession(res);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ ok: true, authenticated: false }));
}
