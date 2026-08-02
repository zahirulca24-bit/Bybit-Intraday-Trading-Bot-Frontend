import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";

import indexHandler from "./api/index";
import botToggleHandler from "./api/bot-toggle";
import scannerHandler from "./api/scanner-live";
import analyticsHandler from "./api/analytics";
import riskPolicyHandler from "./api/risk-policy";
import dashboardTruthHandler from "./api/dashboard-truth";
import replayHandler from "./api/replay";
import liveJournalHandler from "./api/live-journal";
import loginHandler from "./api/auth/login";
import logoutHandler from "./api/auth/logout";
import sessionHandler from "./api/auth/session";
import { ControlAuthError, requireControlSession } from "./api/_lib/control-auth";

export const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "256kb" }));

app.get("/healthz", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "bybit-frontend-dev-bff",
    environment: "BYBIT_DEMO",
    upstream: "GOOGLE_CLOUD_RUN",
  });
});

app.post("/api/auth/login", (req, res) => void loginHandler(req, res));
app.post("/api/auth/logout", (req, res) => void logoutHandler(req, res));
app.get("/api/auth/session", (req, res) => void sessionHandler(req, res));
app.all("/api/replay/*", (req, res) => void replayHandler(req, res));
app.all("/api/bot/toggle", (req, res) => void botToggleHandler(req, res));
app.all("/api/scanner", (req, res) => void scannerHandler(req, res));
app.get("/api/logs", (req, res) => void liveJournalHandler(req, res));
app.all("/api/risk-policy", (req, res) => void riskPolicyHandler(req, res));
app.all("/api/risk/policy", (req, res) => void riskPolicyHandler(req, res));
app.get("/api/account", (req, res) => {
  req.query = { ...req.query, mode: "account" };
  void dashboardTruthHandler(req, res);
});
app.get("/api/orders/lifecycle", (req, res) => {
  req.query = { ...req.query, mode: "lifecycle" };
  void dashboardTruthHandler(req, res);
});
app.all("/api/analytics", (req, res) => void analyticsHandler(req, res));
app.all("/api/analytics/*", (req, res) => {
  const analyticsPath = req.path.replace(/^\/api\/analytics\/?/, "");
  req.query = { ...req.query, path: analyticsPath };
  void analyticsHandler(req, res);
});
app.all("/api/*", (req, res) => {
  const method = String(req.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    try {
      requireControlSession(req);
    } catch (error) {
      if (error instanceof ControlAuthError) {
        res.setHeader("X-Control-Auth-Error", "session");
        res.status(error.status).json({
          error: error.message,
          code: "CONTROL_SESSION_INVALID",
        });
        return;
      }
      res.status(500).json({ error: "Unable to validate operator session." });
      return;
    }
  }
  void indexHandler(req, res);
});

async function start(): Promise<void> {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });

  app.use(vite.middlewares);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Bybit frontend dev BFF listening on http://0.0.0.0:${PORT}`);
    console.log("All trading data is proxied from the configured Google Cloud Run backend.");
  });
}

start().catch((error) => {
  console.error("Unable to start frontend dev BFF:", error);
  process.exitCode = 1;
});
