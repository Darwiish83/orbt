"use client";

/* eslint-disable @next/next/no-img-element -- brand logo */
import type { CSSProperties } from "react";
import { COMPANY } from "@/config/company";
import { useT } from "@/i18n/I18nProvider";
import { StatusBadge, INVOICE_STATUS_LABEL } from "@/ui/kit";
import { fdate, money } from "@/ui/format";
import type { myFinance, myProfile } from "@/modules/portal/customerApp";
import { PrintButton } from "../ui";

type Fin = Awaited<ReturnType<typeof myFinance>>;
type Me = Awaited<ReturnType<typeof myProfile>>;
const th: CSSProperties = { padding: "7px 8px", font: "700 10px var(--font-body)", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)", background: "var(--surface-sunken)", textAlign: "end", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "8px", fontSize: 12, borderTop: "1px solid var(--border-default)", textAlign: "end", whiteSpace: "nowrap" };

/** The customer's statement for a year, printable as a PDF. */
export function StatementView({ fin, me, year }: { fin: Fin; me: Me; year: number }) {
  const t = useT();
  const T = fin.totals;
  const table = (head: string[], rows: React.ReactNode) => (
    <div style={{ overflowX: "auto", border: "1px solid var(--border-default)", borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 480 }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} style={{ ...th, textAlign: i < 2 ? "start" : "end" }}>
                {t(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
  return (
    <>
      <article style={{ background: "#fff", border: "1px solid var(--border-default)", borderTop: "4px solid var(--orange-500)", borderRadius: 8, padding: "20px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <img src="/brand/orbit-logo.png" alt={COMPANY.name} style={{ height: 42 }} />
          <div style={{ textAlign: "end" }}>
            <div style={{ font: "800 18px var(--font-display)", color: "var(--navy-700)", letterSpacing: ".04em" }}>{t("STATEMENT")}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("Business year")} {year}
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{t("Bill to")}</div>
            <b>{me.name}</b>
            <div style={{ fontFamily: "var(--font-mono)" }}>{me.ref}</div>
          </div>
          <div style={{ textAlign: "end", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
            <b style={{ color: "var(--navy-700)" }}>{COMPANY.name}</b>
            <br />
            {COMPANY.addressLines.join(", ")}
            <br />
            {COMPANY.phones.join(" · ")}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 1, background: "var(--border-default)", border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
          {(
            [
              ["Total Invoiced", money(T.invoiced)],
              ["Total Paid", money(T.paid)],
              ["Balance Due", money(T.balance)],
            ] as const
          ).map(([l, v], i) => (
            <div key={l} style={{ background: "#fff", padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t(l)}</div>
              <div style={{ font: "800 17px var(--font-display)", color: i === 2 && Number(T.balance) > 0 ? "var(--red-600)" : "var(--navy-700)" }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ font: "700 14px var(--font-display)", color: "var(--navy-700)" }}>{t("Invoices")}</div>
        {table(
          ["Date", "Invoice No.", "Shipment", "Amount", "Paid", "Balance", "Status"],
          fin.invoices.map((i) => (
            <tr key={i.id}>
              <td style={{ ...td, textAlign: "start" }}>{fdate(i.date)}</td>
              <td style={{ ...td, textAlign: "start", fontFamily: "var(--font-mono)" }}>{i.number}</td>
              <td style={td}>{i.shipment}</td>
              <td style={td}>{money(i.total)}</td>
              <td style={{ ...td, color: "var(--green-600)" }}>{money(i.paid)}</td>
              <td style={{ ...td, color: Number(i.balance) > 0 ? "var(--red-600)" : undefined, fontWeight: 700 }}>{money(i.balance)}</td>
              <td style={td}>
                <StatusBadge status={INVOICE_STATUS_LABEL[i.status]} />
              </td>
            </tr>
          )),
        )}
        <div style={{ font: "700 14px var(--font-display)", color: "var(--navy-700)" }}>{t("Payments")}</div>
        {table(
          ["Date", "Payment No.", "Invoice No.", "Bank", "Amount"],
          fin.payments.map((p) => (
            <tr key={p.id}>
              <td style={{ ...td, textAlign: "start" }}>{fdate(p.date)}</td>
              <td style={{ ...td, textAlign: "start", fontFamily: "var(--font-mono)" }}>{p.receiptNo}</td>
              <td style={{ ...td, fontFamily: "var(--font-mono)" }}>{p.invoiceNo}</td>
              <td style={td}>{p.bank ? t(p.bank) : "—"}</td>
              <td style={{ ...td, color: "var(--green-600)", fontWeight: 700 }}>{money(p.amount)}</td>
            </tr>
          )),
        )}
        <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
          {t("Generated from OrbitCargo on")} {fdate(new Date().toISOString())}
        </div>
      </article>
      <PrintButton title={`Statement ${me.ref} ${year}`} />
    </>
  );
}
