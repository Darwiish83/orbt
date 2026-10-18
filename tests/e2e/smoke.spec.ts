import { expect, test } from "@playwright/test";
import { E2E_EMAIL, E2E_PASSWORD } from "./constants";

test("landing page shows the brand hero", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/shipment/i);
  await expect(page.getByRole("link", { name: /open admin panel/i })).toBeVisible();
});

test("unauthenticated access to the admin area redirects to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("rejects invalid credentials with a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@orbit.so");
  await page.getByLabel("Password").fill("wrongpassword");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test.describe("authenticated session", () => {
  test("logs in, shows the admin shell + language toggle, then logs out", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Generous timeout: a dev server compiles /dashboard on first hit.
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByText("ADMIN PANEL")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(E2E_EMAIL)).toBeVisible();

    // Language toggle (Somali) still works inside the authenticated shell.
    await page.getByRole("button", { name: "SO" }).click();
    await expect(page.getByRole("link", { name: "Xamuulada" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "so");

    // Logout (stable test id — the visible label is localized).
    await page.getByTestId("logout-button").click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });
});
