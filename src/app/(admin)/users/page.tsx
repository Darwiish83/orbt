import { prisma } from "@/db/client";
import { can } from "@/modules/authz/core";
import { listUsers } from "@/modules/users/service";
import { requireUser } from "@/modules/authz/session";
import { Badge } from "@/ui/primitives";
import { InviteUserForm } from "./InviteUserForm";
import { RoleControls } from "./RoleControls";

export const metadata = { title: "Users & Team" };

export default async function UsersPage() {
  const user = await requireUser();
  if (!can(user, "users:read")) {
    return <p style={{ color: "var(--text-muted)" }}>You do not have access to user management.</p>;
  }

  const [{ items }, roles] = await Promise.all([
    listUsers(prisma, user, { pageSize: 50 }),
    prisma.role.findMany({ where: { key: { not: "customer" } }, select: { key: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const canManage = can(user, "users:manage");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {canManage && <InviteUserForm />}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((u) => (
          <div
            key={u.id}
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-l)",
              boxShadow: "var(--shadow-1)",
              padding: 16,
              display: "flex",
              gap: 16,
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 200 }}>
              <div style={{ font: "600 14px var(--font-body)", color: "var(--text-strong)" }}>{u.email}</div>
              <div style={{ font: "500 12px var(--font-mono)", color: "var(--text-muted)" }}>
                {u.employee?.code ?? "—"} ·{" "}
                <Badge tone={u.status === "ACTIVE" ? "success" : u.status === "SUSPENDED" ? "danger" : "neutral"}>
                  {u.status}
                </Badge>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              {canManage ? (
                <RoleControls userId={u.id} roleKeys={u.roles.map((r) => r.role.key)} allRoles={roles} status={u.status} />
              ) : (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {u.roles.map((r) => (
                    <Badge key={r.role.key} tone="brand">
                      {r.role.key}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
