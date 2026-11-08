import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RateLimitError } from "@/lib/errors";
import { setPassword } from "@/modules/auth/accounts";
import { requestStaffSetup } from "@/modules/auth/flows";
import {
  assertLoginAllowed,
  authenticate,
  clientIp,
  ID_MAX_FAILURES,
  IP_MAX_FAILURES,
  type LoginCredentials,
  recordLoginOutcome,
} from "@/modules/auth/loginGuard";
import { SUPER_ADMIN_ROLE_KEY } from "@/modules/authz/permissions";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

/**
 * Login hardening (ADR-028) after security finding M3: failures are throttled
 * per client IP, never account-wide, so knowing an Employee ID, Customer
 * Reference or email can't shut the real person out.
 */
beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

const PASSWORD = "Window3Cedar6";
const ATTACKER = "203.0.113.66";
const OWNER = "198.51.100.10";

async function staff(code: string, email: string, opts: { superAdmin?: boolean } = {}) {
  const e = await prisma.employee.create({ data: { code, name: code, department: "MANAGEMENT" } });
  const u = await prisma.user.create({ data: { email, status: "ACTIVE", employeeId: e.id } });
  await setPassword(prisma, u.id, PASSWORD);
  if (opts.superAdmin) {
    const role = await prisma.role.upsert({ where: { key: SUPER_ADMIN_ROLE_KEY }, update: {}, create: { key: SUPER_ADMIN_ROLE_KEY, name: "Super Admin", isSystem: true } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
  }
  return u;
}

const asStaff = (employeeId: string, email: string, password: string): LoginCredentials => ({ kind: "staff", employeeId, email, password });

/** One sign-in through the real check; "throttled" when this IP is over a limit. */
async function signIn(c: LoginCredentials, ip: string | null) {
  try {
    return (await authenticate(prisma, c, ip)) ? "ok" : "refused";
  } catch (e) {
    if (e instanceof RateLimitError) return "throttled";
    throw e;
  }
}

describe("M3: failed sign-ins from one IP never lock the account for anyone else", () => {
  it("30 attacks on the Super Admin from one IP: the owner on another IP still signs in, and nothing is locked", async () => {
    const admin = await staff("EMP-001", "owner@orbit.so", { superAdmin: true });
    const results = [];
    for (let i = 0; i < 30; i++) results.push(await signIn(asStaff("EMP-001", "owner@orbit.so", `wrong-${i}`), ATTACKER));
    expect(results.filter((r) => r === "refused")).toHaveLength(ID_MAX_FAILURES);
    expect(results.filter((r) => r === "throttled")).toHaveLength(30 - ID_MAX_FAILURES);
    expect(await signIn(asStaff("EMP-001", "owner@orbit.so", PASSWORD), OWNER)).toBe("ok");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).lockedUntil).toBeNull();
  });

  it("attacks spread over many IPs and an hour still never lock the account", async () => {
    const u = await staff("EMP-002", "b@orbit.so", { superAdmin: true });
    for (let i = 0; i < 40; i++) await signIn(asStaff("EMP-002", "b@orbit.so", "nope"), `203.0.113.${i + 1}`);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).lockedUntil).toBeNull();
    expect(await signIn(asStaff("EMP-002", "b@orbit.so", PASSWORD), OWNER)).toBe("ok");
  });

  it("wrong ID/email combinations can't change another account's state", async () => {
    const created = await staff("EMP-003", "victim@orbit.so");
    const victim = await prisma.user.findUniqueOrThrow({ where: { id: created.id } }); // state after setup
    // The victim's ID with guessed emails, and the victim's email with guessed IDs.
    for (let i = 0; i < 10; i++) await signIn(asStaff("EMP-003", `guess${i}@x.so`, PASSWORD), ATTACKER);
    for (let i = 0; i < 10; i++) await signIn(asStaff(`EMP-9${i}`, "victim@orbit.so", PASSWORD), ATTACKER);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
    expect([after.lockedUntil, after.status, after.sessionEpoch]).toEqual([null, victim.status, victim.sessionEpoch]);
    expect(await signIn(asStaff("EMP-003", "victim@orbit.so", PASSWORD), OWNER)).toBe("ok");
    expect(await signIn(asStaff("EMP-003", "victim@orbit.so", PASSWORD), "192.0.2.77")).toBe("ok");
  });

  it("valid credentials work after an attacker triggers its own limit, and the attacker IP stays throttled", async () => {
    await staff("EMP-004", "d@orbit.so");
    for (let i = 0; i < ID_MAX_FAILURES; i++) await signIn(asStaff("EMP-004", "d@orbit.so", "bad"), ATTACKER);
    // The throttled IP can't keep guessing, even with the right password…
    expect(await signIn(asStaff("EMP-004", "d@orbit.so", PASSWORD), ATTACKER)).toBe("throttled");
    // …while the owner, from their own address, signs in.
    expect(await signIn(asStaff("EMP-004", "d@orbit.so", PASSWORD), OWNER)).toBe("ok");
  });

  it("the attacker's limit expires after its window (old failures stop counting)", async () => {
    await staff("EMP-005", "e@orbit.so");
    const old = new Date(Date.now() - 16 * 60 * 1000);
    for (let i = 0; i < ID_MAX_FAILURES; i++) {
      await prisma.loginAttempt.create({ data: { identifier: "emp-005", ip: ATTACKER, kind: "login", success: false, createdAt: old } });
    }
    expect(await signIn(asStaff("EMP-005", "e@orbit.so", PASSWORD), ATTACKER)).toBe("ok");
  });

  it("the first-login code request is limited per IP too: a stranger can't block the real person's recovery", async () => {
    const e = await prisma.employee.create({ data: { code: "EMP-006", name: "F", department: "OPERATIONS", active: true } });
    await prisma.user.create({ data: { email: "f@orbit.so", status: "ACTIVE", employeeId: e.id } });
    const sent: string[] = [];
    const send = async (to: string) => void sent.push(to);
    for (let i = 0; i < 6; i++) {
      await requestStaffSetup(prisma, { employeeId: "EMP-006", email: `wrong${i}@x.so` }, send, ATTACKER).catch(() => {});
    }
    await expect(requestStaffSetup(prisma, { employeeId: "EMP-006", email: "f@orbit.so" }, send, ATTACKER)).rejects.toThrow(RateLimitError);
    await requestStaffSetup(prisma, { employeeId: "EMP-006", email: "f@orbit.so" }, send, OWNER);
    expect(sent).toEqual(["f@orbit.so"]);
  });
});

describe("login protections that stay", () => {
  it("an IP is throttled per ID: the 6th try is refused whatever the email or password", async () => {
    await staff("EMP-010", "a@orbit.so");
    for (let i = 0; i < ID_MAX_FAILURES; i++) await signIn(asStaff("EMP-010", `guess${i}@x.so`, PASSWORD), ATTACKER);
    expect(await signIn(asStaff("emp-010", "a@orbit.so", PASSWORD), ATTACKER)).toBe("throttled");
  });

  it("an IP is throttled per email: one email tried against many IDs", async () => {
    for (let i = 0; i < ID_MAX_FAILURES; i++) await signIn(asStaff(`EMP-10${i}`, "target@orbit.so", PASSWORD), ATTACKER);
    expect(await signIn(asStaff("EMP-999", "TARGET@orbit.so", PASSWORD), ATTACKER)).toBe("throttled");
    expect(await signIn(asStaff("EMP-999", "TARGET@orbit.so", PASSWORD), OWNER)).toBe("refused"); // unknown ID: just a wrong login
  });

  it("an IP that sprays many accounts is stopped", async () => {
    for (let i = 0; i < IP_MAX_FAILURES; i++) await prisma.loginAttempt.create({ data: { identifier: `id-${i}`, ip: ATTACKER, kind: "login", success: false } });
    await expect(assertLoginAllowed(prisma, { id: "EMP-500", email: "new@orbit.so", ip: ATTACKER })).rejects.toThrow(/too many/i);
    await expect(assertLoginAllowed(prisma, { id: "EMP-500", email: "new@orbit.so", ip: OWNER })).resolves.toBeUndefined();
  });

  it("no enumeration: a real and a made-up ID are refused and throttled the same way", async () => {
    await staff("EMP-020", "real@orbit.so");
    const real: string[] = [];
    const fake: string[] = [];
    for (let i = 0; i < ID_MAX_FAILURES + 2; i++) {
      real.push(await signIn(asStaff("EMP-020", "real@orbit.so", "bad"), ATTACKER));
      fake.push(await signIn(asStaff("EMP-021", "fake@orbit.so", "bad"), ATTACKER));
    }
    expect(real).toEqual(fake);
  });

  it("the moment an IP reaches the limit for a real account is audited once, with the IP", async () => {
    const u = await staff("EMP-030", "g@orbit.so");
    for (let i = 0; i < ID_MAX_FAILURES + 3; i++) await signIn(asStaff("EMP-030", "g@orbit.so", "bad"), ATTACKER);
    const events = await prisma.auditEvent.findMany({ where: { action: "auth.login_throttled" } });
    expect(events).toHaveLength(1);
    expect([events[0]!.entityId, (events[0]!.metadata as { ip: string }).ip]).toEqual([u.id, ATTACKER]);
    expect(JSON.stringify(events[0]!.metadata)).not.toContain("bad");
  });

  it("records every attempt under both the ID and the email, with the IP", async () => {
    await recordLoginOutcome(prisma, { id: "OR-3001", email: "Amina@Shop.so", ip: "192.0.2.1" }, false, null);
    const rows = await prisma.loginAttempt.findMany({ orderBy: { identifier: "asc" } });
    expect(rows.map((r) => [r.identifier, r.ip, r.success])).toEqual([
      ["amina@shop.so", "192.0.2.1", false],
      ["or-3001", "192.0.2.1", false],
    ]);
  });

  it("a successful sign-in records lastLoginAt and clears a lockedUntil left by the old lockout", async () => {
    const u = await staff("EMP-040", "h@orbit.so");
    await prisma.user.update({ where: { id: u.id }, data: { lockedUntil: new Date(Date.now() + 10 * 60 * 1000) } });
    expect(await signIn(asStaff("EMP-040", "h@orbit.so", PASSWORD), OWNER)).toBe("ok");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.lockedUntil).toBeNull();
    expect(after.lastLoginAt).not.toBeNull();
  });

  it("a suspended account or inactive employee still can't sign in", async () => {
    const u = await staff("EMP-050", "s@orbit.so");
    await prisma.user.update({ where: { id: u.id }, data: { status: "SUSPENDED" } });
    expect(await signIn(asStaff("EMP-050", "s@orbit.so", PASSWORD), OWNER)).toBe("refused");
    const v = await staff("EMP-051", "t@orbit.so");
    await prisma.employee.update({ where: { id: v.employeeId! }, data: { active: false } });
    expect(await signIn(asStaff("EMP-051", "t@orbit.so", PASSWORD), OWNER)).toBe("refused");
  });

  it("reads the client IP only from our trusted proxy's entry (rightmost), never a client-supplied one", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }), 1)).toBe("10.0.0.1");
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4" }), 1)).toBeNull();
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9" }), 0)).toBeNull();
    expect(clientIp(new Headers(), 1)).toBeNull();
    expect(clientIp(undefined, 1)).toBeNull();
  });
});
