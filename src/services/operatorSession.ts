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

export function installOperatorSessionFetch(): void {
  const nativeFetch = window.fetch.bind(window);
  let loginInFlight: Promise<boolean> | null = null;

  async function login(): Promise<boolean> {
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
      let message = `Operator login failed (${response.status})`;
      try {
        const payload = await response.json();
        if (payload?.error) message = String(payload.error);
      } catch {
        // Keep the status-based error when the response is not JSON.
      }
      window.alert(message);
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

    loginInFlight ||= login().finally(() => {
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
