import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { ADMIN_NAV } from "@/components/admin/adminNav";
import { can } from "@/modules/authz/core";
import { getSessionUser } from "@/modules/authz/session";
import { isPrivileged } from "@/modules/auth/mfa";
import { logout } from "@/app/login/actions";

/**
 * Admin route group layout. Server-side auth gate (defense in depth alongside
 * the edge middleware): unauthenticated users are redirected to /login.
 * Fine-grained per-page permission gating is layered on in later phases.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/admin/login");
  if (user.customerId) redirect("/account"); // customers use the portal, not admin
  // Privileged accounts must enroll in MFA before accessing the admin area.
  // Can be disabled for demo environments with REQUIRE_MFA=false (production
  // leaves it unset → MFA enforced).
  const mfaRequired = process.env.REQUIRE_MFA !== "false";
  if (mfaRequired && isPrivileged(user.roleKeys, user.isSuperAdmin) && !user.mfaEnabled) {
    redirect("/mfa/setup");
  }

  // Show only the nav items this user can actually use (UX; pages still enforce).
  const items = ADMIN_NAV.filter((i) => !i.permission || can(user, i.permission));

  return (
    <AdminShell items={items} userEmail={user.email} onLogout={logout}>
      {children}
    </AdminShell>
  );
}
