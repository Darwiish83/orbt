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
