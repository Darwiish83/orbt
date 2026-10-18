import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright drives E2E + visual-regression. The dev server is started
 * automatically. Visual baselines live beside the specs; generate/update them
 * with `npm run test:e2e -- --update-snapshots`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
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
    baseURL: "http://localhost:3100",
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
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
