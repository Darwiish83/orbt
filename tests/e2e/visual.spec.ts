import { expect, test } from "@playwright/test";

/**
 * Visual-regression baselines for the public, deterministic screens. Baselines
 * are platform-specific (Playwright suffixes them per OS); regenerate with
 * `npm run test:e2e -- visual.spec.ts --update-snapshots`. Run locally; the CI
 * E2E job runs the smoke suite (cross-OS pixel diffs are environment-sensitive).
 */
test.describe("visual regression", () => {
  test("landing page", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    // The Next.js dev-mode indicator is not part of the app UI.
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await expect(page).toHaveScreenshot("landing.png", { fullPage: true, maxDiffPixelRatio: 0.02 });
  });

  test("login page", async ({ page }) => {
    await page.goto("/login");
    await page.evaluate(() => document.fonts.ready);
    // The Next.js dev-mode indicator is not part of the app UI.
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await expect(page).toHaveScreenshot("login.png", { fullPage: true, maxDiffPixelRatio: 0.02 });
  });
});
