/**
 * Minimal mock backend for Playwright operator-journey E2E tests.
 *
 * Serves the API endpoints that the frontend BFF proxies, using
 * deterministic test fixtures. No real Bybit credentials are used.
 * No live or demo orders are placed.
 */
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { once } from "node:events";

const E2E_BACKEND_TOKEN = "e2e-playwright-backend-token";

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function authOk(req: IncomingMessage): boolean {
  return req.headers.authorization === `Bearer ${E2E_BACKEND_TOKEN}`;
}

export async function startMockBackend(port: number): Promise<() => Promise<void>> {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const method = (req.method ?? "GET").toUpperCase();

    // All backend API calls from BFF must be authorized
    if (!authOk(req)) {
      json(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    // ---- Bot / status endpoints ----
    if (method === "GET" && url.pathname === "/api/bot/status") {
      json(res, 200, {
        ok: true,
        bot: {
          enabled: false,
          mode: "balanced",
          maxOpenPositions: 3,
          scanSeconds: 30,
          dailyLossCapPct: 5,
          version: "e2e-playwright",
        },
        isRunning: false,
        authConfigured: true,
        automaticExecutionAllowed: false,
        durableBackend: "postgresql",
        durableState: "PERSISTENT",
        executionReadinessStatus: "blocked",
        startupReconciliationStatus: "ready",
        stateDegraded: false,
      });
      return;
    }

    if (method === "GET" && url.pathname === "/api/bybit/wallet") {
      json(res, 200, {
        result: {
          list: [
            {
              totalEquity: "1000.00",
              totalAvailableBalance: "1000.00",
              totalPerpUPL: "0.00",
            },
          ],
        },
      });
      return;
    }

    if (method === "GET" && url.pathname === "/api/bybit/positions") {
      json(res, 200, { result: { list: [] } });
      return;
    }

    if (method === "GET" && url.pathname === "/api/bot/journal") {
      json(res, 200, { journal: [] });
      return;
    }

    if (method === "GET" && url.pathname === "/api/bybit/kline") {
      json(res, 200, {
        candles: [
          { time: 1_800_000_000, open: 100, high: 101, low: 99, close: 100.5, volume: 10 },
        ],
      });
      return;
    }

    if (method === "GET" && url.pathname === "/api/workers/execution") {
      json(res, 200, {
        ok: true,
        status: "IDLE",
        claimStore: { ok: true, backend: "postgresql", persistentPathConfigured: true, restartSafe: true, migrationVersion: 3 },
      });
      return;
    }

    if (method === "GET" && url.pathname === "/api/workers/symbols") {
      json(res, 200, { ok: true, activeSymbols: [], rows: [], totalUniverse: 0 });
      return;
    }

    if (method === "GET" && url.pathname === "/api/workers/setups") {
      json(res, 200, { ok: true, rows: [], lastBatch: {} });
      return;
    }

    // Simulate a backend failure for the API failure handling test
    if (method === "GET" && url.pathname === "/api/simulate-backend-failure") {
      json(res, 503, { ok: false, error: "Simulated backend unavailable" });
      return;
    }

    json(res, 404, { ok: false, error: `Mock backend: route not found: ${method} ${url.pathname}` });
  });

  server.listen(port, "127.0.0.1");
  await once(server, "listening");

  return () =>
    new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
}
