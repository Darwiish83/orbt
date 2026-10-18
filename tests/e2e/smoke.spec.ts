import { expect, test } from "@playwright/test";

test.describe("Phase 1 smoke", () => {
  test("landing page shows the brand hero", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/shipment/i);
    await expect(page.getByRole("link", { name: /open admin panel/i })).toBeVisible();
  });

  test("admin shell renders with nav and the component specimen", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText("ADMIN PANEL")).toBeVisible();
    await expect(page.getByRole("link", { name: "Shipments" })).toBeVisible();
    await expect(page.getByText("Design system primitives")).toBeVisible();
    await expect(page.getByRole("button", { name: /book shipment/i })).toBeVisible();
  });

  test("language toggle switches to Somali", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "SO" }).click();
    // "Shipments" → "Xamuulada" in the sidebar nav.
    await expect(page.getByRole("link", { name: "Xamuulada" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "so");
  });

  test("Arabic sets RTL direction", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "ع" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  });
});
