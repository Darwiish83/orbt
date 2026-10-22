import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Design parity: renders each design-system specimen card (served read-only by
 * scripts/serve-design.mjs) and the app's mirror of it (/dev/ds/<id>) at the
 * card's own viewport, then pixel-diffs the app against the design.
 *
 * The design screenshot is written as the snapshot baseline on every run, so
 * the comparison is always design → app (never app → old app). Those files are
 * git-ignored. Needs network: the design cards load React/Babel from unpkg,
 * icons from jsdelivr and fonts from Google Fonts.
 *
 * Run: npm run test:design
 */
const DESIGN = process.env.DESIGN_URL ?? "http://127.0.0.1:3200";

// Allowed share of differing pixels per card (0.5%). Measured residual on
// 2026-10-20: 0 px on five cards, 3 px on `core` (icon anti-aliasing,
// lucide-react vs the lucide-static CDN). Any layout/colour change exceeds it.
const MAX_DIFF = Number(process.env.DESIGN_MAX_DIFF ?? 0.005);

const CARDS: [id: string, path: string, w: number, h: number][] = [
  ["core", "components/core/core.card.html", 700, 300],
  ["card", "components/core/card.card.html", 700, 220],
  ["feedback", "components/feedback/feedback.card.html", 700, 330],
  ["forms", "components/forms/forms.card.html", 700, 320],
  ["logistics", "components/logistics/logistics.card.html", 700, 380],
  ["tabs", "components/navigation/tabs.card.html", 700, 110],
];

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  // Hide the Next.js dev-mode indicator; it is not part of the app UI.
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
}

test.describe("design parity — component cards", () => {
  for (const [id, path, w, h] of CARDS) {
    test(id, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: w, height: h });

      await page.goto(`${DESIGN}/${path}`);
      await expect(page.locator("#root > *").first()).toBeVisible();
      await settle(page);
      const design = await page.screenshot();
      const baseline = testInfo.snapshotPath(`${id}.png`);
      mkdirSync(dirname(baseline), { recursive: true });
      writeFileSync(baseline, design);

      await page.goto(`/dev/ds/${id}`);
      await expect(page.locator(`[data-ds-mirror="${id}"]`)).toBeVisible();
      await settle(page);
      expect(await page.screenshot()).toMatchSnapshot(`${id}.png`, { maxDiffPixelRatio: MAX_DIFF });
    });
  }
});
