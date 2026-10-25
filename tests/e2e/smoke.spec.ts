import { authenticator } from "otplib";
import { expect, test, type Page } from "@playwright/test";
import {
  E2E_CUSTOMER_EMAIL,
  E2E_CUSTOMER_PASSWORD,
  E2E_CUSTOMER_REF,
  E2E_EMAIL,
  E2E_EMPLOYEE_ID,
  E2E_MFA_SECRET,
  E2E_PASSWORD,
} from "./constants";

async function staffLogin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Employee ID or Customer Reference").fill(E2E_EMPLOYEE_ID);
  await page.getByLabel("Gmail").fill(E2E_EMAIL);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByLabel("Authenticator code").fill(authenticator.generate(E2E_MFA_SECRET));
  await page.getByRole("button", { name: /log in/i }).click();
  // Generous timeout: a dev server compiles /dashboard on first hit.
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
}

test("landing page shows the brand hero", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/our priority/i);
  await expect(page.getByRole("link", { name: /customer & admin login/i })).toBeVisible();
});

test("unauthenticated access to staff areas and the portal goes to the one sign-in page", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/admin/login");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /welcome to orbit/i })).toBeVisible();
});

test("responses carry CSP and security headers", async ({ page }) => {
  const res = await page.goto("/login");
  const headers = res!.headers();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).toContain("object-src 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBeTruthy();
  expect(headers["permissions-policy"]).toBeTruthy();
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("health endpoint reports ok", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect((await res.json()).status).toBe("ok");
});

test("public tracking shows a not-found message for an unknown number", async ({ page }) => {
  await page.goto("/track?n=ORB-2026-ZZZZZZ");
  await expect(page.getByRole("status")).toContainText(/no shipment found/i);
});

test("customer login refuses a wrong password with a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Employee ID or Customer Reference").fill(E2E_CUSTOMER_REF);
  await page.getByLabel("Gmail").fill(E2E_CUSTOMER_EMAIL);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page.getByText(/id, email or password is incorrect/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("customer first-login flow never reveals whether the details matched", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /first login or forgot password/i }).click();
  await page.getByLabel("Employee ID or Customer Reference").fill("OR-9999");
  await page.getByLabel("Gmail").fill("nobody@example.com");
  await page.getByLabel("Phone Number").fill("61 000 0000");
  await page.getByRole("button", { name: /send otp/i }).click();
  // Same screen as a real match (no email is sent for these details).
  await expect(page.getByText(/if the details match our records/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /verify/i })).toBeDisabled();
});

test("new-customer form requires every field", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("radio", { name: /new customer/i }).click();
  await page.getByRole("button", { name: /create new account/i }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(/fill in all required fields/i);
});

test("a customer's Gmail and password cannot sign in with an Employee ID", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Employee ID or Customer Reference").fill("EMP-001");
  await page.getByLabel("Gmail").fill(E2E_CUSTOMER_EMAIL);
  await page.getByLabel("Password").fill(E2E_CUSTOMER_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page.locator("main").getByText(/id, email or password is incorrect/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("staff first login asks only ID + Gmail and never reveals a match", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /first login or forgot password/i }).click();
  await page.getByLabel("Employee ID or Customer Reference").fill("EMP-9999");
  await expect(page.getByLabel("Phone Number")).toHaveCount(0);
  await page.getByLabel("Gmail").fill("nobody@example.com");
  await page.getByRole("button", { name: /send otp/i }).click();
  await expect(page.getByText(/if the details match our records/i)).toBeVisible();
});

test.describe("authenticated session", () => {
  test("logs in, shows the admin shell + language toggle, then logs out", async ({ page }) => {
    await staffLogin(page);
    await expect(page.getByText("ADMIN PANEL")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(E2E_EMAIL)).toBeVisible();

    // Language toggle (Somali) still works inside the authenticated shell.
    await page.getByRole("button", { name: "SO" }).click();
    await expect(page.getByRole("link", { name: "Xamuulada" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "so");

    // Logout (stable test id — the visible label is localized) returns staff to the sign-in page.
    await page.getByTestId("logout-button").click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("creates a customer through the authorized admin form", async ({ page }) => {
    await staffLogin(page);
    await page.goto("/customers");
    const name = `E2E Customer ${Date.now()}`;
    await page.getByLabel("New customer").fill(name);
    await page.getByLabel("Company").fill("E2E Imports");
    await page.getByRole("button", { name: /add customer/i }).click();
    await expect(page.getByRole("status")).toContainText(/customer added/i, { timeout: 15_000 });
    await expect(page.getByText(name)).toBeVisible();
  });
});

test.describe("customer portal", () => {
  test("customer lands on the portal and can upload + download a document", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Employee ID or Customer Reference").fill(E2E_CUSTOMER_REF);
    await page.getByLabel("Gmail").fill(E2E_CUSTOMER_EMAIL);
    await page.getByLabel("Password").fill(E2E_CUSTOMER_PASSWORD);
    await page.getByRole("button", { name: /log in/i }).click();

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
