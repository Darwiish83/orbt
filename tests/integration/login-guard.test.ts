import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setPassword, verifyStaffLogin } from "@/modules/auth/accounts";
import {
  assertLoginAllowed,
  clientIp,
  IP_MAX_FAILURES,
  isLocked,
  LOCK_AFTER_FAILURES,
  loginTargetUserId,
  recordLoginOutcome,
} from "@/modules/auth/loginGuard";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

async function staff(code: string, email: string) {
  const e = await prisma.employee.create({ data: { code, name: code, department: "OPERATIONS" } });
  const u = await prisma.user.create({ data: { email, status: "ACTIVE", employeeId: e.id } });
  await setPassword(prisma, u.id, "Window3Cedar6");
  return u;
}

/** One failed login, recorded the way authorize() does it. */
async function fail(id: string, email: string, ip: string | null = null) {
  await assertLoginAllowed(prisma, { id, email, ip });
  await recordLoginOutcome(prisma, { id, email, ip }, false, await loginTargetUserId(prisma, "staff", id));
}

describe("login hardening without a second factor (ADR-028)", () => {
  it("stops an ID after 5 failures, whichever email is used", async () => {
    await staff("EMP-001", "a@orbit.so");
    for (let i = 0; i < 5; i++) await fail("EMP-001", `guess${i}@x.so`);
    await expect(assertLoginAllowed(prisma, { id: "emp-001", email: "a@orbit.so", ip: null })).rejects.toThrow(/too many/i);
  });

  it("stops an email after 5 failures, whichever ID is used", async () => {
    for (let i = 0; i < 5; i++) await fail(`EMP-10${i}`, "target@orbit.so");
    await expect(assertLoginAllowed(prisma, { id: "EMP-999", email: "TARGET@orbit.so", ip: null })).rejects.toThrow(/too many/i);
  });

  it("stops an IP that sprays many different accounts", async () => {
    for (let i = 0; i < IP_MAX_FAILURES; i++) await prisma.loginAttempt.create({ data: { identifier: `id-${i}`, ip: "203.0.113.7", kind: "login", success: false } });
    await expect(assertLoginAllowed(prisma, { id: "EMP-500", email: "new@orbit.so", ip: "203.0.113.7" })).rejects.toThrow(/too many/i);
    await expect(assertLoginAllowed(prisma, { id: "EMP-500", email: "new@orbit.so", ip: "198.51.100.1" })).resolves.toBeUndefined();
  });

  it("locks the account after 10 failures in an hour, and the right password no longer opens it", async () => {
    const u = await staff("EMP-002", "b@orbit.so");
    // 9 earlier failures within the hour (from different emails/IPs, so only the ID count matters)…
    for (let i = 0; i < LOCK_AFTER_FAILURES - 1; i++) {
      await prisma.loginAttempt.create({ data: { identifier: "emp-002", kind: "login", success: false, createdAt: new Date(Date.now() - 20 * 60 * 1000) } });
    }
    // …and the 10th locks the account.
    await recordLoginOutcome(prisma, { id: "EMP-002", email: "x@x.so", ip: null }, false, u.id);
    const locked = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(isLocked(locked)).toBe(true);
    // The password itself is still right, but authorize() refuses a locked account.
    const found = await verifyStaffLogin(prisma, "EMP-002", "b@orbit.so", "Window3Cedar6");
    expect(found && isLocked(found)).toBe(true);
  });

  it("records attempts under both the ID and the email, with the IP", async () => {
    await recordLoginOutcome(prisma, { id: "OR-3001", email: "Amina@Shop.so", ip: "192.0.2.1" }, false, null);
    const rows = await prisma.loginAttempt.findMany({ orderBy: { identifier: "asc" } });
    expect(rows.map((r) => [r.identifier, r.ip, r.success])).toEqual([
      ["amina@shop.so", "192.0.2.1", false],
      ["or-3001", "192.0.2.1", false],
    ]);
  });

  it("reads the client IP from proxy headers, first hop only", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers())).toBeNull();
    expect(clientIp(undefined)).toBeNull();
  });
});
