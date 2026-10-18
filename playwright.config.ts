import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright drives E2E + visual-regression. The dev server is started
 * automatically. Visual baselines live beside the specs; generate/update them
 * with `npm run test:e2e -- --update-snapshots`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
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
    // Run against a production build on a dedicated port: deterministic and
    // free of the dev server's on-demand route compilation (which made auth
    // redirects flaky). Never binds to the unrelated dev server on :3000.
    command: "npm run build && npm run start -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
