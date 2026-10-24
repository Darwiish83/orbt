import { prisma } from "@/db/client";
import { AuthorizationError } from "@/lib/errors";
import { can } from "@/modules/authz/core";
import { requireUser } from "@/modules/authz/session";
import { getAdminReport, type ReportSection } from "@/modules/reporting/service";
import { getAdminScope } from "../scope";
import { ReportsView } from "./ReportsView";

export const metadata = { title: "Reports" };

const SECTIONS: ReportSection[] = ["company", "shipments", "operations", "finance", "customers"];

/** Reports (spec B13 / §14): per section, plus a company-wide report. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const user = await requireUser();
  if (!can(user, "reports:read")) throw new AuthorizationError("Missing permission: reports:read");
  const sp = await searchParams;
  const section = SECTIONS.includes(sp.section as ReportSection) ? (sp.section as ReportSection) : "company";
  const scope = await getAdminScope(user);
  const report = await getAdminReport(prisma, user, { year: scope.year, country: scope.country, section });
  return <ReportsView report={report} />;
}
