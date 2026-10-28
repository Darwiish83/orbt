import { redirect } from "next/navigation";
import { withUserDb } from "@/db/scoped";
import { getSessionUser } from "@/modules/authz/session";
import { myProfile } from "@/modules/portal/customerApp";
import { logout } from "@/app/login/actions";
import { CustomerShell } from "@/components/portal/CustomerShell";

/**
 * Customer App layout (Phase 13). Requires an authenticated CUSTOMER
 * principal; staff are sent to the admin dashboard. Everything inside is
 * self-scoped by the services (a customer only ever sees their own data).
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.customerId) redirect("/dashboard"); // staff → admin
  const me = await withUserDb(user, (db) => myProfile(db, user));

  return (
    <CustomerShell me={{ name: me.name, ref: me.ref, levelName: me.levelName }} onLogout={logout}>
      {children}
    </CustomerShell>
  );
}
