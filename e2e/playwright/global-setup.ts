/**
 * Playwright global setup: starts the mock backend before any test runs.
 * The mock backend port (19201) is what the frontend BFF (19200) proxies to.
 *
 * Returns a teardown function that stops the backend after all tests complete.
 * Playwright 1.36+ calls the returned function as the global teardown.
 */
import { startMockBackend } from "./mock-backend";

const MOCK_BACKEND_PORT = 19201;

export default async function globalSetup(): Promise<() => Promise<void>> {
  const stop = await startMockBackend(MOCK_BACKEND_PORT);
  return stop;
}
