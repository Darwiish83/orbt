import { defineConfig, devices } from "@playwright/test";

/**
 * Design-parity suite (tests/e2e/design-parity.spec.ts): diffs app screens
 * against the design reference. Runs its own dev server on :3300 with a
 * separate build dir so it never collides with a dev server on :3100, plus a
 * read-only static server for design-reference/ on :3200. No database needed.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /design-parity\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:3300" },
  projects: [{ name: "chromium-design", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node scripts/serve-design.mjs 3200",
      url: "http://127.0.0.1:3200/styles.css",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "npm run dev -- -p 3300",
      env: { NEXT_DIST_DIR: ".next-design" },
      url: "http://localhost:3300/dev/ds/tabs",
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
