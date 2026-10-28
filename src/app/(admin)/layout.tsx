import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { ADMIN_NAV } from "@/components/admin/adminNav";
import { can } from "@/modules/authz/core";
import { getSessionUser } from "@/modules/authz/session";
import { logout } from "@/app/login/actions";
import { AuthorizationError } from "@/lib/errors";
import { getAdminScope } from "./scope";

/**
 * Admin route group layout. Server-side auth gate (defense in depth alongside
 * the edge middleware): unauthenticated users are redirected to /login.
 * Fine-grained per-page permission gating is layered on in later phases.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.customerId) redirect("/account"); // customers use the portal, not admin
  // Show only the nav items this user can actually use (UX; pages still enforce).
  const items = ADMIN_NAV.filter((i) => !i.permission || can(user, i.permission));
  // Year + Country (spec §1). A user with no assigned country/year gets no selector.
  const scope = await getAdminScope(user).catch((e) => {
    if (e instanceof AuthorizationError) return undefined;
    throw e;
  });

  return (
    <AdminShell items={items} userEmail={user.email} onLogout={logout} scope={scope}>
      {children}
    </AdminShell>
  );
}
