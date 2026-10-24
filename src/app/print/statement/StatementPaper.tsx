"use client";

/* eslint-disable @next/next/no-img-element -- brand logo */
import { COMPANY } from "@/config/company";
import { useT } from "@/i18n/I18nProvider";
import type { Statement } from "@/modules/finance/ledger";
import { fdate, money } from "@/ui/format";

/** Printable account statement: debit / credit / running balance. */
export function StatementPaper({
  statement,
  scope,
  customer,
}: {
  statement: Statement;
  scope: { year: number; country: string };
  customer: { ref: string; name: string } | null;
}) {
  const t = useT();
  const th = { textAlign: "start" as const, padding: "8px 6px", font: "700 10px var(--font-body)", textTransform: "uppercase" as const, letterSpacing: ".05em", color: "var(--text-muted)", borderBottom: "1.5px solid var(--navy-700)" };
  const td = { padding: "7px 6px", borderBottom: "1px solid var(--border-default)", fontSize: 12 };
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border-default)", borderTop: "5px solid var(--navy-700)", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <img src="/brand/orbit-logo.png" alt={COMPANY.name} style={{ height: 44 }} />
        <div style={{ textAlign: "end" }}>
          <div style={{ font: "850 20px var(--font-display)", color: "var(--navy-700)" }}>{t("STATEMENT")}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {t(scope.country)} · {scope.year} · {customer ? `${customer.ref} — ${customer.name}` : t("All Customers")}
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {(
          [
            ["Total Invoiced", statement.totalInvoiced],
            ["Total Paid", statement.totalPaid],
            ["Balance Due", statement.balanceDue],
          ] as const
        ).map(([k, v]) => (
          <div key={k} style={{ padding: 10, background: "var(--surface-sunken)", borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t(k)}</div>
            <b style={{ fontSize: 16 }}>{money(v)}</b>
          </div>
        ))}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Date", "Customer", "Shipment", "Invoice No.", "Description", "Debit", "Credit", "Balance"].map((h, i) => (
              <th key={h} style={{ ...th, textAlign: i >= 5 ? "end" : "start" }}>
                {t(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {statement.rows.map((r, i) => (
            <tr key={i}>
              <td style={td}>{fdate(r.date)}</td>
              <td style={td}>
                {r.customerName} <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>{r.customerRef}</span>
              </td>
              <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{r.shipmentCode}</td>
              <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{r.docNo}</td>
              <td style={td}>{r.kind === "INVOICE" ? `${t("Invoice")} · ${t(r.mode === "AIR" ? "Air Freight" : "Sea Freight")}` : `${t("Payment")} · ${r.bank ? t(r.bank) : "-"} · ${r.receiptNo ?? ""}`}</td>
              <td style={{ ...td, textAlign: "end" }}>{Number(r.debit) ? money(r.debit) : "-"}</td>
              <td style={{ ...td, textAlign: "end", color: "var(--green-600)" }}>{Number(r.credit) ? money(r.credit) : "-"}</td>
              <td style={{ ...td, textAlign: "end", fontWeight: 700 }}>{money(r.balance)}</td>
            </tr>
          ))}
          {!statement.rows.length && (
            <tr>
              <td colSpan={8} style={{ ...td, textAlign: "center", color: "var(--text-muted)" }}>
                {t("No records found")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div style={{ textAlign: "center", fontSize: 10, color: "var(--text-muted)" }}>
        {COMPANY.name}, {COMPANY.addressLines.join(", ")} · {COMPANY.phones.join(" · ")} · {t("Hours")} {COMPANY.hours}
      </div>
    </div>
  );
}
