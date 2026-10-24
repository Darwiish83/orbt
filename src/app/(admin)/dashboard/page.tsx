import { prisma } from "@/db/client";
import { requireUser } from "@/modules/authz/session";
import { getDashboard } from "@/modules/reporting/dashboard";
import { getAdminScope } from "../scope";
import { DashboardView } from "./DashboardView";

export const metadata = { title: "Dashboard" };

/** Dashboard (spec B3 / §4): the selected year + country at a glance. */
export default async function DashboardPage() {
  const user = await requireUser();
  const scope = await getAdminScope(user).catch(() => null);
  if (!scope) return <DashboardView data={null} scope={null} />;
  const data = await getDashboard(prisma, user, scope);
  return <DashboardView data={data} scope={{ year: scope.year, country: scope.country }} />;
}
