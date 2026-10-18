import { redirect } from "next/navigation";
import { getSessionUser } from "@/modules/authz/session";
import { logout } from "@/app/login/actions";
import { PortalShell } from "@/components/portal/PortalShell";

/**
 * Customer portal layout. Requires an authenticated CUSTOMER principal; staff
 * are sent to the admin dashboard. Everything inside is self-scoped by the
 * services (a customer only ever sees their own data).
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.customerId) redirect("/dashboard"); // staff → admin

  return (
    <PortalShell email={user.email} onLogout={logout}>
      {children}
    </PortalShell>
  );
}
