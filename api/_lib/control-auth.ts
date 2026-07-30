import { createHmac, timingSafeEqual } from "node:crypto";

declare const process: { env: Record<string, string | undefined> };

type RequestLike = { headers?: Record<string, string | string[] | undefined> };
type ResponseLike = { setHeader(name: string, value: string | string[]): void };

const COOKIE_NAME = "bybit_control_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

export class ControlAuthError extends Error {
  constructor(public status: 401 | 403 | 503, message: string) {
    super(message);
    this.name = "ControlAuthError";
  }
}

function configuredSecret(): string {
  const secret = (process.env.FRONTEND_CONTROL_TOKEN || "").trim();
  if (!secret) throw new ControlAuthError(503, "Frontend control authentication is not configured.");
  return secret;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(a, Buffer.alloc(a.length));
    return false;
  }
  return timingSafeEqual(a, b);
}

function cookieHeader(req: RequestLike): string {
  const value = req.headers?.cookie;
  return Array.isArray(value) ? value.join("; ") : String(value || "");
}

function readCookie(req: RequestLike, name: string): string {
  for (const part of cookieHeader(req).split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function verifyControlToken(candidate: unknown): void {
  const secret = configuredSecret();
  const supplied = typeof candidate === "string" ? candidate.trim() : "";
  if (!supplied) throw new ControlAuthError(401, "Control token is required.");
  if (!safeEqual(supplied, secret)) throw new ControlAuthError(403, "Control token is invalid.");
}

export function issueControlSession(res: ResponseLike): void {
  const secret = configuredSecret();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = String(expiresAt);
  const value = `${payload}.${signature(payload, secret)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`);
}

export function clearControlSession(res: ResponseLike): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

export function requireControlSession(req: RequestLike): void {
  const secret = configuredSecret();
  const session = readCookie(req, COOKIE_NAME);
  if (!session) throw new ControlAuthError(401, "Authorized operator session is required.");
  const split = session.lastIndexOf(".");
  if (split <= 0) throw new ControlAuthError(403, "Operator session is invalid.");
  const payload = session.slice(0, split);
  const suppliedSignature = session.slice(split + 1);
  if (!safeEqual(suppliedSignature, signature(payload, secret))) {
    throw new ControlAuthError(403, "Operator session is invalid.");
  }
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new ControlAuthError(403, "Operator session has expired.");
  }
}
