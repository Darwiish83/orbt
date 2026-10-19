import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/modules/auth/password";
import { verifyCredentials, setPassword, assignRole, invalidateSessions } from "@/modules/auth/accounts";
import { createResetToken, consumeResetToken } from "@/modules/auth/reset";
import { assertNotRateLimited, recordAttempt } from "@/modules/auth/rateLimit";
import {
  assertCustomerAccess,
  loadAuthzUser,
  requirePermission,
  type AuthzUser,
} from "@/modules/authz/core";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

// --- helpers -----------------------------------------------------------------

async function makeRole(key: string, perms: string[] = []) {
  const role = await prisma.role.create({ data: { key, name: key } });
  for (const p of perms) {
    const permission = await prisma.permission.upsert({ where: { key: p }, create: { key: p }, update: {} });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  return role;
}

async function makeUser(opts: { email: string; roleId?: string; customerId?: string; status?: "ACTIVE" | "SUSPENDED" }) {
  const user = await prisma.user.create({
    data: { email: opts.email.toLowerCase(), status: opts.status ?? "ACTIVE", customerId: opts.customerId },
  });
  if (opts.roleId) await prisma.userRole.create({ data: { userId: user.id, roleId: opts.roleId } });
  return user;
}

async function authz(userId: string): Promise<AuthzUser> {
  const u = await loadAuthzUser(prisma, userId);
  if (!u) throw new Error("expected an active authz user");
  return u;
}

// --- password hashing --------------------------------------------------------

describe("password hashing (Argon2id)", () => {
  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong password")).toBe(false);
  });
});

// --- deny by default + permission checks ------------------------------------

describe("authorization — deny by default", () => {
  it("a user with no roles is denied every permission", async () => {
    const u = await makeUser({ email: "noroles@orbit.so" });
    const user = await authz(u.id);
    expect(() => requirePermission(user, "customers:read")).toThrow();
    expect(() => requirePermission(user, "invoices:manage")).toThrow();
  });

  it("suspended accounts resolve to no authz user (denied)", async () => {
    const u = await makeUser({ email: "suspended@orbit.so", status: "SUSPENDED" });
    expect(await loadAuthzUser(prisma, u.id)).toBeNull();
  });

  it("operations staff cannot perform finance operations, finance admin can", async () => {
    const ops = await makeRole("operation_staff", ["shipments:write"]);
    const fin = await makeRole("finance_admin", ["invoices:manage"]);
    const opsUser = await authz((await makeUser({ email: "ops@orbit.so", roleId: ops.id })).id);
    const finUser = await authz((await makeUser({ email: "fin@orbit.so", roleId: fin.id })).id);

    expect(() => requirePermission(opsUser, "invoices:manage")).toThrow();
    expect(() => requirePermission(finUser, "invoices:manage")).not.toThrow();
  });
});

// --- IDOR / cross-customer ---------------------------------------------------

describe("object-level access (IDOR prevention)", () => {
  it("a customer cannot access another customer's data, only their own", async () => {
    const a = await prisma.customer.create({ data: { ref: "OR-3000", name: "A" } });
    const b = await prisma.customer.create({ data: { ref: "OR-3001", name: "B" } });
    const custUser = await authz((await makeUser({ email: "a@cust.so", customerId: a.id })).id);

    expect(() => assertCustomerAccess(custUser, b.id, "customers:read")).toThrow(/cross-customer/i);
    expect(() => assertCustomerAccess(custUser, a.id, "customers:read")).not.toThrow();
  });

  it("staff without the permission cannot access customer data", async () => {
    const c = await prisma.customer.create({ data: { ref: "OR-3002", name: "C" } });
    const role = await makeRole("document_officer", ["documents:read"]);
    const staff = await authz((await makeUser({ email: "doc@orbit.so", roleId: role.id })).id);
    expect(() => assertCustomerAccess(staff, c.id, "customers:read")).toThrow();
  });
});

// --- privilege escalation / self-grant --------------------------------------

describe("role assignment guards", () => {
  it("prevents a user from modifying their own roles (no self-escalation)", async () => {
    const su = await makeRole("super_admin", []);
    const admin = await makeUser({ email: "admin@orbit.so", roleId: su.id });
    const adminAuthz = await authz(admin.id);
    await expect(assignRole(prisma, adminAuthz, admin.id, "super_admin")).rejects.toThrow(/own roles/i);
  });

  it("prevents a non-superadmin from granting super_admin", async () => {
    const su = await makeRole("super_admin", []);
    await makeRole("operation_staff", []);
    // An actor with users:manage but not super admin.
    const mgr = await makeRole("user_manager", ["users:manage"]);
    const actor = await authz((await makeUser({ email: "mgr@orbit.so", roleId: mgr.id })).id);
    const target = await makeUser({ email: "target@orbit.so" });
    expect(su).toBeTruthy();
    await expect(assignRole(prisma, actor, target.id, "super_admin")).rejects.toThrow(/super admin/i);
  });

  it("denies role assignment without users:manage", async () => {
    await makeRole("operation_staff", []);
    const weak = await makeRole("weak", ["customers:read"]);
    const actor = await authz((await makeUser({ email: "weak@orbit.so", roleId: weak.id })).id);
    const target = await makeUser({ email: "t2@orbit.so" });
    await expect(assignRole(prisma, actor, target.id, "operation_staff")).rejects.toThrow();
  });

  it("allows a super admin to assign a normal role to another user", async () => {
    const su = await makeRole("super_admin", []);
    await makeRole("operation_staff", []);
    const actor = await authz((await makeUser({ email: "root@orbit.so", roleId: su.id })).id);
    const target = await makeUser({ email: "newstaff@orbit.so" });
    await expect(assignRole(prisma, actor, target.id, "operation_staff")).resolves.toBeUndefined();
    const count = await prisma.userRole.count({ where: { userId: target.id } });
    expect(count).toBe(1);
  });
});

// --- credentials + session invalidation -------------------------------------

describe("credentials & session invalidation", () => {
  it("verifies valid credentials and rejects invalid ones", async () => {
    const u = await makeUser({ email: "login@orbit.so" });
    await setPassword(prisma, u.id, "s3cretpass");
    expect(await verifyCredentials(prisma, "login@orbit.so", "s3cretpass")).not.toBeNull();
    expect(await verifyCredentials(prisma, "login@orbit.so", "wrong")).toBeNull();
    expect(await verifyCredentials(prisma, "ghost@orbit.so", "whatever")).toBeNull();
  });

  it("bumps sessionEpoch on password set and on forced invalidation", async () => {
    const u = await makeUser({ email: "epoch@orbit.so" });
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).sessionEpoch;
    await setPassword(prisma, u.id, "pw12345678");
    const afterSet = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).sessionEpoch;
    await invalidateSessions(prisma, u.id);
    const afterInvalidate = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).sessionEpoch;
    expect(afterSet).toBeGreaterThan(before);
    expect(afterInvalidate).toBeGreaterThan(afterSet);
  });
});

// --- password reset tokens ---------------------------------------------------

describe("password reset tokens", () => {
  it("is single-use and actually changes the password", async () => {
    const u = await makeUser({ email: "reset@orbit.so" });
    await setPassword(prisma, u.id, "oldpassword");
    const token = await createResetToken(prisma, "reset@orbit.so");
    expect(token).toBeTruthy();

    await consumeResetToken(prisma, token!, "brandnewpass");
    expect(await verifyCredentials(prisma, "reset@orbit.so", "brandnewpass")).not.toBeNull();
    // Reuse rejected.
    await expect(consumeResetToken(prisma, token!, "another")).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const u = await makeUser({ email: "expire@orbit.so" });
    const token = await createResetToken(prisma, "expire@orbit.so");
    await prisma.passwordResetToken.updateMany({
      where: { userId: u.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(consumeResetToken(prisma, token!, "whatever12")).rejects.toThrow();
  });

  it("returns null for an unknown email (no account enumeration)", async () => {
    expect(await createResetToken(prisma, "nobody@orbit.so")).toBeNull();
  });
});

// --- rate limiting -----------------------------------------------------------

describe("login rate limiting", () => {
  it("blocks after too many recent failures", async () => {
    const id = "bruteforce@orbit.so";
    for (let i = 0; i < 5; i++) {
      await recordAttempt(prisma, { identifier: id, kind: "login", success: false });
    }
    await expect(assertNotRateLimited(prisma, id, "login")).rejects.toThrow(/too many/i);
  });

  it("does not block a fresh identifier", async () => {
    await expect(assertNotRateLimited(prisma, "fresh@orbit.so", "login")).resolves.toBeUndefined();
  });
});

// --- permission hierarchy ----------------------------------------------------

describe("permission hierarchy (manage ⊇ write ⊇ read)", () => {
  it("lets a holder of :manage perform :write and :read", async () => {
    const role = await makeRole("docs_mgr", ["documents:manage"]);
    const user = await authz((await makeUser({ email: "mgr@orbit.so", roleId: role.id })).id);
    expect(() => requirePermission(user, "documents:manage")).not.toThrow();
    expect(() => requirePermission(user, "documents:write")).not.toThrow();
    expect(() => requirePermission(user, "documents:read")).not.toThrow();
  });

  it("lets a holder of :write perform :read but not :manage", async () => {
    const role = await makeRole("ship_writer", ["shipments:write"]);
    const user = await authz((await makeUser({ email: "writer@orbit.so", roleId: role.id })).id);
    expect(() => requirePermission(user, "shipments:read")).not.toThrow();
    expect(() => requirePermission(user, "shipments:write")).not.toThrow();
    expect(() => requirePermission(user, "shipments:manage")).toThrow();
  });
});
