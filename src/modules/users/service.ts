import type { Department, Prisma, PrismaClient, User } from "@prisma/client";
import { AuthorizationError } from "@/lib/errors";
import { buildPage, normalizePage, type Page, type PageParams } from "@/lib/pagination";
import { logAudit } from "@/modules/audit/log";
import { invalidateSessions } from "@/modules/auth/accounts";
import { requirePermission, type AuthzUser } from "@/modules/authz/core";

async function nextEmployeeCode(db: PrismaClient): Promise<string> {
  const emps = await db.employee.findMany({ select: { code: true } });
  let max = 0;
  for (const e of emps) {
    const m = /^EMP-(\d+)$/.exec(e.code);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `EMP-${String(max + 1).padStart(3, "0")}`;
}

export interface CreateEmployeeUserInput {
  email: string;
  name: string;
  department: Department;
  phone?: string;
}

/** Create a staff member (Employee + linked User) in INVITED status. The user
 * sets their password via the reset flow. */
export async function createEmployeeUser(
  db: PrismaClient,
  actor: AuthzUser,
  input: CreateEmployeeUserInput,
): Promise<User> {
  requirePermission(actor, "users:manage");

  return db.$transaction(async (tx) => {
    const code = await nextEmployeeCode(tx as unknown as PrismaClient);
    const employee = await tx.employee.create({
      data: { code, name: input.name, department: input.department, phone: input.phone, email: input.email.toLowerCase() },
    });
    const user = await tx.user.create({
      data: { email: input.email.toLowerCase(), status: "INVITED", employeeId: employee.id },
    });
    await logAudit(tx, {
      actorUserId: actor.id,
      action: "user.invite",
      entityType: "User",
      entityId: user.id,
      metadata: { code, department: input.department },
    });
    return user;
  });
}

export async function removeRole(
  db: PrismaClient,
  actor: AuthzUser,
  targetUserId: string,
  roleKey: string,
): Promise<void> {
  requirePermission(actor, "users:manage");
  if (actor.id === targetUserId) throw new AuthorizationError("You cannot modify your own roles");
  const role = await db.role.findUnique({ where: { key: roleKey } });
  if (!role) return;
  await db.userRole.deleteMany({ where: { userId: targetUserId, roleId: role.id } });
  await logAudit(db, {
    actorUserId: actor.id,
    action: "user.role_remove",
    entityType: "User",
    entityId: targetUserId,
    metadata: { roleKey },
  });
}

export async function setUserStatus(
  db: PrismaClient,
  actor: AuthzUser,
  targetUserId: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<User> {
  requirePermission(actor, "users:manage");
  if (actor.id === targetUserId) throw new AuthorizationError("You cannot change your own status");
  const user = await db.user.update({ where: { id: targetUserId }, data: { status } });
  if (status === "SUSPENDED") await invalidateSessions(db, targetUserId);
  await logAudit(db, {
    actorUserId: actor.id,
    action: status === "SUSPENDED" ? "user.suspend" : "user.reactivate",
    entityType: "User",
    entityId: targetUserId,
  });
  return user;
}

export async function listUsers(
  db: PrismaClient,
  actor: AuthzUser,
  filters: PageParams = {},
): Promise<Page<User & { roles: { role: { key: string; name: string } }[]; employee: { code: string } | null }>> {
  requirePermission(actor, "users:read");
  const { page, pageSize, skip, take } = normalizePage(filters);
  const where: Prisma.UserWhereInput = { customerId: null }; // staff only

  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { roles: { include: { role: { select: { key: true, name: true } } } }, employee: { select: { code: true } } },
    }),
    db.user.count({ where }),
  ]);
  return buildPage(items, total, page, pageSize);
}
