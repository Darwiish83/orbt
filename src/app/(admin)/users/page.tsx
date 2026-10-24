import type { Department } from "@prisma/client";
import { prisma } from "@/db/client";
import { AuthorizationError } from "@/lib/errors";
import { can } from "@/modules/authz/core";
import { ADMIN_MODULES } from "@/modules/authz/modules";
import { requireUser } from "@/modules/authz/session";
import { listActivity, listEmployees, roleMatrix } from "@/modules/users/admin";
import { UsersView } from "./UsersView";

export const metadata = { title: "Users & Team" };

const DEPTS: Department[] = ["MANAGEMENT", "OPERATIONS", "FINANCE", "CUSTOMER_SERVICE", "DOCUMENTS", "REPORTS"];

/** Users & Team (spec B4 / §5): shared by all countries. */
export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (!can(user, "users:read")) throw new AuthorizationError("Missing permission: users:read");
  const sp = await searchParams;
  const tab = sp.tab === "roles" || sp.tab === "activity" ? sp.tab : "team";
  const dept = DEPTS.includes(sp.dept as Department) ? (sp.dept as Department) : undefined;
  const [team, matrix, roles, countries] = await Promise.all([
    listEmployees(prisma, user, { q: sp.q, department: dept }),
    roleMatrix(prisma, user),
    prisma.role.findMany({ where: { key: { not: "customer" } }, orderBy: { name: "asc" }, select: { key: true, name: true } }),
    prisma.country.findMany({ where: { active: true, isOrigin: true }, orderBy: { createdAt: "asc" }, select: { name: true } }),
  ]);
  const activity =
    tab === "activity" && can(user, "audit:read")
      ? await listActivity(prisma, user, { q: sp.aq, entity: sp.entity, day: sp.day, page: Number(sp.page) || 1 })
      : null;
  return (
    <UsersView
      tab={tab}
      filters={{ q: sp.q ?? "", dept: dept ?? "ALL", aq: sp.aq ?? "", entity: sp.entity ?? "", day: sp.day ?? "" }}
      team={team}
      matrix={matrix}
      modules={ADMIN_MODULES.map((m) => ({ key: m.key, label: m.label }))}
      roles={roles.filter((r) => user.isSuperAdmin || r.key !== "super_admin")}
      countries={countries.map((c) => c.name)}
      activity={activity}
      me={user.id}
      perms={{ manage: can(user, "users:manage"), superAdmin: user.isSuperAdmin, audit: can(user, "audit:read") }}
    />
  );
}
