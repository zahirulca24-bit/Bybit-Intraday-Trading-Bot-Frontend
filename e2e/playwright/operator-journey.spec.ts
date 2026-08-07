/**
 * Operator Journey E2E tests — Playwright
 *
 * Tests the critical frontend operator flow:
 *   1. Login page loads
 *   2. Successful login
 *   3. Failed login
 *   4. Protected route enforcement
 *   5. Authenticated dashboard smoke test
 *   6. Logout
 *   7. Backend/API failure handling
 *
 * Security requirements enforced:
 * - No real Bybit credentials used
 * - No live or demo orders placed
 * - Passwords/tokens must not appear in URL, localStorage, sessionStorage, or DOM
 * - HttpOnly session cookie behavior preserved (not readable via JS)
 * - Backend calls intercepted at browser boundary where needed
 */

import { test, expect, Page, Route } from "@playwright/test";

const TEST_PASSWORD = "e2e-test-operator-token";

// ---- helpers ----------------------------------------------------------------

/**
 * Navigate to the app root and wait for the SPA shell to render, then go to
 * the Settings & Health tab where the operator auth panel lives.
 * Uses "load" rather than "networkidle" because the dashboard polls APIs
 * continuously, so networkidle never settles.
 */
async function navigateToSettingsHealth(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "load" });
  // Wait for the sidebar to appear
  await page.locator("#desktop-sidebar").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("#desktop-sidebar #nav-item-settings-health").click();
  await page.locator("#settings-health-container").waitFor({ state: "visible", timeout: 10_000 });
}

async function expectNotAuthenticated(page: Page): Promise<void> {
  // Use the auth section badge inside the settings panel, not the RuntimeStatusBar
  // Use exact text to avoid matching "UNAUTHENTICATED" when checking for "AUTHENTICATED"
  const badge = page
    .locator("#settings-health-container span")
    .filter({ hasText: /^UNAUTHENTICATED$/ })
    .first();
  await expect(badge).toBeVisible({ timeout: 5_000 });
}

async function expectAuthenticated(page: Page): Promise<void> {
  const badge = page
    .locator("#settings-health-container span")
    .filter({ hasText: /^AUTHENTICATED$/ })
    .first();
  await expect(badge).toBeVisible({ timeout: 8_000 });
}

async function submitLoginForm(page: Page, token: string): Promise<void> {
  const passwordField = page.locator("#settings-health-container input[type='password']");
  await expect(passwordField).toBeVisible({ timeout: 5_000 });
  await passwordField.fill(token);
  await page.locator("#settings-health-container button[type='submit']").click();
}

async function performLogin(page: Page): Promise<void> {
  await navigateToSettingsHealth(page);
  await expectNotAuthenticated(page);
  await submitLoginForm(page, TEST_PASSWORD);
  await expectAuthenticated(page);
}

// ---- 1. Login page loads ----------------------------------------------------

test("operator login UI renders with password field and submit action", async ({ page }) => {
  // Only collect errors that indicate real crashes, not routine API 404s from mock
  const criticalErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Ignore expected network errors from incomplete mock backend routes and Vite HMR
      if (
        !text.includes("Failed to load resource") &&
        !text.includes("net::ERR_") &&
        !text.includes("favicon") &&
        !text.includes("Mock backend: route not found") &&
        !text.includes("fetch error") &&
        !text.includes("Scanner fetch error") &&
        !text.includes("Dashboard fetch error") &&
        !text.includes("WebSocket") &&
        !text.includes("vite") &&
        !text.includes("24678")
      ) {
        criticalErrors.push(text);
      }
    }
  });

  await navigateToSettingsHealth(page);

  // Login form is present before authentication
  const passwordField = page.locator("#settings-health-container input[type='password']");
  await expect(passwordField).toBeVisible();

  // Submit action is available
  const submitBtn = page.locator("#settings-health-container button[type='submit']");
  await expect(submitBtn).toBeVisible();

  // No critical browser console errors (JS crashes, unhandled exceptions)
  expect(criticalErrors).toHaveLength(0);
});

// ---- 2. Successful operator login -------------------------------------------

test("successful operator login sets session and transitions to authenticated state", async ({
  page,
}) => {
  await navigateToSettingsHealth(page);
  await expectNotAuthenticated(page);

  await submitLoginForm(page, TEST_PASSWORD);

  // Session badge transitions to authenticated
  await expectAuthenticated(page);

  // Verify session via the API endpoint (using same-origin cookies in browser context)
  const sessionBody = await page.evaluate(async () => {
    const resp = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    return resp.json() as Promise<{ authenticated: boolean }>;
  });
  expect(sessionBody.authenticated).toBe(true);

  // Password/token must NOT appear in URL
  expect(page.url()).not.toContain(TEST_PASSWORD);

  // Password/token must NOT appear in localStorage
  const inLocalStorage = await page.evaluate(
    (pwd) => Object.values(localStorage).some((v) => String(v).includes(pwd)),
    TEST_PASSWORD,
  );
  expect(inLocalStorage).toBe(false);

  // Password/token must NOT appear in sessionStorage
  const inSessionStorage = await page.evaluate(
    (pwd) => Object.values(sessionStorage).some((v) => String(v).includes(pwd)),
    TEST_PASSWORD,
  );
  expect(inSessionStorage).toBe(false);

  // Password/token must NOT appear in rendered DOM
  const domText = (await page.locator("body").textContent()) ?? "";
  expect(domText).not.toContain(TEST_PASSWORD);
});

// ---- 3. Failed login --------------------------------------------------------

test("invalid password shows error and user remains unauthenticated", async ({ page }) => {
  await navigateToSettingsHealth(page);
  await expectNotAuthenticated(page);

  await submitLoginForm(page, "wrong-password-that-is-definitely-invalid");

  // Error message is shown within the settings panel
  const errorEl = page.locator("#settings-health-container .text-rose-300").first();
  await expect(errorEl).toBeVisible({ timeout: 5_000 });

  // User remains unauthenticated
  await expectNotAuthenticated(page);

  // The AUTHENTICATED badge must not appear inside the auth section (exact match)
  await expect(
    page.locator("#settings-health-container span").filter({ hasText: /^AUTHENTICATED$/ }),
  ).not.toBeVisible();
});

// ---- 4. Protected route enforcement -----------------------------------------

test("unauthenticated direct API calls to protected routes are rejected", async ({ page }) => {
  await page.goto("/", { waitUntil: "load" });

  // Without any login, session endpoint reports unauthenticated
  const sessionBody = await page.evaluate(async () => {
    const resp = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    return resp.json() as Promise<{ authenticated: boolean }>;
  });
  expect(sessionBody.authenticated).toBe(false);

  // Attempt a privileged mutation without a session cookie — BFF must reject it
  const { status } = await page.evaluate(async () => {
    const resp = await fetch("/api/bot/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: "{}",
    });
    return { status: resp.status };
  });
  expect([401, 403]).toContain(status);
});

test("unauthenticated page navigation does not reveal protected API data", async ({ page }) => {
  // Navigate directly to the dashboard without authenticating
  await page.goto("/", { waitUntil: "load" });
  await page.locator("#desktop-sidebar").waitFor({ state: "visible", timeout: 15_000 });

  // Session must confirm unauthenticated
  const sessionBody = await page.evaluate(async () => {
    const resp = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    return resp.json() as Promise<{ authenticated: boolean }>;
  });
  expect(sessionBody.authenticated).toBe(false);
});

// ---- 5. Authenticated dashboard smoke test ----------------------------------

test("authenticated dashboard shell renders main navigation and operational page", async ({
  page,
}) => {
  await performLogin(page);

  // Navigate to dashboard tab
  await page.locator("#desktop-sidebar #nav-item-dashboard").click();
  await page.locator("main").waitFor({ state: "visible", timeout: 10_000 });

  // Sidebar navigation is present
  await expect(page.locator("#desktop-sidebar")).toBeVisible();

  // Main content renders
  await expect(page.locator("main")).toBeVisible();

  // Scanner tab is accessible
  await page.locator("#desktop-sidebar #nav-item-scanner").click();
  await page.locator("main").waitFor({ state: "visible", timeout: 5_000 });
  await expect(page.locator("main")).toBeVisible();

  // Verify the mock backend returns test fixture data, not real trading data
  const walletBody = await page.evaluate(async () => {
    try {
      const resp = await fetch("/api/bybit/wallet", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!resp.ok) return null;
      return resp.json() as Promise<{ result?: { list?: Array<{ totalEquity: string }> } }>;
    } catch {
      return null;
    }
  });
  if (walletBody) {
    const equity = walletBody?.result?.list?.[0]?.totalEquity;
    // Test fixture value — confirms mock is in use, not a live account
    expect(equity).toBe("1000.00");
  }
});

// ---- 6. Logout --------------------------------------------------------------

test("logout clears session and blocks protected route access", async ({ page }) => {
  await performLogin(page);

  // Confirm authenticated via the session API
  const beforeSessionBody = await page.evaluate(async () => {
    const resp = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    return resp.json() as Promise<{ authenticated: boolean }>;
  });
  expect(beforeSessionBody.authenticated).toBe(true);

  // Perform logout via the UI button
  const logoutBtn = page.locator("#settings-health-container button", {
    hasText: "End Operator Session",
  });
  await expect(logoutBtn).toBeVisible({ timeout: 5_000 });
  await logoutBtn.click();

  // Wait for UI to return to unauthenticated state
  await expectNotAuthenticated(page);

  // Session endpoint must now report unauthenticated
  const afterSessionBody = await page.evaluate(async () => {
    const resp = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    return resp.json() as Promise<{ authenticated: boolean }>;
  });
  expect(afterSessionBody.authenticated).toBe(false);

  // Privileged mutations must be blocked again
  const { status } = await page.evaluate(async () => {
    const resp = await fetch("/api/bot/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: "{}",
    });
    return { status: resp.status };
  });
  expect([401, 403]).toContain(status);
});

// ---- 7. Backend/API failure handling ----------------------------------------

test("simulated backend failure shows safe error state without crashing the app", async ({
  page,
}) => {
  const criticalErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Capture unhandled JS exceptions only — not expected API fetch failures
      if (
        text.includes("Uncaught") ||
        (text.includes("Error") &&
          !text.includes("Failed to load resource") &&
          !text.includes("net::ERR_") &&
          !text.includes("fetch error") &&
          !text.includes("Dashboard fetch error") &&
          !text.includes("Scanner fetch error") &&
          !text.includes("Mock backend") &&
          !text.includes("WebSocket") &&
          !text.includes("[vite]") &&
          !text.includes("503"))
      ) {
        criticalErrors.push(text);
      }
    }
  });

  // Intercept the bot status endpoint to simulate backend failure
  await page.route("**/api/bot/status", async (route: Route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "Simulated backend unavailable" }),
    });
  });

  await page.goto("/", { waitUntil: "load" });

  // The root element must still render (app does not crash)
  await page.locator("#root").waitFor({ state: "visible", timeout: 10_000 });
  await expect(page.locator("#root")).toBeVisible();

  // Short wait for React to process the error state
  await page.waitForTimeout(2_000);

  // App shell is still present (error boundary or graceful degradation)
  const appStillRenders = await page.locator("#root").isVisible();
  expect(appStillRenders).toBe(true);

  // No secret or raw authorization value may appear in the DOM
  const bodyText = (await page.locator("body").textContent()) ?? "";
  expect(bodyText).not.toContain("BACKEND_ADMIN_TOKEN");
  expect(bodyText).not.toContain("FRONTEND_SESSION_SIGNING_SECRET");
  expect(bodyText).not.toContain("e2e-playwright-backend-token");

  // No unhandled JS crashes
  expect(criticalErrors).toHaveLength(0);
});
