import { defineConfig, devices } from "@playwright/test";
import { e2eEnv } from "./tests/e2e/env";

/**
 * Playwright drives E2E + visual-regression. The dev server is started
 * automatically. Visual baselines live beside the specs; generate/update them
 * with `npm run test:e2e -- --update-snapshots`.
 */
// E2E_PORT lets the suite run while another dev server holds :3100; a
// non-default port also gets its own build dir (NEXT_DIST_DIR) to avoid sharing .next.
const PORT = Number(process.env.E2E_PORT ?? 3100);
// The suite has its own database (documents are stored in it, ADR-030): test
// accounts and uploads never land in the real development data.
// Same least-privilege roles as production (ADR-029): the app as orbit_runtime,
// customer requests as orbit_portal.
const E2E_DATABASE_URL = e2eEnv("E2E_DATABASE_URL");
const E2E_PORTAL_DATABASE_URL = e2eEnv("E2E_PORTAL_DATABASE_URL");

export default defineConfig({
  testDir: "./tests/e2e",
  // design-parity runs under playwright.design.config.ts (npm run test:design).
  testIgnore: /design-parity\.spec\.ts/,
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  // Serial run against the dev server for stability (avoids first-compile
  // contention). The dev server also runs in development mode, which is correct
  // for HTTP localhost: production uses HTTPS + Secure cookies (verified by the
  // header checks), which a browser would not send over plain HTTP.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    // Dev server on a dedicated port (development mode → HTTP-friendly cookies,
    // no production boot-validation). Serial workers keep first-compile stable.
    command: `npm run dev -- -p ${PORT}`,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      PORTAL_DATABASE_URL: E2E_PORTAL_DATABASE_URL,
      ...(PORT === 3100 ? {} : { NEXT_DIST_DIR: ".next-e2e" }),
    },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
