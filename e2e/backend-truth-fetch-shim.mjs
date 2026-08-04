const originalFetch = globalThis.fetch;

if (typeof originalFetch === "function" && process.env.REPLAY_E2E_TRUTH_SHIM === "1") {
  globalThis.fetch = async function replayTruthFetch(input, init) {
    const url = typeof input === "string" || input instanceof URL
      ? new URL(String(input))
      : new URL(input.url);

    if (url.hostname === "127.0.0.1" && url.port === "19120") {
      if (url.pathname === "/api/durable-state/status") {
        return new Response(JSON.stringify({
          ok: true,
          backend: "postgresql",
          persistentPathConfigured: true,
          restartSafe: true,
          degraded: false,
          automaticExecutionAllowed: false,
          migrationVersion: 5,
          requiredMigrationVersion: 5,
          startupReconciliation: { status: "ready" },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        });
      }

      if (url.pathname === "/api/workers/status") {
        return new Response(JSON.stringify({
          ok: true,
          runtime: {
            threadAlive: true,
            lastLoopAt: Date.now(),
            settings: { symbolIntervalSeconds: 30 },
          },
        }), {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
    }

    return originalFetch(input, init);
  };
}
