import type { Department, Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Next free Employee ID (`EMP-001`, `EMP-002`, …). Run inside the creating transaction. */
export async function nextEmployeeCode(db: Db): Promise<string> {
  const emps = await db.employee.findMany({ select: { code: true } });
  let max = 0;
  for (const e of emps) {
    const m = /^EMP-(\d+)$/.exec(e.code);
    if (m) max = Math.max(max, parseInt(m[1]!, 10));
  }
  return `EMP-${String(max + 1).padStart(3, "0")}`;
}

/** Department implied by a staff member's role keys (first match wins). */
export function departmentForRoles(roleKeys: string[]): Department {
  const has = (prefix: string) => roleKeys.some((k) => k.startsWith(prefix));
  if (roleKeys.includes("super_admin")) return "MANAGEMENT";
  if (has("operation")) return "OPERATIONS";
  if (has("finance")) return "FINANCE";
  if (has("customer_support")) return "CUSTOMER_SERVICE";
  if (has("document")) return "DOCUMENTS";
  if (has("report")) return "REPORTS";
  return "MANAGEMENT";
}

/**
 * Make sure a staff user has an Employee record (and therefore an Employee ID
 * to sign in with). No-op if one is linked already. Refuses customer users —
 * a user is either staff or a customer contact, never both.
 */
export async function ensureEmployeeForUser(db: PrismaClient, userId: string): Promise<string> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        email: true,
        customerId: true,
        employee: { select: { code: true } },
        roles: { select: { role: { select: { key: true } } } },
      },
    });
    if (user.employee) return user.employee.code;
    if (user.customerId) throw new Error(`${user.email} is a customer account, not staff`);

    const code = await nextEmployeeCode(tx);
    const employee = await tx.employee.create({
      data: {
        code,
        name: user.email.split("@")[0]!,
        email: user.email,
        department: departmentForRoles(user.roles.map((r) => r.role.key)),
      },
    });
    await tx.user.update({ where: { id: userId }, data: { employeeId: employee.id } });
    return code;
  });
}
