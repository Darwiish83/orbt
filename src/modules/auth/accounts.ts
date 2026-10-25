import type { PrismaClient, User } from "@prisma/client";
import { AuthorizationError } from "@/lib/errors";
import type { AuthzUser } from "@/modules/authz/core";
import { requirePermission } from "@/modules/authz/core";
import { SUPER_ADMIN_ROLE_KEY } from "@/modules/authz/permissions";
import { hashPassword, verifyPassword } from "./password";

/** Cached dummy hash to equalize verify timing when a user/hash is absent
 * (mitigates user enumeration via response timing). */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("x".repeat(24));
  return dummyHashPromise;
}

/** Verify email + password. Returns the user on success, else null. Always
 * performs a hash verification (real or dummy) so timing does not leak whether
 * the account exists. */
export async function verifyCredentials(
  db: PrismaClient,
  email: string,
  password: string,
): Promise<User | null> {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.passwordHash || user.status !== "ACTIVE") {
    await verifyPassword(await getDummyHash(), password);
    return null;
  }
  const ok = await verifyPassword(user.passwordHash, password);
  return ok ? user : null;
}

const normId = (v: string) => v.trim().toUpperCase();

async function checkPassword(user: User | null | undefined, password: string): Promise<User | null> {
  if (!user || !user.passwordHash || user.status !== "ACTIVE") {
    await verifyPassword(await getDummyHash(), password);
    return null;
  }
  return (await verifyPassword(user.passwordHash, password)) ? user : null;
}

/**
 * Customer sign-in (ADR-016, ADR-021): Customer Reference + the account email
 * ("Gmail") + password. The customer must be ACTIVE and have an activated
 * portal account. Constant-ish timing: a hash verification always runs.
 */
export async function verifyCustomerLogin(
  db: PrismaClient,
  reference: string,
  email: string,
  password: string,
): Promise<User | null> {
  const customer = await db.customer.findFirst({
    where: { ref: { equals: normId(reference), mode: "insensitive" } },
    select: { status: true, user: true },
  });
  const user = customer?.status === "ACTIVE" ? customer.user : null;
  return checkPassword(user && user.email === email.trim().toLowerCase() ? user : null, password);
}

/**
 * Staff sign-in (ADR-016): Employee ID + the account email ("Gmail") +
 * password. The employee must be active and the email must be the one on the
 * linked user. A customer account can never sign in here.
 */
export async function verifyStaffLogin(
  db: PrismaClient,
  employeeId: string,
  email: string,
  password: string,
): Promise<User | null> {
  const employee = await db.employee.findFirst({
    where: { code: { equals: normId(employeeId), mode: "insensitive" } },
    select: { active: true, user: true },
  });
  const user = employee?.active ? employee.user : null;
  const emailOk = !!user && user.email === email.trim().toLowerCase() && !user.customerId;
  return checkPassword(emailOk ? user : null, password);
}

/** Set (or reset) a password: hashes, activates the account, and bumps
 * sessionEpoch to invalidate any existing sessions. */
export async function setPassword(db: PrismaClient, userId: string, plain: string): Promise<void> {
  const passwordHash = await hashPassword(plain);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash, status: "ACTIVE", sessionEpoch: { increment: 1 } },
  });
}

/** Force-invalidate all of a user's sessions (e.g. suspend, forced logout). */
export async function invalidateSessions(db: PrismaClient, userId: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { sessionEpoch: { increment: 1 } } });
}

/**
 * Assign a role to a user with privilege-escalation guards:
 * - actor must hold `users:manage`
 * - a user may NOT modify their own roles (no self-escalation)
 * - only a super admin may grant the super_admin role
 */
export async function assignRole(
  db: PrismaClient,
  actor: AuthzUser,
  targetUserId: string,
  roleKey: string,
  scope: { country?: string | null; businessYear?: number | null } = {},
): Promise<void> {
  requirePermission(actor, "users:manage");

  if (actor.id === targetUserId) {
    throw new AuthorizationError("You cannot modify your own roles");
  }
  if (roleKey === SUPER_ADMIN_ROLE_KEY && !actor.isSuperAdmin) {
    throw new AuthorizationError("Only a super admin can grant the super admin role");
  }

  const role = await db.role.findUnique({ where: { key: roleKey } });
  if (!role) throw new AuthorizationError(`Unknown role: ${roleKey}`);

  await db.userRole.create({
    data: {
      userId: targetUserId,
      roleId: role.id,
      country: scope.country ?? null,
      businessYear: scope.businessYear ?? null,
    },
  });
}
