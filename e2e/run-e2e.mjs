import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { chromium } from "@playwright/test";

const backendPort = 19120;
const frontendPort = 19121;
const backendBase = `http://127.0.0.1:${backendPort}`;
const frontendBase = `http://127.0.0.1:${frontendPort}`;
const adminToken = "step9-e2e-secret";
const intervalMs = 300_000;

const state = {
  sessions: new Map(),
  events: new Map(),
  trades: new Map(),
  replayRequests: 0,
  authorizedReplayRequests: 0,
};

function json(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sessionResponse(session) {
  return {
    ok: true,
    session,
    externalExecutionAllowed: false,
  };
}

const backend = createServer(async (req, res) => {
  const url = new URL(req.url || "/", backendBase);
  const method = String(req.method || "GET").toUpperCase();
  state.replayRequests += 1;

  const auth = String(req.headers.authorization || "");
  if (url.pathname.startsWith("/api/replay/")) {
    if (auth !== `Bearer ${adminToken}`) return json(res, 401, { ok: false, error: "Unauthorized" });
    state.authorizedReplayRequests += 1;
  }

  if (method === "GET" && url.pathname === "/api/replay/status") {
    return json(res, 200, {
      ok: true,
      replayMode: true,
      externalExecutionAllowed: false,
      source: "E2E_FIXTURE",
    });
  }

  if (method === "GET" && url.pathname === "/api/status") {
    return json(res, 200, {
      ok: true,
      isRunning: false,
      backendConnected: true,
      authConfigured: true,
      mode: "replay",
    });
  }

  if (method === "GET" && url.pathname === "/api/account") {
    return json(res, 200, { equity: 1000, availableBalance: 1000 });
  }

  if (method === "GET" && url.pathname === "/api/positions") {
    return json(res, 200, { positions: [] });
  }

  if (method === "GET" && url.pathname === "/api/orders/lifecycle") {
    return json(res, 200, { orders: [] });
  }

  if (method === "GET" && url.pathname === "/api/market/klines") {
    return json(res, 200, { candles: [] });
  }

  if (method === "GET" && url.pathname === "/api/logs") {
    return json(res, 200, { logs: [] });
  }

  if (method === "GET" && url.pathname === "/api/scanner") {
    return json(res, 200, { signals: [], results: [], rows: [] });
  }

  if (method === "GET" && url.pathname === "/api/workers/status") {
    return json(res, 200, { ok: true, runtime: {} });
  }

  if (method === "GET" && url.pathname === "/api/workers/symbols") {
    return json(res, 200, { ok: true, rows: [] });
  }

  if (method === "GET" && url.pathname === "/api/workers/setups") {
    return json(res, 200, { ok: true, rows: [] });
  }

  if (method === "GET" && url.pathname === "/api/workers/execution") {
    return json(res, 200, { ok: true, rows: [], claimStore: { backend: "postgresql", restartSafe: true } });
  }

  if (method === "GET" && url.pathname === "/api/durable-state/status") {
    return json(res, 200, { durableState: { backend: "postgresql", restartSafe: true, degraded: false } });
  }

  if (method === "GET" && url.pathname === "/api/replay/data/candles") {
    return json(res, 200, {
      ok: true,
      candles: [
        { openTime: 1800000000, open: "100", high: "102", low: "99", close: "101", volume: "10" },
        { openTime: 1800000300, open: "101", high: "103", low: "100", close: "102", volume: "12" },
      ],
      externalExecutionAllowed: false,
    });
  }

  if (method === "GET" && url.pathname === "/api/replay/sessions") {
    return json(res, 200, { ok: true, sessions: [...state.sessions.values()], externalExecutionAllowed: false });
  }

  if (method === "POST" && url.pathname === "/api/replay/sessions") {
    const body = await readJson(req);
    const sessionId = `replay_ui_${Math.random().toString(36).slice(2, 14)}`;
    const session = {
      sessionId,
      symbol: String(body.symbol || "BTCUSDT"),
      timeframe: String(body.timeframe || "5"),
      status: "READY",
      cursorTime: null,
      startTime: Number(body.startTime || 1800000000),
      endTime: Number(body.endTime || 1800000600),
      initialBalance: String(body.initialBalance || "1000"),
      balance: String(body.initialBalance || "1000"),
      equity: String(body.initialBalance || "1000"),
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    };
    state.sessions.set(sessionId, session);
    state.events.set(sessionId, []);
    state.trades.set(sessionId, []);
    return json(res, 201, sessionResponse(session));
  }

  const sessionMatch = url.pathname.match(/^\/api\/replay\/sessions\/([A-Za-z0-9_-]{8,80})$/);
  if (method === "GET" && sessionMatch) {
    const session = state.sessions.get(sessionMatch[1]);
    if (!session) return json(res, 404, { ok: false, error: "Replay session was not found." });
    return json(res, 200, sessionResponse(session));
  }

  const eventsMatch = url.pathname.match(/^\/api\/replay\/sessions\/([A-Za-z0-9_-]{8,80})\/events$/);
  if (method === "GET" && eventsMatch) {
    return json(res, 200, { ok: true, events: state.events.get(eventsMatch[1]) || [], externalExecutionAllowed: false });
  }

  const tradesMatch = url.pathname.match(/^\/api\/replay\/sessions\/([A-Za-z0-9_-]{8,80})\/trades$/);
  if (method === "GET" && tradesMatch) {
    return json(res, 200, { ok: true, trades: state.trades.get(tradesMatch[1]) || [], externalExecutionAllowed: false });
  }

  const stepMatch = url.pathname.match(/^\/api\/replay\/sessions\/([A-Za-z0-9_-]{8,80})\/step$/);
  if (method === "POST" && stepMatch) {
    const session = state.sessions.get(stepMatch[1]);
    if (!session) return json(res, 404, { ok: false, error: "Replay session was not found." });
    const body = await readJson(req);
    const nextCursor = session.cursorTime === null ? session.startTime : Math.min(session.cursorTime + intervalMs, session.endTime);
    session.cursorTime = nextCursor;
    session.status = nextCursor >= session.endTime ? "COMPLETED" : "PAUSED";
    session.updatedAt = Math.floor(Date.now() / 1000);
    const events = state.events.get(session.sessionId) || [];
    events.push(
      { sequenceNo: events.length, eventType: "step.completed", candleOpenTime: nextCursor, createdAt: Math.floor(Date.now() / 1000), payload: { requestId: body.requestId, steps: body.steps } },
      { sequenceNo: events.length + 1, eventType: "trade.opened", candleOpenTime: nextCursor, createdAt: Math.floor(Date.now() / 1000), payload: { side: "Buy", price: "100" } },
      { sequenceNo: events.length + 2, eventType: "pnl.marked", candleOpenTime: nextCursor, createdAt: Math.floor(Date.now() / 1000), payload: { balance: session.balance, equity: session.equity, unrealizedPnl: "2" } },
    );
    state.events.set(session.sessionId, events);
    if (!(state.trades.get(session.sessionId) || []).length) {
      state.trades.set(session.sessionId, [{ tradeId: `sim_${session.sessionId.slice(-12)}`, symbol: session.symbol, side: "Buy", status: "OPEN", entryTime: nextCursor, exitTime: null, entryPrice: "100", exitPrice: null, quantity: "1", realizedPnl: "0", fees: "0.06", payload: { riskAmount: "10", stopLoss: "98", takeProfit: "104" }, createdAt: Math.floor(Date.now() / 1000), updatedAt: Math.floor(Date.now() / 1000) }]);
    }
    return json(res, 200, { ok: true, idempotent: false, completed: session.status === "COMPLETED", cursorTime: nextCursor, session, execution: { opened: 1, closed: 0, openTrades: 1, requestFees: "0.06000000" }, externalExecutionAllowed: false });
  }

  const resetMatch = url.pathname.match(/^\/api\/replay\/sessions\/([A-Za-z0-9_-]{8,80})\/reset$/);
  if (method === "POST" && resetMatch) {
    const session = state.sessions.get(resetMatch[1]);
    if (!session) return json(res, 404, { ok: false, error: "Replay session was not found." });
    session.status = "READY";
    session.cursorTime = null;
    session.balance = session.initialBalance;
    session.equity = session.initialBalance;
    session.updatedAt = Math.floor(Date.now() / 1000);
    state.events.set(session.sessionId, [{ sequenceNo: 0, eventType: "session.reset", candleOpenTime: null, createdAt: Math.floor(Date.now() / 1000), payload: {} }]);
    state.trades.set(session.sessionId, []);
    return json(res, 200, { ok: true, reset: true, session, externalExecutionAllowed: false });
  }

  return json(res, 404, { ok: false, error: `Mock backend route not found: ${method} ${url.pathname}` });
});

async function waitFor(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

let frontend;
let browser;
try {
  backend.listen(backendPort, "127.0.0.1");
  await once(backend, "listening");

  frontend = spawn("npm", ["start"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(frontendPort),
      HOST: "127.0.0.1",
      BACKEND_API_URL: backendBase,
      BACKEND_ADMIN_TOKEN: adminToken,
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let frontendLogs = "";
  frontend.stdout.on("data", (chunk) => { frontendLogs += chunk.toString(); });
  frontend.stderr.on("data", (chunk) => { frontendLogs += chunk.toString(); });

  await waitFor(`${frontendBase}/healthz`);

  const statusResponse = await fetch(`${frontendBase}/api/replay/status`);
  assert.equal(statusResponse.status, 200);
  assert.equal((await statusResponse.json()).externalExecutionAllowed, false);
  assert.equal(state.authorizedReplayRequests, 1, "Render BFF must attach the server-only admin token.");

  const forwardedBefore = state.replayRequests;
  const blockedResponse = await fetch(`${frontendBase}/api/replay/data/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(blockedResponse.status, 404, "BFF must reject replay routes outside the frontend allowlist.");
  assert.equal(state.replayRequests, forwardedBefore, "Blocked replay routes must not reach the backend.");

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`browser console: ${message.text()}`);
  });

  await page.goto(frontendBase, { waitUntil: "networkidle" });
  await page.locator("#root").waitFor({ state: "attached", timeout: 15_000 });
  const replayNav = page.locator("#desktop-sidebar #nav-item-historical-replay");
  await replayNav.waitFor({ state: "attached", timeout: 15_000 });
  await replayNav.evaluate((element) => element.click());
  await page.getByTestId("historical-replay-view").waitFor();
  await page.getByTestId("replay-safety-badge").waitFor();

  const createButton = page.getByTestId("replay-create-button");
  await createButton.waitFor();
  await page.waitForFunction(() => !(document.querySelector('[data-testid="replay-create-button"]'))?.hasAttribute("disabled"));
  await createButton.click();
  await page.getByTestId("replay-selected-id").waitFor();
  const selectedId = (await page.getByTestId("replay-selected-id").textContent())?.trim() || "";
  assert.match(selectedId, /^replay_ui_[A-Za-z0-9_-]+$/);
  assert.equal((await page.getByTestId("replay-status").textContent())?.trim(), "READY");

  await page.getByTestId("replay-step-1").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="replay-status"]')?.textContent?.trim() === "PAUSED");
  assert.notEqual((await page.getByTestId("replay-cursor").textContent())?.trim(), "Not started");
  assert.equal((await page.getByTestId("replay-total-trades").textContent())?.trim(), "1");

  await page.getByTestId("replay-journal-tab").click();
  await page.getByTestId("replay-journal-entry").first().waitFor();
  const journalText = await page.getByTestId("replay-journal-list").textContent();
  assert.match(journalText || "", /trade\.opened|step\.completed/);

  await page.getByTestId("replay-reset-button").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="replay-status"]')?.textContent?.trim() === "READY");
  assert.equal((await page.getByTestId("replay-total-trades").textContent())?.trim(), "0");

  console.log("Historical Replay E2E passed.");
} catch (error) {
  if (frontend) {
    console.error(frontendLogs || "No frontend logs captured.");
  }
  throw error;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (frontend) frontend.kill("SIGTERM");
  await new Promise((resolve) => backend.close(() => resolve()));
}
