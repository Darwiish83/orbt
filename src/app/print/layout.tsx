import { redirect } from "next/navigation";
import { getSessionUser } from "@/modules/authz/session";

/**
 * Printable documents (invoice, receipt, statement) for staff: no admin shell,
 * A4-friendly. Each page loads its document through the same scoped finance
 * services as the Finance screen, so access rules are identical.
 */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.customerId) redirect("/account");
  return <div className="print-page">{children}</div>;
}
