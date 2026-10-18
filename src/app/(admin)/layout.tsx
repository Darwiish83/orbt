import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
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
  if (!user) redirect("/login");
  if (user.customerId) redirect("/account"); // customers use the portal, not admin
  // Privileged accounts must enroll in MFA before accessing the admin area.
  if (isPrivileged(user.roleKeys, user.isSuperAdmin) && !user.mfaEnabled) redirect("/mfa/setup");

  return (
    <AdminShell userEmail={user.email} onLogout={logout}>
      {children}
    </AdminShell>
  );
}
