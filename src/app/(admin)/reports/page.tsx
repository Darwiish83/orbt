import { prisma } from "@/db/client";
import { getReport } from "@/modules/reporting/service";
import { requireUser } from "@/modules/authz/session";
import { can } from "@/modules/authz/core";

export const metadata = { title: "Reports" };

function Stat({ label, value, tone = "navy" }: { label: string; value: string; tone?: "navy" | "orange" | "green" | "red" }) {
  const fg = { navy: "var(--navy-700)", orange: "var(--orange-600)", green: "var(--status-success)", red: "var(--status-danger)" }[tone];
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-l)",
        boxShadow: "var(--shadow-1)",
        padding: 16,
        minWidth: 0,
      }}
    >
      <div style={{ font: "500 13px var(--font-body)", color: "var(--text-muted)", marginBottom: 8 }}>{label}</div>
      <div style={{ font: "800 26px/1.1 var(--font-display)", color: fg }}>{value}</div>
    </div>
  );
}

export default async function ReportsPage() {
  const user = await requireUser();
  if (!can(user, "reports:read")) {
    return <p style={{ color: "var(--text-muted)" }}>You do not have access to reports.</p>;
  }
  const report = await getReport(prisma, user, {});
  const maxMonthly = Math.max(1, ...report.monthly.map((m) => m.air + m.sea));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
        <Stat label="Shipments" value={String(report.shipments.total)} />
        <Stat label="Customers" value={String(report.customers)} />
        <Stat label="Invoiced" value={`$${report.finance.invoiced}`} tone="navy" />
        <Stat label="Collected" value={`$${report.finance.collected}`} tone="green" />
        <Stat label="Outstanding" value={`$${report.finance.outstanding}`} tone="red" />
      </div>

      <div
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-l)",
          boxShadow: "var(--shadow-1)",
          padding: 20,
        }}
      >
        <div style={{ font: "700 15px var(--font-display)", color: "var(--text-strong)", marginBottom: 16 }}>
          Shipments by month (air / sea)
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 160 }}>
          {report.monthly.map((m) => (
            <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: "100%", maxWidth: 28, height: 130, display: "flex", flexDirection: "column-reverse" }}>
                <div style={{ height: `${(m.sea / maxMonthly) * 130}px`, background: "var(--navy-500)" }} />
                <div style={{ height: `${(m.air / maxMonthly) * 130}px`, background: "var(--orange-500)", borderRadius: "3px 3px 0 0" }} />
              </div>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.month}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
