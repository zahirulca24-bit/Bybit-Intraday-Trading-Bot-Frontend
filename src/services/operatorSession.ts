const PRIVILEGED_PATHS = new Set([
  "/api/bot/toggle",
  "/api/config",
  "/api/positions/close",
  "/api/positions/update-sltp",
]);

function requestPath(input: RequestInfo | URL): string {
  const raw = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  return new URL(raw, window.location.origin).pathname;
}

function isPrivilegedMutation(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  return method !== "GET" && PRIVILEGED_PATHS.has(requestPath(input));
}

function isControlSessionFailure(response: Response): boolean {
  return (response.status === 401 || response.status === 403)
    && response.headers.get("X-Control-Auth-Error") === "session";
}

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.clone().json();
    return payload?.error ? String(payload.error) : fallback;
  } catch {
    return fallback;
  }
}

export async function loginOperator(token: string): Promise<void> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ token }),
  });
  if (!response.ok) {
    throw new Error(await responseMessage(response, `Operator login failed (${response.status})`));
  }
}

export async function logoutOperator(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await responseMessage(response, `Operator logout failed (${response.status})`));
  }
}

export async function getOperatorSession(): Promise<boolean> {
  const response = await fetch("/api/auth/session", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) return false;
  if (!response.ok) {
    throw new Error(await responseMessage(response, `Session check failed (${response.status})`));
  }
  const payload = await response.json();
  return payload?.authenticated === true;
}

export function installOperatorSessionFetch(): void {
  const nativeFetch = window.fetch.bind(window);
  let loginInFlight: Promise<boolean> | null = null;

  async function promptLogin(): Promise<boolean> {
    const token = window.prompt("Operator control token required");
    if (!token) return false;

    const response = await nativeFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      window.alert(await responseMessage(response, `Operator login failed (${response.status})`));
      return false;
    }
    return true;
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await nativeFetch(input, {
      ...init,
      credentials: init?.credentials || "same-origin",
    });

    if (!isControlSessionFailure(response) || !isPrivilegedMutation(input, init)) return response;

    loginInFlight ||= promptLogin().finally(() => {
      loginInFlight = null;
    });
    const authenticated = await loginInFlight;
    if (!authenticated) return response;

    return nativeFetch(input, {
      ...init,
      credentials: init?.credentials || "same-origin",
    });
  };
}
