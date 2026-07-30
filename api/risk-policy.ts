declare const process: { env: Record<string, string | undefined> };

type AnyRecord = Record<string, any>;
type RequestLike = any;
type ResponseLike = any;

const DEFAULT_BACKEND_URL = "https://bybit-intraday-trading-bot.onrender.com";
const BACKEND_URL = (
  process.env.BACKEND_API_URL ||
  process.env.VITE_API_BASE_URL ||
  DEFAULT_BACKEND_URL
).replace(/\/$/, "");
const ADMIN_TOKEN = (process.env.BACKEND_ADMIN_TOKEN || "").trim();

function sendJson(res: ResponseLike, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

function numberValue(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: any, fallback = ""): string {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

async function backendJson(path: string): Promise<any> {
  if (!ADMIN_TOKEN) {
    const error = new Error("Vercel server is missing BACKEND_ADMIN_TOKEN.");
    (error as any).status = 503;
    throw error;
  }

  const response = await fetch(`${BACKEND_URL}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${ADMIN_TOKEN}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });

  const text = await response.text();
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }

  if (!response.ok) {
    const error = new Error(
      stringValue(
        payload?.error || payload?.reason || payload?.message || payload?.retMsg,
        `Backend request failed (${response.status})`,
      ),
    );
    (error as any).status = response.status;
    (error as any).payload = payload;
    throw error;
  }
  return payload;
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  if (String(req.method || "GET").toUpperCase() !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const [statusRaw, walletRaw, executionRaw] = await Promise.all([
      backendJson("/api/bot/status"),
      backendJson("/api/bybit/wallet"),
      backendJson("/api/workers/execution").catch(() => null),
    ]);

    const bot: AnyRecord = statusRaw?.bot || statusRaw || {};
    const account: AnyRecord = walletRaw?.result?.list?.[0] || {};
    const daily: AnyRecord = bot?.dailyRisk || {};
    const lastExecution: AnyRecord = executionRaw?.lastResult || {};
    const lastSizing: AnyRecord =
      lastExecution?.positionSizing || bot?.positionSizing || {};

    const equity = numberValue(
      account?.totalEquity || account?.totalWalletBalance,
      numberValue(daily?.startingEquity, 0),
    );
    const startingEquity = numberValue(daily?.startingEquity, equity);
    const limitPct = numberValue(daily?.limitPct, 5);
    const computedLimit = startingEquity > 0 ? startingEquity * (limitPct / 100) : 0;
    const limitUsdt = numberValue(daily?.limitUsdt, computedLimit);
    const realizedNetPnl = numberValue(daily?.realizedNetPnl, 0);
    const remainingLossCapacity = numberValue(
      daily?.remainingLossCapacity,
      Math.max(0, limitUsdt + realizedNetPnl),
    );
    const evidenceAvailable =
      daily?.realizedNetPnl !== undefined &&
      daily?.limitUsdt !== undefined &&
      startingEquity > 0;

    sendJson(res, 200, {
      ok: true,
      generatedAt: Date.now(),
      environment: "BYBIT_DEMO",
      engine: {
        enabled: bot?.enabled === true,
        lastReason: stringValue(bot?.lastReason, "Backend did not report an engine reason."),
        mode: stringValue(bot?.mode || bot?.router?.mode, "conservative"),
      },
      account: {
        equity,
        availableBalance: numberValue(
          account?.totalAvailableBalance || account?.totalAvailableBalanceByCoin,
          0,
        ),
      },
      qualitySizing: {
        source: "BACKEND_QUALITY_SIZING_POLICY",
        aPlusRiskPct: 1.0,
        aRiskPct: 0.75,
        bPlusAction: "REJECT",
        lowerGradeAction: "REJECT",
        minimumExecutableRiskPct: 0.75,
        maximumExecutableRiskPct: 1.0,
        fixedAllocationCapEnabled: false,
        sizingMethod: "ACCOUNT_EQUITY_X_GRADE_RISK_DIVIDED_BY_TECHNICAL_STOP_DISTANCE",
        quantityRounding: "BYBIT_QTY_STEP_ROUND_DOWN_AND_FINAL_RISK_RECHECK",
        maxOpenPositions: numberValue(bot?.maxOpenPositions, 3),
        lastEvidence: Object.keys(lastSizing).length ? lastSizing : null,
      },
      exitPolicy: {
        source: "BACKEND_R_BASED_EXIT_POLICY",
        tp1: { targetR: 1.5, closeOriginalPct: 40, moveStopToBreakeven: true },
        tp2: { targetR: 2.0, closeOriginalPct: 30 },
        runner: {
          originalPct: 30,
          activateAfterVerifiedTp2: true,
          trailingDistanceR: 0.5,
        },
      },
      dailyNetLoss: {
        source: stringValue(daily?.source, "BYBIT_DAILY_CLOSED_PNL"),
        evidenceAvailable,
        dateKey: daily?.dateKey || bot?.tradingDateKey || null,
        startingEquity,
        limitPct,
        limitUsdt,
        realizedNetPnl,
        remainingLossCapacity,
        blocked: daily?.blocked === true,
        tradeCountLimited: false,
        maximumTradesPerDay: null,
        existingPositionManagementContinues: true,
      },
    });
  } catch (error: any) {
    const timeout = error?.name === "TimeoutError" || error?.name === "AbortError";
    sendJson(res, timeout ? 504 : numberValue(error?.status, 502), {
      error: timeout
        ? "Risk-policy backend timed out. Render may be waking up; retry shortly."
        : stringValue(error?.message, "Unable to load backend risk policy"),
      upstream: error?.payload,
    });
  }
}
