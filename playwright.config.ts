import { defineConfig, devices } from "@playwright/test";

const frontendPort = 19200;

export default defineConfig({
  globalSetup: "./e2e/playwright/global-setup.ts",
  testDir: "./e2e/playwright",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  reporter: process.env.CI
    ? [["html", { open: "never", outputFolder: "playwright-report" }], ["list"]]
    : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    headless: true,
    // Never store credentials in test artifacts
    contextOptions: {
      // Do not save storage state between tests — each test manages its own auth
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: `http://127.0.0.1:${frontendPort}/healthz`,
    timeout: 60_000,
    reuseExistingServer: false,
    env: {
      PORT: String(frontendPort),
      HOST: "127.0.0.1",
      // Test-only credentials — no real Bybit credentials
      BACKEND_API_URL: `http://127.0.0.1:${frontendPort + 1}`,
      BACKEND_ADMIN_TOKEN: "e2e-playwright-backend-token",
      // scrypt$e2etestsalt0000000000000000000001$<hash of "e2e-test-operator-token">
      FRONTEND_OPERATOR_PASSWORD_SCRYPT:
        "scrypt$e2etestsalt0000000000000000000001$3257258a2d423026e399233b5fc95c9c96ea1dfed7f17983d507d7f6adbafc53",
      FRONTEND_SESSION_SIGNING_SECRET:
        "e2e-test-session-signing-secret-not-production-64chars-padding-1234",
      NODE_ENV: "development",
    },
  },
});
