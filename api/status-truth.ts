declare const process: { env: Record<string, string | undefined> };

type AnyRecord = Record<string, any>;
type RequestLike = any;
type ResponseLike = any;

const DEFAULT_BACKEND_URL = "https://bybit-intraday-backend-608992045433.asia-south1.run.app";
const BACKEND_URL = (process.env.BACKEND_API_URL || DEFAULT_BACKEND_URL).replace(/\/$/, "");
const ADMIN_TOKEN = (process.env.BACKEND_ADMIN_TOKEN || "").trim();

function sendJson(res: ResponseLike, status: number, payload: any): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

function text(value: any, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function numberValue(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function timestampIso(value: any): string {
  const numeric = numberValue(value, 0);
  const date = numeric > 0
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(text(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function backendJson(path: string): Promise<any> {
  if (!ADMIN_TOKEN) throw new Error("BACKEND_ADMIN_TOKEN is not configured");
  const response = await fetch(`${BACKEND_URL}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${ADMIN_TOKEN}` },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(text(body?.error || body?.message, `Backend request failed (${response.status})`));
  return body;
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (text(req?.method, "GET").toUpperCase() !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const started = Date.now();
  try {
    const [botStatus, durableStatus, workerStatus] = await Promise.all([
      backendJson("/api/bot/status"),
      backendJson("/api/durable-state/status"),
      backendJson("/api/workers/status"),
    ]);

    const bot = botStatus?.bot || botStatus || {};
    const runtime = workerStatus?.runtime || {};
    const backend = text(durableStatus?.backend, "unknown").toLowerCase();
    const degraded = Boolean(durableStatus?.degraded);
    const restartSafe = Boolean(durableStatus?.restartSafe);
    const persistentPathConfigured = Boolean(durableStatus?.persistentPathConfigured);
    const durableVerified = backend === "postgresql" && persistentPathConfigured && restartSafe && !degraded;
    const leadership = botStatus?.runtimeLeadership || bot?.runtimeLeadership || {};
    const leader = Boolean(leadership?.leader ?? bot?.runtimeExecutionLeader);
    const threadAlive = Boolean(runtime?.threadAlive);
    const enabled = Boolean(bot?.enabled);
    const executionReady = durableVerified && leader && threadAlive;
    const lastRunAt = runtime?.lastLoopAt || runtime?.lastSymbolRunAt || bot?.lastRunAt || bot?.lastScanAt || Date.now();

    sendJson(res, 200, {
      isRunning: enabled && threadAlive,
      bybitMode: "BYBIT_DEMO",
      backendConnected: true,
      lastScanTime: timestampIso(lastRunAt),
      nextScanSeconds: numberValue(bot?.scanSeconds || runtime?.settings?.symbolIntervalSeconds, 30),
      apiLatencyMs: Date.now() - started,
      durableState: durableVerified ? "PERSISTENT" : "DEGRADED",
      durableBackend: backend === "postgres" ? "postgresql" : backend,
      persistentPathConfigured,
      stateDegraded: !durableVerified,
      databasePath: durableVerified ? "PostgreSQL / DATABASE_URL" : "Persistent backend unverified",
      journalPersistenceStatus: durableVerified ? "POSTGRESQL" : "UNVERIFIED",
      restartSafe,
      automaticExecutionAllowed: Boolean(durableStatus?.automaticExecutionAllowed) && executionReady,
      startupReconciliationStatus: text(durableStatus?.startupReconciliation?.status || durableStatus?.startupReconciliationStatus, "ready"),
      executionReadinessStatus: executionReady ? "ready" : "blocked",
      migrationVersion: durableStatus?.migrationVersion ?? null,
      requiredMigrationVersion: durableStatus?.requiredMigrationVersion ?? durableStatus?.migrationVersion ?? null,
      durableError: durableStatus?.error || null,
      routerMode: text(bot?.mode || botStatus?.mode, "balanced"),
      version: text(bot?.engineOverview?.version || botStatus?.serverVersion || bot?.version, "v2-demo"),
      authConfigured: Boolean(ADMIN_TOKEN),
      runtimeLeadership: leadership,
      workerRuntime: runtime,
    });
  } catch (error: any) {
    sendJson(res, 502, { error: text(error?.message, "Unable to load canonical runtime health") });
  }
}
