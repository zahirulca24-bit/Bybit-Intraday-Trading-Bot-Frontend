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
    data: { range: { complete: true }, coverage: { count: 145 } },
    stepEngineImplemented: true,
    strategyReplayImplemented: true,
    riskReplayImplemented: true,
    simulatedExecutionImplemented: true,
    performanceSummaryImplemented: true,
    replayJournalImplemented: true,
  };
}

function emptyMetrics(session) {
  const balance = Number(session.balance);
  const initial = Number(session.initialBalance);
  const net = balance - initial;
  return {
    totalTrades: 0,
    closedTrades: 0,
    openTrades: 0,
    cancelledTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    breakevenTrades: 0,
    longTrades: 0,
    shortTrades: 0,
    winRatePct: "0.0000",
    grossProfit: "0.00000000",
    grossLoss: "0.00000000",
    netRealizedPnl: "0.00000000",
    feesPaid: "0.00000000",
    expectancy: "0.00000000",
    averageWin: "0.00000000",
    averageLoss: "0.00000000",
    profitFactor: null,
    profitFactorStatus: "no_closed_profit_or_loss",
    totalR: "0.0000",
    averageR: "0.0000",
    rSampleTrades: 0,
    averageTradeDurationMs: 0,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    initialBalance: initial.toFixed(8),
    balance: balance.toFixed(8),
    equity: Number(session.equity).toFixed(8),
    netPnl: net.toFixed(8),
    equityPnl: (Number(session.equity) - initial).toFixed(8),
    maxDrawdown: "0.00000000",
    maxDrawdownPct: "0.0000",
    currentDrawdown: "0.00000000",
    currentDrawdownPct: "0.0000",
    highWaterEquity: Number(session.equity).toFixed(8),
    recoveryFactor: null,
  };
}

function performancePayload(session) {
  const trades = state.trades.get(session.sessionId) || [];
  const hasTrade = trades.length > 0;
  const metrics = emptyMetrics(session);
  if (hasTrade) {
    metrics.totalTrades = 1;
    metrics.openTrades = 1;
    metrics.longTrades = 1;
    metrics.feesPaid = "0.06000000";
    metrics.equity = "1002.00000000";
    metrics.equityPnl = "2.00000000";
    metrics.highWaterEquity = "1002.00000000";
  }
  const curve = session.cursorTime
    ? [{ sequenceNo: 3, candleOpenTime: session.cursorTime, balance: session.balance, equity: hasTrade ? "1002.00000000" : session.equity, unrealizedPnl: hasTrade ? "2.00000000" : "0.00000000", createdAt: Math.floor(Date.now() / 1000) }]
    : [];
  return {
    ok: true,
    sessionId: session.sessionId,
    symbol: session.symbol,
    timeframe: session.timeframe,
    sessionStatus: session.status,
    asOfCursorTime: session.cursorTime,
    isFinal: session.status === "COMPLETED" && !hasTrade,
    metrics,
    equityCurve: curve,
    equityCurveMeta: { included: true, totalMarks: curve.length, returnedPoints: curve.length, ignoredMalformedMarks: 0, samplingStride: 1, limit: 200 },
    externalExecutionAllowed: false,
  };
}

function journalPayload(session, url) {
  const entries = state.events.get(session.sessionId) || [];
  const trades = state.trades.get(session.sessionId) || [];
  const category = url.searchParams.get("category") || "all";
  const filtered = category === "all" ? entries : entries.filter((entry) => entry.eventType.startsWith(`${category}.`));
  return {
    ok: true,
    session,
    entries: [...filtered].reverse(),
    trades,
    pagination: { direction: "desc", cursorSequence: null, nextCursorSequence: null, hasMore: false, limit: 50 },
    filters: { category, includePayload: true, includeTrades: true },
    journalSummary: {
      totalEvents: entries.length,
      firstSequence: entries[0]?.sequenceNo ?? null,
      lastSequence: entries.at(-1)?.sequenceNo ?? null,
      totalTrades: trades.length,
      openTrades: trades.filter((trade) => trade.status === "OPEN").length,
      closedTrades: trades.filter((trade) => trade.status === "CLOSED").length,
      cancelledTrades: trades.filter((trade) => trade.status === "CANCELLED").length,
    },
    performanceSummaryImplemented: true,
    replayJournalImplemented: true,
    externalExecutionAllowed: false,
  };
}

const backend = createServer(async (req, res) => {
  const url = new URL(req.url || "/", backendBase);
  const method = req.method || "GET";

  if (url.pathname.startsWith("/api/replay/")) {
    state.replayRequests += 1;
    if (req.headers.authorization === `Bearer ${adminToken}`) state.authorizedReplayRequests += 1;
    else return json(res, 401, { ok: false, error: "Unauthorized" });
  }

  if (method === "GET" && url.pathname === "/api/bot/status") {
    return json(res, 200, { ok: true, bot: { enabled: false, mode: "balanced", maxOpenPositions: 3, scanSeconds: 30, dailyLossCapPct: 5, version: "step9-e2e" } });
  }
  if (method === "GET" && url.pathname === "/api/workers/execution") {
    return json(res, 200, { ok: true, status: "IDLE", claimStore: { ok: true, backend: "postgresql", persistentPathConfigured: true, restartSafe: true, migrationVersion: 3 } });
  }
  if (method === "GET" && url.pathname === "/api/workers/symbols") return json(res, 200, { ok: true, activeSymbols: [], rows: [], totalUniverse: 0 });
  if (method === "GET" && url.pathname === "/api/workers/setups") return json(res, 200, { ok: true, rows: [], lastBatch: {} });
  if (method === "GET" && url.pathname === "/api/bybit/wallet") return json(res, 200, { result: { list: [{ totalEquity: "1000", totalAvailableBalance: "1000", totalPerpUPL: "0" }] } });
  if (method === "GET" && url.pathname === "/api/bybit/positions") return json(res, 200, { result: { list: [] } });
  if (method === "GET" && url.pathname === "/api/bot/journal") return json(res, 200, { journal: [] });
  if (method === "GET" && url.pathname === "/api/bybit/kline") return json(res, 200, { candles: [{ time: 1_800_000_000, open: 100, high: 101, low: 99, close: 100.5, volume: 10 }] });

  if (method === "GET" && url.pathname === "/api/replay/status") {
    return json(res, 200, {
      ok: true,
      runtimeMode: "historical_replay",
      executionMode: "simulated_only",
      externalExecutionAllowed: false,
      sessionApiImplemented: true,
      stepEngineImplemented: true,
      strategyReplayImplemented: true,
      riskReplayImplemented: true,
      simulatedExecutionImplemented: true,
      performanceSummaryImplemented: true,
      replayJournalImplemented: true,
    });
  }
  if (method === "GET" && url.pathname === "/api/replay/sessions") {
    const sessions = [...state.sessions.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    return json(res, 200, { ok: true, sessions, count: sessions.length, limit: 50, status: null, performanceSummaryImplemented: true, replayJournalImplemented: true });
  }
  if (method === "POST" && url.pathname === "/api/replay/start") {
    const body = await readJson(req);
    assert.equal(body.externalExecutionAllowed, false);
    const existing = state.sessions.get(body.sessionId);
    if (existing) return json(res, 200, { ok: true, created: false, session: existing });
    const session = {
      sessionId: body.sessionId,
      symbol: body.symbol,
      timeframe: body.timeframe,
      status: "READY",
      startTime: body.startTime,
      endTime: body.endTime,
      cursorTime: null,
      initialBalance: String(body.initialBalance),
      balance: String(body.initialBalance),
      equity: String(body.initialBalance),
      strategyMode: body.strategyMode,
      config: { ...body.config, runtimeMode: "historical_replay", executionMode: "simulated_only", externalExecutionAllowed: false, intervalMs },
      summary: {},
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    };
    state.sessions.set(session.sessionId, session);
    state.events.set(session.sessionId, [{ sequenceNo: 0, eventType: "session.created", candleOpenTime: null, createdAt: Math.floor(Date.now() / 1000), payload: { executionMode: "simulated_only" } }]);
    state.trades.set(session.sessionId, []);
    return json(res, 201, { ok: true, created: true, session, performanceSummaryImplemented: true, replayJournalImplemented: true });
  }

  const detailMatch = url.pathname.match(/^\/api\/replay\/sessions\/([A-Za-z0-9_-]{8,80})$/);
  if (method === "GET" && detailMatch) {
    const session = state.sessions.get(detailMatch[1]);
    return session ? json(res, 200, sessionResponse(session)) : json(res, 404, { ok: false, error: "Replay session was not found." });
  }

  const performanceMatch = url.pathname.match(/^\/api\/replay\/sessions\/([A-Za-z0-9_-]{8,80})\/performance$/);
  if (method === "GET" && performanceMatch) {
    const session = state.sessions.get(performanceMatch[1]);
    return session ? json(res, 200, performancePayload(session)) : json(res, 404, { ok: false, error: "Replay session was not found." });
  }

  const journalMatch = url.pathname.match(/^\/api\/replay\/sessions\/([A-Za-z0-9_-]{8,80})\/journal$/);
  if (method === "GET" && journalMatch) {
    const session = state.sessions.get(journalMatch[1]);
    return session ? json(res, 200, journalPayload(session, url)) : json(res, 404, { ok: false, error: "Replay session was not found." });
  }

  if (method === "POST" && url.pathname === "/api/replay/step") {
    const body = await readJson(req);
    const session = state.sessions.get(body.sessionId);
    if (!session) return json(res, 404, { ok: false, error: "Replay session was not found." });
    if (body.expectedCursorTime !== session.cursorTime) return json(res, 409, { ok: false, error: "Replay cursor conflict." });
    const nextCursor = session.cursorTime === null ? session.startTime : Math.min(session.endTime, session.cursorTime + intervalMs * Number(body.steps || 1));
    session.cursorTime = nextCursor;
    session.status = nextCursor >= session.endTime ? "COMPLETED" : "PAUSED";
    session.equity = "1002.00000000";
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
  await page.locator("#desktop-sidebar #nav-item-historical-replay").click();
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

  assert.ok(state.authorizedReplayRequests >= 8, "The full UI flow must traverse the authenticated Render BFF.");
  assert.ok(!frontendLogs.includes(adminToken), "The Render admin token must never be printed in frontend logs.");
  console.log("Historical Replay Render frontend E2E passed.");
} finally {
  if (browser) await browser.close();
  if (frontend && !frontend.killed) frontend.kill("SIGTERM");
  await new Promise((resolve) => backend.close(resolve));
}
