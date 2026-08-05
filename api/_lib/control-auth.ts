import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";

declare const process: { env: Record<string, string | undefined> };

type RequestLike = { headers?: Record<string, string | string[] | undefined> };
type ResponseLike = { setHeader(name: string, value: string | string[]): void };

const COOKIE_NAME = "bybit_control_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

export class ControlAuthError extends Error {
  constructor(public status: 401 | 403 | 429 | 503, message: string) {
    super(message);
    this.name = "ControlAuthError";
  }
}

function requiredEnv(name: string): string {
  const value = (process.env[name] || "").trim();
  if (!value) throw new ControlAuthError(503, `${name} is not configured.`);
  return value;
}

function safeEqualBuffers(left: Buffer, right: Buffer): boolean {
  if (left.length !== right.length) {
    timingSafeEqual(left, Buffer.alloc(left.length));
    return false;
  }
  return timingSafeEqual(left, right);
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

function sessionSignature(payload: string): string {
  return createHmac("sha256", requiredEnv("FRONTEND_SESSION_SIGNING_SECRET"))
    .update(payload)
    .digest("base64url");
}

export function verifyControlPassword(candidate: unknown): void {
  const encoded = requiredEnv("FRONTEND_OPERATOR_PASSWORD_SCRYPT");
  const supplied = typeof candidate === "string" ? candidate : "";
  if (!supplied) throw new ControlAuthError(401, "Operator password is required.");

  const [algorithm, salt, expectedHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex || !/^[a-f0-9]+$/i.test(expectedHex)) {
    throw new ControlAuthError(503, "Operator password hash configuration is invalid.");
  }

  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(supplied, salt, expected.length);
  if (!safeEqualBuffers(actual, expected)) {
    throw new ControlAuthError(403, "Operator credentials are invalid.");
  }
}

export function issueControlSession(res: ResponseLike): void {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const nonce = createHmac("sha256", requiredEnv("FRONTEND_SESSION_SIGNING_SECRET"))
    .update(`${expiresAt}:${Date.now()}:${Math.random()}`)
    .digest("base64url")
    .slice(0, 24);
  const payload = `${expiresAt}.${nonce}`;
  const value = `${payload}.${sessionSignature(payload)}`;
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
  );
}

export function clearControlSession(res: ResponseLike): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`);
}

export function requireControlSession(req: RequestLike): void {
  const session = readCookie(req, COOKIE_NAME);
  if (!session) throw new ControlAuthError(401, "Authorized operator session is required.");
  const parts = session.split(".");
  if (parts.length !== 3) throw new ControlAuthError(403, "Operator session is invalid.");
  const [expiresAtText, nonce, suppliedSignature] = parts;
  const payload = `${expiresAtText}.${nonce}`;
  const actual = Buffer.from(suppliedSignature, "utf8");
  const expected = Buffer.from(sessionSignature(payload), "utf8");
  if (!safeEqualBuffers(actual, expected)) throw new ControlAuthError(403, "Operator session is invalid.");

  const expiresAt = Number(expiresAtText);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) {
    throw new ControlAuthError(403, "Operator session has expired.");
  }
}
