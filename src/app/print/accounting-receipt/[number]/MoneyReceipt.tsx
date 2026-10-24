"use client";

/* eslint-disable @next/next/no-img-element -- brand logo */
import type { ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import type { listReceipts } from "@/modules/accounting/service";
import type { PaperCompany } from "@/ui/kit";
import { fdate, money } from "@/ui/format";

type R = Awaited<ReturnType<typeof listReceipts>>[number];

/** Receipt paper for an Accounting movement (payment in or money out). */
export function MoneyReceipt({ r, company }: { r: R; company: PaperCompany }) {
  const t = useT();
  const out = r.direction === "OUT";
  const row = (l: string, v: ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px dashed var(--border-default)", fontSize: 13 }}>
      <span style={{ color: "var(--text-muted)" }}>{t(l)}</span>
      <b style={{ textAlign: "end" }}>{v}</b>
    </div>
  );
  return (
    <div style={{ background: "#fff", border: "1px solid var(--border-default)", borderTop: "4px solid var(--orange-500)", borderRadius: 8, padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <img src="/brand/orbit-logo.png" alt={company.name} style={{ height: 40 }} />
        <div style={{ textAlign: "end", fontSize: 10, lineHeight: 1.45, color: "var(--text-muted)" }}>
          <b style={{ color: "var(--text-strong)", fontSize: 11 }}>{company.name.toUpperCase()}</b>
          <br />
          {company.address}
          <br />
          {company.phone}
        </div>
      </div>
      <div style={{ textAlign: "center", padding: "6px 0", borderTop: "1px solid var(--border-default)", borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ font: "800 20px var(--font-display)", color: "var(--navy-700)" }}>{t(out ? "PAYMENT VOUCHER" : "PAYMENT RECEIPT")}</div>
        <div style={{ font: "600 12px var(--font-mono)", color: "var(--text-muted)" }}>{r.number}</div>
      </div>
      <div style={{ textAlign: "center", padding: 14, background: "var(--surface-sunken)", borderRadius: 8 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t(out ? "Amount Paid" : "Amount Received")}</div>
        <div style={{ font: "800 30px var(--font-display)", color: out ? "var(--red-600)" : "var(--green-600)", textDecoration: r.reversed ? "line-through" : undefined }}>{money(r.amount)}</div>
        {r.reversed && <div style={{ fontSize: 12, color: "var(--red-600)", fontWeight: 700 }}>{t("Reversed")}</div>}
      </div>
      <div>
        {row("Type", t(r.kindLabel))}
        {row(out ? "Sent to" : "Received from", r.party)}
        {row("Date", fdate(r.date))}
        {row(out ? "Paid from" : "Bank", r.bank ? t(r.bank) : "—")}
        {r.note && row("Note", r.note)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, fontSize: 12, color: "var(--text-muted)" }}>
        <span>{t("Signature")}: ____________</span>
        <span>{t("Thank you for choosing Orbit Cargo")}</span>
      </div>
    </div>
  );
}
