import type { OtpPurpose } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setPassword, verifyCustomerLogin, verifyStaffLogin } from "@/modules/auth/accounts";
import {
  completeSetPassword,
  requestCustomerAccess,
  requestStaffSetup,
  startCustomerSignup,
  verifyCustomerAccess,
  verifyCustomerSignup,
  verifyStaffSetup,
} from "@/modules/auth/flows";
import { OTP_MAX_ATTEMPTS } from "@/modules/auth/otp";
import { departmentForRoles, ensureEmployeeForUser } from "@/modules/users/employeeCode";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => {
  outbox.length = 0;
  return resetDb();
});
afterAll(() => prisma.$disconnect());

/** Capturing OTP sender — no email ever leaves the test. */
const outbox: { to: string; code: string; purpose: OtpPurpose }[] = [];
const send = async (to: string, code: string, purpose: OtpPurpose) => {
  outbox.push({ to, code, purpose });
};
const lastCode = () => outbox.at(-1)!.code;
const wrong = (c: string) => (c === "000000" ? "111111" : "000000");

async function customer(ref: string, opts: { email?: string; phoneKey?: string; status?: "ACTIVE" | "SUSPENDED" } = {}) {
  return prisma.customer.create({
    data: { ref, name: `C ${ref}`, company: "Co", email: opts.email ?? null, phoneKey: opts.phoneKey ?? null, status: opts.status ?? "ACTIVE" },
  });
}

async function activeCustomerUser(ref: string, password = "cust-pass-123") {
  const c = await customer(ref, { email: `${ref.toLowerCase()}@shop.so`, phoneKey: "252615550100" });
  const u = await prisma.user.create({ data: { email: `${ref.toLowerCase()}@shop.so`, status: "ACTIVE", customerId: c.id } });
  await setPassword(prisma, u.id, password);
  return { c, u };
}

async function staffUser(code: string, opts: { active?: boolean; email?: string; password?: string } = {}) {
  const e = await prisma.employee.create({ data: { code, name: code, department: "OPERATIONS", active: opts.active ?? true } });
  const u = await prisma.user.create({ data: { email: opts.email ?? `${code.toLowerCase()}@orbit.so`, status: "ACTIVE", employeeId: e.id } });
  if (opts.password) await setPassword(prisma, u.id, opts.password);
  return u;
}

// ------------------------------------------------------------- sign-in

describe("customer sign-in: Reference + Gmail + password", () => {
  it("accepts the right Reference (any case) and password", async () => {
    const { u } = await activeCustomerUser("OR-3001");
    expect((await verifyCustomerLogin(prisma, "or-3001 ", " OR-3001@shop.so", "cust-pass-123"))?.id).toBe(u.id);
  });

  it("refuses a wrong password or Gmail, an unknown or suspended customer, and an account with no password yet", async () => {
    await activeCustomerUser("OR-3001");
    expect(await verifyCustomerLogin(prisma, "OR-3001", "or-3001@shop.so", "nope-nope")).toBeNull();
    expect(await verifyCustomerLogin(prisma, "OR-3001", "else@shop.so", "cust-pass-123")).toBeNull();
    expect(await verifyCustomerLogin(prisma, "OR-9999", "or-9999@shop.so", "cust-pass-123")).toBeNull();
    await prisma.customer.update({ where: { ref: "OR-3001" }, data: { status: "SUSPENDED" } });
    expect(await verifyCustomerLogin(prisma, "OR-3001", "or-3001@shop.so", "cust-pass-123")).toBeNull();
    const c = await customer("OR-3002");
    await prisma.user.create({ data: { email: "invited@shop.so", status: "INVITED", customerId: c.id } });
    expect(await verifyCustomerLogin(prisma, "OR-3002", "invited@shop.so", "anything12")).toBeNull();
  });
});

describe("staff sign-in: Employee ID + email + password", () => {
  it("accepts the matching triple and refuses any mismatch", async () => {
    const u = await staffUser("EMP-001", { password: "staff-pass-1" });
    expect((await verifyStaffLogin(prisma, "emp-001", "EMP-001@orbit.so", "staff-pass-1"))?.id).toBe(u.id);
    expect(await verifyStaffLogin(prisma, "EMP-001", "other@orbit.so", "staff-pass-1")).toBeNull();
    expect(await verifyStaffLogin(prisma, "EMP-002", "emp-001@orbit.so", "staff-pass-1")).toBeNull();
    expect(await verifyStaffLogin(prisma, "EMP-001", "emp-001@orbit.so", "wrong-pass")).toBeNull();
  });

  it("refuses an inactive employee", async () => {
    await staffUser("EMP-003", { active: false, password: "staff-pass-1" });
    expect(await verifyStaffLogin(prisma, "EMP-003", "emp-003@orbit.so", "staff-pass-1")).toBeNull();
  });
});

// ------------------------------------------------- first login / forgot password

describe("customer first login / forgot password (Reference + Phone + Email → OTP)", () => {
  it("sends a code only when everything matches, creates the portal account, then sets the password", async () => {
    const c = await customer("OR-3001", { email: "amina@shop.so", phoneKey: "252615550100" });
    await requestCustomerAccess(prisma, { reference: "or-3001", phone: "61 555 0100", email: "Amina@Shop.so" }, send);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: "amina@shop.so", purpose: "CUSTOMER_ACCESS" });
    const user = await prisma.user.findUniqueOrThrow({ where: { customerId: c.id } });
    expect(user.status).toBe("INVITED");

    const token = await verifyCustomerAccess(prisma, { email: "amina@shop.so", code: lastCode() });
    const done = await completeSetPassword(prisma, { token, password: "Harbour7Lamp2", confirm: "Harbour7Lamp2" });
    expect(done.customerRef).toBe("OR-3001");
    expect((await verifyCustomerLogin(prisma, "OR-3001", "amina@shop.so", "Harbour7Lamp2"))?.id).toBe(user.id);
    // The set-password token is single-use.
    await expect(completeSetPassword(prisma, { token, password: "Second9River4", confirm: "Second9River4" })).rejects.toThrow(/expired/i);
  });

  it("silently sends nothing on a wrong phone, wrong email, missing email on file, unknown or suspended customer", async () => {
    await customer("OR-3001", { email: "amina@shop.so", phoneKey: "252615550100" });
    await customer("OR-3002", { phoneKey: "252615550200" }); // no email on file
    await customer("OR-3003", { email: "s@shop.so", phoneKey: "252615550300", status: "SUSPENDED" });
    const tries = [
      { reference: "OR-3001", phone: "61 555 0199", email: "amina@shop.so" },
      { reference: "OR-3001", phone: "61 555 0100", email: "else@shop.so" },
      { reference: "OR-3002", phone: "61 555 0200", email: "x@shop.so" },
      { reference: "OR-9999", phone: "61 555 0100", email: "amina@shop.so" },
      { reference: "OR-3003", phone: "61 555 0300", email: "s@shop.so" },
    ];
    for (const input of tries) await expect(requestCustomerAccess(prisma, input, send)).resolves.toBeUndefined();
    expect(outbox).toHaveLength(0);
    expect(await prisma.user.count()).toBe(0);
  });

  it("rejects malformed input, and rate-limits a Reference after 5 mismatches", async () => {
    await expect(requestCustomerAccess(prisma, { reference: "", phone: "", email: "bad" }, send)).rejects.toThrow(/reference, phone number and email/i);
    await customer("OR-3001", { email: "amina@shop.so", phoneKey: "252615550100" });
    for (let i = 0; i < 5; i++) await requestCustomerAccess(prisma, { reference: "OR-3001", phone: "61 000 0000", email: "amina@shop.so" }, send);
    await expect(requestCustomerAccess(prisma, { reference: "OR-3001", phone: "61 555 0100", email: "amina@shop.so" }, send)).rejects.toThrow(/too many/i);
    expect(outbox).toHaveLength(0);
  });
});

// ------------------------------------------------------------------- OTP rules

describe("one-time code rules", () => {
  async function codeFor(email = "amina@shop.so") {
    await customer("OR-3001", { email, phoneKey: "252615550100" });
    await requestCustomerAccess(prisma, { reference: "OR-3001", phone: "615550100", email }, send);
    return lastCode();
  }

  it("locks after the maximum wrong attempts, even for the right code afterwards", async () => {
    const code = await codeFor();
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await expect(verifyCustomerAccess(prisma, { email: "amina@shop.so", code: wrong(code) })).rejects.toThrow(/invalid or expired/i);
    }
    await expect(verifyCustomerAccess(prisma, { email: "amina@shop.so", code })).rejects.toThrow(/invalid or expired/i);
  });

  it("is single-use and expires", async () => {
    const code = await codeFor();
    await verifyCustomerAccess(prisma, { email: "amina@shop.so", code });
    await expect(verifyCustomerAccess(prisma, { email: "amina@shop.so", code })).rejects.toThrow(/invalid or expired/i);

    await requestCustomerAccess(prisma, { reference: "OR-3001", phone: "615550100", email: "amina@shop.so" }, send);
    await prisma.otpCode.updateMany({ where: { consumedAt: null }, data: { expiresAt: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 20 * 60 * 1000) } });
    await expect(verifyCustomerAccess(prisma, { email: "amina@shop.so", code: lastCode() })).rejects.toThrow(/invalid or expired/i);
  });

  it("a resent code retires the previous one; codes are stored only as hashes", async () => {
    const first = await codeFor();
    await requestCustomerAccess(prisma, { reference: "OR-3001", phone: "615550100", email: "amina@shop.so" }, send);
    const second = lastCode();
    if (first !== second) await expect(verifyCustomerAccess(prisma, { email: "amina@shop.so", code: first })).rejects.toThrow();
    const rows = await prisma.otpCode.findMany();
    expect(rows.every((r) => r.codeHash !== first && r.codeHash !== second && /^[0-9a-f]{64}$/.test(r.codeHash))).toBe(true);
    await expect(verifyCustomerAccess(prisma, { email: "amina@shop.so", code: second })).resolves.toBeTruthy();
  });

  it("limits how many codes one email can request", async () => {
    await customer("OR-3001", { email: "amina@shop.so", phoneKey: "252615550100" });
    for (let i = 0; i < 5; i++) await requestCustomerAccess(prisma, { reference: "OR-3001", phone: "615550100", email: "amina@shop.so" }, send);
    await expect(requestCustomerAccess(prisma, { reference: "OR-3001", phone: "615550100", email: "amina@shop.so" }, send)).rejects.toThrow(/too many/i);
  });
});

// ------------------------------------------------------------------ signup

describe("customer self-registration (Create New Account)", () => {
  const form = { name: "Amina Ali", phone: "61 555 0100", email: "Amina@Shop.so", company: "Amina Trading", location: "Mogadishu, Bakara", cargoCategory: "Clothes" };

  it("creates the customer only after the code verifies, with the Reference in an in-app notification", async () => {
    await startCustomerSignup(prisma, form, send);
    expect(await prisma.customer.count()).toBe(0); // nothing created before verification
    const { reference, token } = await verifyCustomerSignup(prisma, { email: "amina@shop.so", code: lastCode() });
    expect(reference).toBe("OR-3000");

    const c = await prisma.customer.findUniqueOrThrow({ where: { ref: reference }, include: { user: true, notifications: true } });
    expect([c.company, c.location, c.cargoCategory, c.email, c.phone, c.phoneKey]).toEqual([
      "Amina Trading",
      "Mogadishu, Bakara",
      "Clothes",
      "amina@shop.so",
      "+252 61 555 0100",
      "252615550100",
    ]);
    expect(c.notifications).toHaveLength(1);
    expect(c.notifications[0]!.message).toContain("OR-3000");
    expect(c.notifications[0]!.status).toBe("SENT");

    await completeSetPassword(prisma, { token, password: "Kettle5Moon8", confirm: "Kettle5Moon8" });
    expect((await verifyCustomerLogin(prisma, "OR-3000", "amina@shop.so", "Kettle5Moon8"))?.id).toBe(c.user!.id);
  });

  it("rejects missing fields and an email or phone that is already registered", async () => {
    await expect(startCustomerSignup(prisma, { ...form, company: " " }, send)).rejects.toThrow(/required fields/i);
    await customer("OR-3001", { email: "amina@shop.so" });
    await expect(startCustomerSignup(prisma, form, send)).rejects.toThrow(/already registered/i);
    await expect(startCustomerSignup(prisma, { ...form, email: "new@shop.so", phone: "+252615550100" }, send).then(() => "sent")).resolves.toBe("sent");
    await customer("OR-3002", { phoneKey: "252615550100" });
    await expect(startCustomerSignup(prisma, { ...form, email: "third@shop.so" }, send)).rejects.toThrow(/already registered/i);
    expect(outbox).toHaveLength(1);
  });

  it("re-checks duplicates at verification time", async () => {
    await startCustomerSignup(prisma, form, send);
    await customer("OR-3005", { email: "amina@shop.so" }); // registered by staff meanwhile
    await expect(verifyCustomerSignup(prisma, { email: "amina@shop.so", code: lastCode() })).rejects.toThrow(/already registered/i);
    expect(await prisma.customer.count()).toBe(1);
  });
});

// ------------------------------------------------------------- staff setup

describe("staff Create Password (Employee ID → email code → password)", () => {
  it("sends a code for the right Employee ID + email and lets them set a password", async () => {
    const u = await staffUser("EMP-004", { email: "ops@orbit.so" });
    await requestStaffSetup(prisma, { employeeId: "emp-004", email: "OPS@orbit.so" }, send);
    expect(outbox[0]).toMatchObject({ to: "ops@orbit.so", purpose: "STAFF_SETUP" });
    const token = await verifyStaffSetup(prisma, { email: "ops@orbit.so", code: lastCode() });
    const done = await completeSetPassword(prisma, { token, password: "Window3Cedar6", confirm: "Window3Cedar6" });
    expect(done.employeeId).toBe("EMP-004");
    expect((await verifyStaffLogin(prisma, "EMP-004", "ops@orbit.so", "Window3Cedar6"))?.id).toBe(u.id);
  });

  it("sends nothing for a wrong email, an inactive employee, or a customer's email", async () => {
    await staffUser("EMP-005", { email: "a@orbit.so" });
    await staffUser("EMP-006", { email: "b@orbit.so", active: false });
    await activeCustomerUser("OR-3001");
    await requestStaffSetup(prisma, { employeeId: "EMP-005", email: "x@orbit.so" }, send);
    await requestStaffSetup(prisma, { employeeId: "EMP-006", email: "b@orbit.so" }, send);
    await requestStaffSetup(prisma, { employeeId: "EMP-007", email: "or-3001@shop.so" }, send);
    expect(outbox).toHaveLength(0);
    await expect(requestStaffSetup(prisma, { employeeId: "OR-3001", email: "a@orbit.so" }, send)).rejects.toThrow(/employee id/i);
  });

  it("a customer code can't be used for staff setup and vice versa", async () => {
    await staffUser("EMP-008", { email: "same@orbit.so" });
    await requestStaffSetup(prisma, { employeeId: "EMP-008", email: "same@orbit.so" }, send);
    await expect(verifyCustomerAccess(prisma, { email: "same@orbit.so", code: lastCode() })).rejects.toThrow(/invalid or expired/i);
  });
});

describe("set password rules", () => {
  it("enforces 8+ characters and a matching confirmation, without consuming the token", async () => {
    await staffUser("EMP-009", { email: "c@orbit.so" });
    await requestStaffSetup(prisma, { employeeId: "EMP-009", email: "c@orbit.so" }, send);
    const token = await verifyStaffSetup(prisma, { email: "c@orbit.so", code: lastCode() });
    await expect(completeSetPassword(prisma, { token, password: "short", confirm: "short" })).rejects.toThrow(/at least 10/i);
    await expect(completeSetPassword(prisma, { token, password: "Garden4Stone9", confirm: "different!" })).rejects.toThrow(/do not match/i);
    await expect(completeSetPassword(prisma, { token, password: "Garden4Stone9", confirm: "Garden4Stone9" })).resolves.toBeTruthy();
  });
});

// ------------------------------------------------------- Employee ID backfill

describe("ensureEmployeeForUser (Employee ID backfill)", () => {
  it("assigns the next EMP code with a role-derived department, and is idempotent", async () => {
    await staffUser("EMP-007");
    const role = await prisma.role.create({ data: { key: "finance_staff", name: "Finance Staff" } });
    const u = await prisma.user.create({ data: { email: "fin@orbit.so", status: "ACTIVE" } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    const code = await ensureEmployeeForUser(prisma, u.id);
    expect(code).toBe("EMP-008");
    expect(await ensureEmployeeForUser(prisma, u.id)).toBe("EMP-008");
    expect((await prisma.employee.findUniqueOrThrow({ where: { code } })).department).toBe("FINANCE");
  });

  it("never turns a customer account into staff", async () => {
    const { u } = await activeCustomerUser("OR-3010");
    await expect(ensureEmployeeForUser(prisma, u.id)).rejects.toThrow(/customer account/);
    expect(await prisma.employee.count()).toBe(0);
  });

  it("maps role keys to departments", () => {
    expect(departmentForRoles(["super_admin"])).toBe("MANAGEMENT");
    expect(departmentForRoles(["operation_staff"])).toBe("OPERATIONS");
    expect(departmentForRoles(["report_manager", "customer_support"])).toBe("CUSTOMER_SERVICE");
    expect(departmentForRoles([])).toBe("MANAGEMENT");
  });
});
