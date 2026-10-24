import type { AccessLevel, Department, Prisma, PrismaClient, TransferRole } from "@prisma/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import { requirePermission, type AuthzUser } from "@/modules/authz/core";
import { ADMIN_MODULES, MODULE_KEYS, moduleLevel, modulePermissions } from "@/modules/authz/modules";
import { CUSTOMER_ROLE_KEY, SUPER_ADMIN_ROLE_KEY } from "@/modules/authz/permissions";
import { nextEmployeeCode } from "./employeeCode";

/**
 * Users & Team (spec B4 / revised prompt §5): employees, their roles, module
 * access (No access / View only / Full), special access (Accounting, Money
 * Transfer role + countries), responsible countries and an access time window.
 * All of it is enforced in loadAuthzUser, on every request.
 */

export interface EmployeeRow {
  userId: string;
  employeeId: string;
  code: string;
  name: string;
  phone: string | null;
  email: string;
  department: Department;
  roles: { key: string; name: string }[];
  lastLoginAt: string | null;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  accountingAccess: boolean;
  transferRole: TransferRole;
  countries: string[];
}

export async function listEmployees(db: PrismaClient, actor: AuthzUser, filters: { q?: string; department?: Department } = {}) {
  requirePermission(actor, "users:read");
  const q = filters.q?.trim();
  const users = await db.user.findMany({
    where: {
      customerId: null,
      employee: {
        ...(filters.department ? { department: filters.department } : {}),
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
    },
    include: { employee: { include: { scopes: true } }, roles: { include: { role: true } } },
    orderBy: { employee: { code: "asc" } },
    take: 500,
  });
  const rows: EmployeeRow[] = users
    .filter((u) => u.employee)
    .map((u) => ({
      userId: u.id,
      employeeId: u.employee!.id,
      code: u.employee!.code,
      name: u.employee!.name,
      phone: u.employee!.phone,
      email: u.email,
      department: u.employee!.department,
      roles: [...new Map(u.roles.map((r) => [r.role.key, { key: r.role.key, name: r.role.name }])).values()],
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      status: u.status === "ACTIVE" && !u.employee!.active ? "SUSPENDED" : (u.status as EmployeeRow["status"]),
      accountingAccess: u.employee!.accountingAccess,
      transferRole: u.employee!.transferRole,
      countries: u.employee!.scopes.map((s) => s.country),
    }));
  return {
    rows,
    stats: {
      total: rows.length,
      active: rows.filter((r) => r.status === "ACTIVE").length,
      inactive: rows.filter((r) => r.status !== "ACTIVE").length,
    },
  };
}

export interface EmployeeDetail extends EmployeeRow {
  access: Record<string, AccessLevel | null>;
  transferCountries: string[];
  accessFrom: string | null;
  accessUntil: string | null;
}

export async function getEmployee(db: PrismaClient, actor: AuthzUser, userId: string): Promise<EmployeeDetail> {
  requirePermission(actor, "users:read");
  const u = await db.user.findUnique({
    where: { id: userId },
    include: { employee: { include: { scopes: true, pageAccess: true } }, roles: { include: { role: true } } },
  });
  if (!u?.employee) throw new ValidationError("Employee not found");
  const e = u.employee;
  return {
    userId: u.id,
    employeeId: e.id,
    code: e.code,
    name: e.name,
    phone: e.phone,
    email: u.email,
    department: e.department,
    roles: [...new Map(u.roles.map((r) => [r.role.key, { key: r.role.key, name: r.role.name }])).values()],
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    status: u.status === "ACTIVE" && !e.active ? "SUSPENDED" : (u.status as EmployeeRow["status"]),
    accountingAccess: e.accountingAccess,
    transferRole: e.transferRole,
    countries: e.scopes.map((s) => s.country),
    access: Object.fromEntries(MODULE_KEYS.map((k) => [k, e.pageAccess.find((p) => p.page === k)?.level ?? null])),
    transferCountries: e.transferCountries,
    accessFrom: e.accessFrom?.toISOString().slice(0, 10) ?? null,
    accessUntil: e.accessUntil?.toISOString().slice(0, 10) ?? null,
  };
}

export interface SaveEmployeeInput {
  name: string;
  email: string;
  phone?: string | null;
  department: Department;
  roleKeys: string[];
  /** Responsible countries; empty = all countries. */
  countries: string[];
  /** Per-module override; null/absent = role default. */
  access: Record<string, AccessLevel | null>;
  accountingAccess: boolean;
  transferRole: TransferRole;
  transferCountries: string[];
  accessFrom?: Date | null;
  accessUntil?: Date | null;
}

async function validate(db: PrismaClient | Prisma.TransactionClient, actor: AuthzUser, input: SaveEmployeeInput) {
  if (!input.name.trim()) throw new ValidationError("Name is required");
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ValidationError("Enter a valid email");
  const roles = await db.role.findMany({ where: { key: { in: input.roleKeys } } });
  if (roles.length !== new Set(input.roleKeys).size) throw new ValidationError("Unknown role");
  if (roles.some((r) => r.key === CUSTOMER_ROLE_KEY)) throw new ValidationError("Staff cannot have the customer role");
  if (roles.some((r) => r.key === SUPER_ADMIN_ROLE_KEY) && !actor.isSuperAdmin) {
    throw new AuthorizationError("Only a super admin can grant the super admin role");
  }
  const origin = await db.country.findMany({ where: { active: true, isOrigin: true } });
  const known = new Set(origin.map((c) => c.name));
  for (const c of [...input.countries, ...input.transferCountries]) if (!known.has(c)) throw new ValidationError(`Unknown country: ${c}`);
  if (input.transferRole !== "NONE" && input.transferCountries.length === 0) throw new ValidationError("Choose the Money Transfer countries");
  for (const [k, v] of Object.entries(input.access)) {
    if (!MODULE_KEYS.includes(k)) throw new ValidationError(`Unknown module: ${k}`);
    if (v !== null && !["NONE", "VIEW", "EDIT"].includes(v)) throw new ValidationError("Unknown access level");
  }
  if (input.accessFrom && input.accessUntil && input.accessUntil < input.accessFrom) throw new ValidationError("Access end is before its start");
  return { email, roles };
}

async function writeSettings(tx: Prisma.TransactionClient, employeeId: string, userId: string, input: SaveEmployeeInput, roleIds: string[]) {
  await tx.employee.update({
    where: { id: employeeId },
    data: {
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email.trim().toLowerCase(),
      department: input.department,
      accountingAccess: input.accountingAccess,
      transferRole: input.transferRole,
      transferCountries: input.transferRole === "NONE" ? [] : [...new Set(input.transferCountries)],
      accessFrom: input.accessFrom ?? null,
      accessUntil: input.accessUntil ?? null,
    },
  });
  await tx.employeeScope.deleteMany({ where: { employeeId } });
  if (input.countries.length) await tx.employeeScope.createMany({ data: [...new Set(input.countries)].map((country) => ({ employeeId, country })) });
  await tx.employeePageAccess.deleteMany({ where: { employeeId } });
  const overrides = Object.entries(input.access).filter((e): e is [string, AccessLevel] => !!e[1]);
  if (overrides.length) await tx.employeePageAccess.createMany({ data: overrides.map(([page, level]) => ({ employeeId, page, level })) });
  // Roles: global (country/year scope comes from the responsible countries).
  await tx.userRole.deleteMany({ where: { userId, roleId: { notIn: roleIds } } });
  for (const roleId of roleIds) {
    const has = await tx.userRole.findFirst({ where: { userId, roleId } });
    if (!has) await tx.userRole.create({ data: { userId, roleId } });
  }
}

/** Add Employee: the Employee ID (EMP-###) is assigned automatically; the
 * person sets their password through "Create Password" on the admin login. */
export async function createEmployee(db: PrismaClient, actor: AuthzUser, input: SaveEmployeeInput) {
  requirePermission(actor, "users:manage");
  const { email, roles } = await validate(db, actor, input);
  if (await db.user.findUnique({ where: { email } })) throw new ValidationError("A user with this email already exists");
  return db.$transaction(async (tx) => {
    const code = await nextEmployeeCode(tx);
    const employee = await tx.employee.create({ data: { code, name: input.name.trim(), department: input.department, email } });
    const user = await tx.user.create({ data: { email, status: "INVITED", employeeId: employee.id } });
    await writeSettings(tx, employee.id, user.id, input, roles.map((r) => r.id));
    await logAudit(tx, { actorUserId: actor.id, action: "employee.create", entityType: "Employee", entityId: employee.id, metadata: { code, roles: input.roleKeys } });
    return { userId: user.id, code };
  });
}

export async function updateEmployee(db: PrismaClient, actor: AuthzUser, userId: string, input: SaveEmployeeInput) {
  requirePermission(actor, "users:manage");
  if (actor.id === userId) throw new AuthorizationError("You cannot change your own access");
  const u = await db.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
  if (!u?.employeeId) throw new ValidationError("Employee not found");
  if (u.roles.some((r) => r.role.key === SUPER_ADMIN_ROLE_KEY) && !actor.isSuperAdmin) {
    throw new AuthorizationError("Only a super admin can change a super admin");
  }
  const { email, roles } = await validate(db, actor, input);
  const clash = await db.user.findUnique({ where: { email } });
  if (clash && clash.id !== userId) throw new ValidationError("A user with this email already exists");
  await db.$transaction(async (tx) => {
    if (email !== u.email) await tx.user.update({ where: { id: userId }, data: { email } });
    await writeSettings(tx, u.employeeId!, userId, input, roles.map((r) => r.id));
    await logAudit(tx, { actorUserId: actor.id, action: "employee.update", entityType: "Employee", entityId: u.employeeId!, metadata: { roles: input.roleKeys, access: input.access } });
  });
}

/** Active / Inactive. "Delete Employee" deactivates: history and audit stay. */
export async function setEmployeeActive(db: PrismaClient, actor: AuthzUser, userId: string, active: boolean) {
  requirePermission(actor, "users:manage");
  if (actor.id === userId) throw new AuthorizationError("You cannot change your own status");
  const u = await db.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
  if (!u?.employeeId) throw new ValidationError("Employee not found");
  if (u.roles.some((r) => r.role.key === SUPER_ADMIN_ROLE_KEY) && !actor.isSuperAdmin) throw new AuthorizationError("Only a super admin can change a super admin");
  await db.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: u.employeeId! }, data: { active } });
    if (!active) await tx.user.update({ where: { id: userId }, data: { sessionEpoch: { increment: 1 } } });
    await logAudit(tx, { actorUserId: actor.id, action: active ? "employee.activate" : "employee.deactivate", entityType: "Employee", entityId: u.employeeId! });
  });
}

// ------------------------------------------------------------------ roles & permissions

/** Access Control matrix: each role's level per module (from its permissions). */
export async function roleMatrix(db: PrismaClient, actor: AuthzUser) {
  requirePermission(actor, "users:read");
  const roles = await db.role.findMany({
    where: { key: { notIn: [SUPER_ADMIN_ROLE_KEY, CUSTOMER_ROLE_KEY] } },
    include: { permissions: { include: { permission: true } } },
    orderBy: { name: "asc" },
  });
  return roles.map((r) => {
    const perms = new Set(r.permissions.map((p) => p.permission.key));
    return { key: r.key, name: r.name, levels: Object.fromEntries(ADMIN_MODULES.map((m) => [m.key, moduleLevel(perms, m)])) as Record<string, AccessLevel> };
  });
}

/** Change a role's default for one module (super admin only: it affects everyone with the role). */
export async function setRoleModule(db: PrismaClient, actor: AuthzUser, roleKey: string, moduleKey: string, level: AccessLevel) {
  if (!actor.isSuperAdmin) throw new AuthorizationError("Only a super admin can change role permissions");
  if (roleKey === SUPER_ADMIN_ROLE_KEY || roleKey === CUSTOMER_ROLE_KEY) throw new ValidationError("This role cannot be changed here");
  const role = await db.role.findUnique({ where: { key: roleKey } });
  const m = ADMIN_MODULES.find((x) => x.key === moduleKey);
  if (!role || !m) throw new ValidationError("Unknown role or module");
  const all = modulePermissions(m);
  const keep = level === "EDIT" ? all : level === "VIEW" ? all.filter((p) => p.endsWith(":read")) : [];
  await db.$transaction(async (tx) => {
    const perms = await tx.permission.findMany({ where: { key: { in: all } } });
    await tx.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: { in: perms.map((p) => p.id) } } });
    for (const key of keep) {
      const p = await tx.permission.upsert({ where: { key }, create: { key }, update: {} });
      await tx.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
    }
    await logAudit(tx, { actorUserId: actor.id, action: "role.module", entityType: "Role", entityId: role.id, metadata: { module: moduleKey, level } });
  });
}

// ------------------------------------------------------------------ activity log

const ACTION_KIND: [RegExp, string][] = [
  [/\.(create|invite|add|record|line_add)$/, "Created"],
  [/\.(delete|void|reverse|line_delete|deactivate)$/, "Deleted"],
  [/status|suspend|reactivate|activate/, "Status changed"],
  [/^auth\./, "Login"],
];

export async function listActivity(
  db: PrismaClient,
  actor: AuthzUser,
  filters: { q?: string; actorUserId?: string; entity?: string; day?: string; page?: number } = {},
) {
  requirePermission(actor, "audit:read");
  const page = Math.max(1, filters.page ?? 1);
  const day = filters.day && /^\d{4}-\d{2}-\d{2}$/.test(filters.day) ? new Date(`${filters.day}T00:00:00Z`) : null;
  const where: Prisma.AuditEventWhereInput = {
    ...(filters.actorUserId ? { actorUserId: filters.actorUserId } : {}),
    ...(filters.entity ? { entityType: filters.entity } : {}),
    ...(day ? { createdAt: { gte: day, lt: new Date(day.getTime() + 86_400_000) } } : {}),
    ...(filters.q ? { OR: [{ action: { contains: filters.q, mode: "insensitive" } }, { entityId: { contains: filters.q } }] } : {}),
  };
  const [events, total, today] = await Promise.all([
    db.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, include: { actor: { include: { employee: true } } } }),
    db.auditEvent.count({ where }),
    db.auditEvent.count({ where: { createdAt: { gte: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z") } } }),
  ]);
  return {
    total,
    today,
    page,
    rows: events.map((e) => ({
      id: e.id,
      at: e.createdAt.toISOString(),
      by: e.actor?.employee?.code ?? e.actor?.email ?? "system",
      byName: e.actor?.employee?.name ?? e.actor?.email ?? "-",
      action: e.action,
      kind: ACTION_KIND.find(([re]) => re.test(e.action))?.[1] ?? "Updated",
      entity: e.entityType ?? "-",
      // Metadata is shown as stored; it never holds secrets (see logAudit callers).
      detail: e.metadata ? JSON.stringify(e.metadata).slice(0, 200) : "",
    })),
  };
}
