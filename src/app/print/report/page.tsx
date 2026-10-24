import { prisma } from "@/db/client";
import { requireUser } from "@/modules/authz/session";
import { getAdminReport, type ReportSection } from "@/modules/reporting/service";
import { getAdminScope } from "@/app/(admin)/scope";
import { ReportBody } from "@/app/(admin)/reports/ReportBody";
import { PrintBar } from "../PrintBar";

export const metadata = { title: "Report" };

const SECTIONS: ReportSection[] = ["company", "shipments", "operations", "finance", "customers"];

export default async function PrintReportPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const section = SECTIONS.includes(sp.section as ReportSection) ? (sp.section as ReportSection) : "company";
  const scope = await getAdminScope(user);
  const report = await getAdminReport(prisma, user, { year: scope.year, country: scope.country, section });
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <PrintBar title={`Report ${section} ${scope.year}`} />
      <ReportBody r={report} />
    </div>
  );
}
