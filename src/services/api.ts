import {
  BotStatusResponse,
  AccountSummary,
  Position,
  OrderLifecycle,
  Kline,
  BotLog,
  ScannerDataResponse,
  WorkerExecutionResponse,
  WorkerSetupsResponse,
  WorkerStatusResponse,
  WorkerSymbolsResponse,
  ReplayJournalResponse,
  ReplayPerformanceResponse,
  ReplaySafetyStatus,
  ReplaySession,
  ReplaySessionsResponse,
  ReplayStartRequest,
  ReplayStartResponse,
  ReplayStepResponse,
} from "../types";

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
// If VITE_API_BASE_URL is configured, use it in both development and static production builds.
// Without it, keep same-origin /api behavior for deployments that run the frontend BFF server.
const API_BASE = configuredApiBase;
const REQUEST_TIMEOUT_MS = 35_000;
const RETRY_DELAYS_MS = [750, 2_000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 502 || status === 503 || status === 504;
}

async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(input, {
        ...init,
        cache: "no-store",
        signal: controller.signal,
      });

      if (!isRetryableStatus(response.status) || attempt === RETRY_DELAYS_MS.length) {
        return response;
      }

      lastError = new Error(`Temporary API response (${response.status})`);
    } catch (error) {
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length) {
        const message = error instanceof DOMException && error.name === "AbortError"
          ? "Request timed out while the Render service was waking up."
          : "Temporary network failure while reaching the frontend gateway.";
        throw new Error(message, { cause: error });
      }
    } finally {
      window.clearTimeout(timeout);
    }

    await sleep(RETRY_DELAYS_MS[attempt]);
  }

  throw lastError instanceof Error ? lastError : new Error("Unable to reach the frontend gateway.");
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let message = `API Request Failed (${res.status})`;
    try {
      const parsed = JSON.parse(text);
      if (parsed.error) message = parsed.error;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }
  return res.json();
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetchWithRetry(`${API_BASE}${path}`);
  return handleResponse<T>(res);
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetchWithRetry(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

function replaySessionPath(sessionId: string, suffix = ""): string {
  return `/api/replay/sessions/${encodeURIComponent(sessionId)}${suffix}`;
}

export const api = {
  async getStatus(): Promise<BotStatusResponse> { return getJson<BotStatusResponse>("/api/status"); },

  async toggleBot(): Promise<{
    success: boolean;
    isRunning: boolean;
    reason?: string;
    authoritative?: boolean;
    verifiedAt?: number;
  }> {
    return postJson("/api/bot/toggle");
  },

  async getRiskPolicy(): Promise<any> {
    return getJson<any>("/api/risk/policy");
  },

  async getAccount(): Promise<AccountSummary> { return getJson<AccountSummary>("/api/account"); },
  async getPositions(): Promise<Position[]> { return getJson<Position[]>("/api/positions"); },

  async closePosition(id: string): Promise<{ success: boolean }> {
    return postJson<{ success: boolean }>("/api/positions/close", { id });
  },

  async updateSLTP(id: string, stopLoss?: number, takeProfit?: number): Promise<{ success: boolean }> {
    return postJson<{ success: boolean }>("/api/positions/update-sltp", { id, stopLoss, takeProfit });
  },

  async getOrderLifecycles(): Promise<OrderLifecycle[]> { return getJson<OrderLifecycle[]>("/api/orders/lifecycle"); },
  async getKlines(symbol: string, timeframe: string): Promise<Kline[]> { return getJson<Kline[]>(`/api/klines?symbol=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`); },
  async getLogs(filter: string = "ALL"): Promise<BotLog[]> { return getJson<BotLog[]>(`/api/logs?filter=${encodeURIComponent(filter)}`); },
  async getScanner(): Promise<ScannerDataResponse> { return getJson<ScannerDataResponse>("/api/scanner"); },
  async getWorkerStatus(): Promise<WorkerStatusResponse> { return getJson<WorkerStatusResponse>("/api/workers/status"); },
  async getWorkerSymbols(): Promise<WorkerSymbolsResponse> { return getJson<WorkerSymbolsResponse>("/api/workers/symbols"); },
  async getWorkerSetups(): Promise<WorkerSetupsResponse> { return getJson<WorkerSetupsResponse>("/api/workers/setups"); },
  async getWorkerExecution(): Promise<WorkerExecutionResponse> { return getJson<WorkerExecutionResponse>("/api/workers/execution"); },

  async getAnalyticsSummary(force = false): Promise<any> {
    return getJson<any>(`/api/analytics/summary?limit=200${force ? "&force=1" : ""}`);
  },
  async getAnalyticsBreakdown(force = false): Promise<any> {
    return getJson<any>(`/api/analytics/winrate-breakdown?limit=200${force ? "&force=1" : ""}`);
  },
  async getAnalyticsDrawdown(force = false): Promise<any> {
    return getJson<any>(`/api/analytics/drawdown-curve?limit=200${force ? "&force=1" : ""}`);
  },

  async getReplayStatus(): Promise<ReplaySafetyStatus> {
    return getJson<ReplaySafetyStatus>("/api/replay/status");
  },

  async listReplaySessions(limit = 50, status?: string): Promise<ReplaySessionsResponse> {
    const query = new URLSearchParams({ limit: String(limit) });
    if (status) query.set("status", status);
    return getJson<ReplaySessionsResponse>(`/api/replay/sessions?${query.toString()}`);
  },

  async startReplaySession(payload: ReplayStartRequest): Promise<ReplayStartResponse> {
    return postJson<ReplayStartResponse>("/api/replay/start", payload);
  },

  async getReplaySession(sessionId: string): Promise<{ ok: boolean; session: ReplaySession }> {
    return getJson<{ ok: boolean; session: ReplaySession }>(replaySessionPath(sessionId));
  },

  async stepReplaySession(
    sessionId: string,
    expectedCursorTime: number | null,
    steps: number,
    requestId: string,
  ): Promise<ReplayStepResponse> {
    return postJson<ReplayStepResponse>("/api/replay/step", {
      sessionId,
      expectedCursorTime,
      steps,
      requestId,
    });
  },

  async resetReplaySession(sessionId: string): Promise<{ ok: boolean; reset: boolean; session: ReplaySession }> {
    return postJson<{ ok: boolean; reset: boolean; session: ReplaySession }>(replaySessionPath(sessionId, "/reset"), {});
  },

  async getReplayPerformance(sessionId: string, curveLimit = 200): Promise<ReplayPerformanceResponse> {
    const query = new URLSearchParams({ includeEquityCurve: "true", curveLimit: String(curveLimit) });
    return getJson<ReplayPerformanceResponse>(`${replaySessionPath(sessionId, "/performance")}?${query.toString()}`);
  },

  async getReplayJournal(
    sessionId: string,
    options: {
      limit?: number;
      direction?: "asc" | "desc";
      cursorSequence?: number | null;
      category?: string;
      eventType?: string;
      includePayload?: boolean;
      includeTrades?: boolean;
      tradeStatus?: string;
      tradeLimit?: number;
    } = {},
  ): Promise<ReplayJournalResponse> {
    const query = new URLSearchParams({
      limit: String(options.limit ?? 50),
      direction: options.direction ?? "desc",
      includePayload: String(options.includePayload ?? true),
      includeTrades: String(options.includeTrades ?? true),
      tradeLimit: String(options.tradeLimit ?? 50),
    });
    if (options.cursorSequence !== undefined && options.cursorSequence !== null) {
      query.set("cursorSequence", String(options.cursorSequence));
    }
    if (options.category) query.set("category", options.category);
    if (options.eventType) query.set("eventType", options.eventType);
    if (options.tradeStatus) query.set("tradeStatus", options.tradeStatus);
    return getJson<ReplayJournalResponse>(`${replaySessionPath(sessionId, "/journal")}?${query.toString()}`);
  },

  async updateConfig(config: { routerMode?: string; durableState?: string; apiKey?: string; apiSecret?: string }) {
    return postJson<{ success: boolean }>("/api/config", config);
  },
};