import { expect, test } from "@playwright/test";
import { E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD, E2E_EMAIL, E2E_PASSWORD } from "./constants";

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

test("public tracking shows a not-found message for an unknown number", async ({ page }) => {
  await page.goto("/track?n=ORB-2026-ZZZZZZ");
  await expect(page.getByRole("status")).toContainText(/no shipment found/i);
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

  test("creates a customer through the authorized admin form", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_EMAIL);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    await page.goto("/customers");
    const name = `E2E Customer ${Date.now()}`;
    await page.getByLabel("New customer").fill(name);
    await page.getByRole("button", { name: /add customer/i }).click();
    await expect(page.getByRole("status")).toContainText(/customer added/i, { timeout: 15_000 });
    await expect(page.getByText(name)).toBeVisible();
  });
});

test.describe("customer portal", () => {
  test("customer lands on the portal and can upload + download a document", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_CUSTOMER_EMAIL);
    await page.getByLabel("Password").fill(E2E_CUSTOMER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Customers are routed to the portal, never the admin area.
    await expect(page).toHaveURL(/\/account/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /your shipments/i })).toBeVisible({ timeout: 15_000 });

    await page.goto("/account/documents");
    await page.locator('input[type="file"]').setInputFiles({
      name: "statement.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\ne2e document\n", "latin1"),
    });
    await page.getByRole("button", { name: /^upload$/i }).click();
    await expect(page.getByRole("status")).toContainText(/document uploaded/i, { timeout: 15_000 });

    const download = page.getByRole("link", { name: /download/i }).first();
    await expect(download).toBeVisible();
    // The download link streams through the authorized route (private storage).
    await expect(download).toHaveAttribute("href", /\/api\/documents\/.+\/download/);
  });
});
