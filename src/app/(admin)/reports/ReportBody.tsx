"use client";

import { useT } from "@/i18n/I18nProvider";
import { Bars, Legend, Panel, Stat, StatusBadge, SHIPMENT_STATUS_LABEL } from "@/ui/kit";
import { money, num } from "@/ui/format";
import type { getAdminReport } from "@/modules/reporting/service";

export type ReportData = Awaited<ReturnType<typeof getAdminReport>>;

export const REPORT_SECTIONS: [ReportData["section"], string][] = [
  ["company", "Company report"],
  ["shipments", "Shipments report"],
  ["operations", "Operations report"],
  ["finance", "Finance report"],
  ["customers", "Customers report"],
];

/** The report's figures, shared by the Reports page and its printable PDF. */
export function ReportBody({ r }: { r: ReportData }) {
  const t = useT();
  const T = r.totals;
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 } as const;
  const showShip = r.section !== "finance" && r.section !== "customers";
  const showFin = r.section === "company" || r.section === "finance";
  const showCust = r.section === "company" || r.section === "customers";
  const total = Math.max(1, T.shipments);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
        {t(REPORT_SECTIONS.find((s) => s[0] === r.section)![1])} · {r.year} · {typeof r.countries === "string" ? t("All countries") : r.countries.map((c: string) => t(c)).join(", ")}
      </div>
      {showShip && (
        <div style={grid}>
          <Stat icon="Package" label="Total Shipments" value={String(T.shipments)} />
          <Stat icon="Plane" tone="orange" label="Total Air" value={String(T.air)} />
          <Stat icon="Ship" label="Total Sea" value={String(T.sea)} />
          <Stat icon="Weight" tone="orange" label="Total KG" value={num(T.kg, 1)} />
          <Stat icon="Box" label="Total CBM" value={num(T.cbm, 2)} />
          <Stat icon="Boxes" label="Total Packages" value={num(T.packages)} />
        </div>
      )}
      {showFin && (
        <div style={grid}>
          <Stat icon="ReceiptText" label="Total Revenue" value={money(T.revenue)} />
          <Stat icon="Banknote" tone="green" label="Collected" value={money(T.collected)} />
          <Stat icon="CircleAlert" tone="red" label="Outstanding" value={money(T.outstanding)} />
          <Stat icon="FileText" label="Total Invoices" value={String(T.invoices)} />
        </div>
      )}
      {showCust && (
        <div style={grid}>
          <Stat icon="ContactRound" label="Total Customers" value={String(T.customers)} />
          <Stat icon="UserCheck" tone="green" label="Active Customers" value={String(T.activeCustomers)} />
        </div>
      )}
      {showShip && (
        <Panel title="Shipment Status">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {r.status.map((s) => (
              <div key={s.status}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <StatusBadge status={SHIPMENT_STATUS_LABEL[s.status]} />
                  <b>{s.count}</b>
                </div>
                <div style={{ height: 6, background: "var(--gray-100)", borderRadius: 3 }}>
                  <div style={{ width: `${(s.count / total) * 100}%`, height: 6, borderRadius: 3, background: "var(--navy-700)" }} />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {showShip && (
        <Panel title="Monthly shipments" actions={<Legend items={[["Air", "var(--orange-500)"], ["Sea", "var(--navy-700)"]]} />}>
          <Bars data={r.monthly.map((m) => ({ m: t(m.month), sea: m.sea, air: m.air }))} keys={["sea", "air"]} colors={["var(--navy-700)", "var(--orange-500)"]} h={150} />
        </Panel>
      )}
      {showFin && (
        <Panel title="Revenue Overview" actions={<Legend items={[["Revenue", "var(--navy-700)"]]} />}>
          <Bars data={r.monthly.map((m) => ({ m: t(m.month), rev: Number(m.revenue) }))} keys={["rev"]} colors={["var(--navy-700)"]} h={150} />
        </Panel>
      )}
    </div>
  );
}
