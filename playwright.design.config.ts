import { defineConfig, devices } from "@playwright/test";

/**
 * Design-parity suite (tests/e2e/design-parity.spec.ts): diffs app screens
 * against the design reference. Runs its own dev server on :3300 with a
 * separate build dir so it never collides with a dev server on :3100, plus a
 * read-only static server for design-reference/ on :3200. No database needed.
 *
 * Both servers listen on the loopback address only, never on Wi-Fi or any other
 * network interface; URLs use the literal 127.0.0.1 (on Windows "localhost"
 * resolves to ::1 first, where nothing listens).
 */
const HOST = "127.0.0.1";
const APP = `http://${HOST}:3300`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /design-parity\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: APP },
  projects: [{ name: "chromium-design", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node scripts/serve-design.mjs 3200",
      url: `http://${HOST}:3200/styles.css`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: `npm run dev -- -H ${HOST} -p 3300`,
      env: { NEXT_DIST_DIR: ".next-design" },
      url: `${APP}/dev/ds/tabs`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
