import type { PrismaClient, UserStatus } from "@prisma/client";
import { AuthorizationError } from "@/lib/errors";
import type { Permission } from "./permissions";
import { SUPER_ADMIN_ROLE_KEY } from "./permissions";

/**
 * Pure authorization logic — no Next.js / Auth.js imports, so it is directly
 * unit/integration testable. `getSessionUser` (session.ts) wraps this with the
 * Auth.js session and the sessionEpoch re-check.
 */

export type AuthzScope = { country: string | null; businessYear: number | null };

export interface AuthzUser {
  id: string;
  email: string;
  status: UserStatus;
  employeeId: string | null;
  customerId: string | null;
  sessionEpoch: number;
  mfaEnabled: boolean;
  isSuperAdmin: boolean;
  roleKeys: string[];
  permissions: Set<string>;
  scopes: AuthzScope[];
}

/** Load a user and flatten roles → permissions and scopes. Returns null if the
 * user does not exist or is not ACTIVE (deny by default). */
export async function loadAuthzUser(db: PrismaClient, userId: string): Promise<AuthzUser | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  });
  if (!user || user.status !== "ACTIVE") return null;

  const roleKeys: string[] = [];
  const permissions = new Set<string>();
  const scopes: AuthzScope[] = [];
  for (const ur of user.roles) {
    roleKeys.push(ur.role.key);
    scopes.push({ country: ur.country, businessYear: ur.businessYear });
    for (const rp of ur.role.permissions) permissions.add(rp.permission.key);
  }

  return {
    id: user.id,
    email: user.email,
    status: user.status,
    employeeId: user.employeeId,
    customerId: user.customerId,
    sessionEpoch: user.sessionEpoch,
    mfaEnabled: user.mfaEnabled,
    isSuperAdmin: roleKeys.includes(SUPER_ADMIN_ROLE_KEY),
    roleKeys,
    permissions,
    scopes,
  };
}

export function can(user: AuthzUser, permission: Permission): boolean {
  if (user.isSuperAdmin) return true;
  if (user.permissions.has(permission)) return true;
  // Permission hierarchy within a resource: manage ⊇ write ⊇ read.
  const [resource, action] = permission.split(":");
  if (action === "read") {
    return user.permissions.has(`${resource}:write`) || user.permissions.has(`${resource}:manage`);
  }
  if (action === "write") {
    return user.permissions.has(`${resource}:manage`);
  }
  return false;
}

export function requirePermission(user: AuthzUser, permission: Permission): void {
  if (!can(user, permission)) {
    throw new AuthorizationError(`Missing permission: ${permission}`);
  }
}

/**
 * Country/business-year scope check (ADR-002). A scope row with a null dimension
 * means "all" for that dimension. Undefined arguments skip that dimension.
 */
export function hasScope(
  user: AuthzUser,
  opts: { country?: string; businessYear?: number } = {},
): boolean {
  if (user.isSuperAdmin) return true;
  return user.scopes.some(
    (s) =>
      (opts.country === undefined || s.country === null || s.country === opts.country) &&
      (opts.businessYear === undefined ||
        s.businessYear === null ||
        s.businessYear === opts.businessYear),
  );
}

export function requireScope(
  user: AuthzUser,
  opts: { country?: string; businessYear?: number } = {},
): void {
  if (!hasScope(user, opts)) {
    throw new AuthorizationError("Outside your assigned country/year scope");
  }
}

/**
 * Object-level ownership for customer-scoped data. A customer principal may only
 * access its own customer id; a staff principal must hold the given permission.
 * Prevents IDOR / cross-customer access.
 */
export function assertCustomerAccess(
  user: AuthzUser,
  customerId: string,
  staffPermission: Permission,
): void {
  if (user.customerId) {
    if (user.customerId !== customerId) {
      throw new AuthorizationError("Cross-customer access denied");
    }
    return;
  }
  // Staff principal.
  requirePermission(user, staffPermission);
}

export function isCustomerPrincipal(user: AuthzUser): boolean {
  return user.customerId !== null;
}

/**
 * The set of countries a staff user is scoped to, or `null` meaning "all"
 * (super admin, or any role scope with a null country). Used to filter list
 * queries server-side.
 */
export function allowedCountries(user: AuthzUser): string[] | null {
  if (user.isSuperAdmin) return null;
  const countries = new Set<string>();
  for (const s of user.scopes) {
    if (s.country === null) return null; // a global-country scope → all
    countries.add(s.country);
  }
  return [...countries];
}
