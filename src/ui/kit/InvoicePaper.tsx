"use client";

/* eslint-disable @next/next/no-img-element -- small static brand/bank images */
import type { ReactNode } from "react";
import { bankLogo, COMPANY, INVOICE_BANK_ACCOUNTS } from "@/config/company";
import { useT } from "@/i18n/I18nProvider";
import { Icon } from "@/ui/primitives";
import { fdate, money, num } from "@/ui/format";
import { StatusBadge } from "./display";
import { INVOICE_STATUS_LABEL } from "./status";

export interface InvoicePaperData {
  number: string;
  status: keyof typeof INVOICE_STATUS_LABEL;
  date: string;
  mode: "AIR" | "SEA";
  shipmentCode: string;
  customerName: string;
  customerRef: string;
  /** Server-computed lines (decimal strings). */
  lines: { category: string; description: string; quantity: string; unitPrice: string; amount: string }[];
  discount: string;
  total: string;
  paid: string;
  balance: string;
}

const LABEL: Record<string, string> = {
  QUALITY: "Quality Control",
  BRAND: "Brand",
  FATURA: "Fatura",
  LOCAL_DELIVERY: "Local Delivery",
  DEMURRAGE: "Demurrage",
};

/**
 * Invoice paper (design `InvoicePaper`, spec A6/B9): logo, company address,
 * lines that exist, Discount above Total, Paid, Balance, status, the bank
 * accounts and the Somali demurrage warning, with the company footer.
 */
/** Company details printed on the paper (Settings → Company Profile). */
export interface PaperCompany {
  name: string;
  address: string;
  phone: string;
}

export function InvoicePaper({ inv, print, company }: { inv: InvoicePaperData; print?: boolean; company?: PaperCompany }) {
  const t = useT();
  const co: PaperCompany = company ?? { name: COMPANY.name, address: COMPANY.addressLines.join(", "), phone: COMPANY.phones.join(" · ") };
  const air = inv.mode === "AIR";
  const unit = air ? "kg" : "m³";
  const qty = (l: InvoicePaperData["lines"][number]) => {
    if (l.category === "FREIGHT" || l.category === "QUALITY") return `${num(l.quantity, air ? 1 : 2)} ${unit}`;
    if (l.category === "BRAND") return `${num(l.quantity)} ${t("pcs")}`;
    if (l.category === "DEMURRAGE") return `${num(l.quantity)} ${t("days")}`;
    return "1";
  };
  const desc = (l: InvoicePaperData["lines"][number]) =>
    l.category === "FREIGHT" ? t(air ? "Air Freight" : "Sea Freight") : l.category === "OTHER" ? l.description || t("Others") : t(LABEL[l.category] ?? l.description);
  const th = { font: "700 9px var(--font-body)", letterSpacing: ".06em", textTransform: "uppercase" as const, color: "var(--text-muted)", padding: "7px 0" };
  const K = (k: string, v: ReactNode) => (
    <div>
      <div style={{ color: "var(--text-muted)", fontSize: 10 }}>{t(k)}</div>
      <div style={{ color: "var(--text-strong)", fontWeight: 600 }}>{v}</div>
    </div>
  );
  const hasDiscount = Number(inv.discount) > 0;

  return (
    <div data-testid="invoice-paper" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          background: "#fff",
          borderRadius: 4,
          boxShadow: print ? "none" : "var(--shadow-2)",
          border: print ? "1px solid var(--border-default)" : undefined,
          borderTop: "5px solid var(--navy-700)",
          padding: print ? "24px 28px" : "16px 14px",
          fontSize: print ? 13 : 11,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <img src="/brand/orbit-logo.png" alt={co.name} style={{ height: print ? 44 : 34 }} />
          <div style={{ textAlign: "end" }}>
            <div style={{ font: `850 ${print ? 20 : 15}px var(--font-display)`, color: "var(--navy-700)", letterSpacing: ".04em" }}>{t("INVOICE")}</div>
            <div style={{ font: "600 11px var(--font-mono)", color: "var(--text-strong)" }}>{inv.number}</div>
          </div>
        </div>
        <div style={{ height: 2, background: "var(--orange-500)", margin: "10px 0 12px", width: 40 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {K("Bill to", inv.customerName)}
            {K("Customer Reference", inv.customerRef)}
            {K("Invoice date", fdate(inv.date))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, textAlign: "end" }}>
            <div style={{ fontSize: 10, lineHeight: 1.45, color: "var(--text-strong)" }}>
              <div style={{ fontWeight: 700, color: "var(--navy-700)" }}>{co.name}</div>
              {co.address.split(", ").map((l) => (
                <div key={l}>{l}</div>
              ))}
              <div>{co.phone}</div>
            </div>
            {K("Shipment", inv.shipmentCode)}
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 14, display: "table", whiteSpace: "normal" }}>
          <thead>
            <tr style={{ borderBottom: "1.5px solid var(--navy-700)" }}>
              {["Description", "Quantity", "Rate", "Amount"].map((h, i) => (
                <th key={h} style={{ ...th, textAlign: i ? "end" : "start" }}>
                  {t(h)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, n) => (
              <tr key={n} style={{ borderBottom: "1px solid var(--border-default)" }}>
                <td style={{ padding: "8px 0", fontWeight: 600, color: "var(--text-body)" }}>{desc(l)}</td>
                <td style={{ padding: "8px 0", textAlign: "end", color: "var(--text-body)" }}>{qty(l)}</td>
                <td style={{ padding: "8px 0", textAlign: "end", color: "var(--text-body)" }}>{money(l.unitPrice)}</td>
                <td style={{ padding: "8px 0", textAlign: "end", fontWeight: 600, color: "var(--navy-700)" }}>{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginInlineStart: "auto", width: "64%", marginTop: 8, fontSize: 12 }}>
          {(
            [
              hasDiscount && ["Discount", "−" + money(inv.discount), "var(--orange-600)"],
              ["Total", money(inv.total), "var(--text-strong)"],
              ["Paid", "−" + money(inv.paid), "var(--status-success)"],
            ].filter(Boolean) as [string, string, string][]
          ).map(([k, v, col]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
              <span style={{ color: "var(--text-muted)" }}>{t(k)}</span>
              <b style={{ color: col }}>{v}</b>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 10px",
              marginTop: 4,
              background: "var(--navy-700)",
              color: "#fff",
              borderRadius: 3,
              printColorAdjust: "exact",
              WebkitPrintColorAdjust: "exact",
            }}
          >
            <span style={{ fontWeight: 600 }}>{t("Balance")}</span>
            <b>{money(inv.balance)}</b>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 10, borderTop: "1px dashed var(--border-strong)" }}>
          <span style={{ color: "var(--text-muted)" }}>{t("Payment status")}</span>
          <StatusBadge status={INVOICE_STATUS_LABEL[inv.status]} />
        </div>
      </div>
      <div style={{ font: "700 13px var(--font-display)", color: "var(--text-strong)" }}>{t("Bank accounts")}</div>
      <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-m)", padding: "2px 12px", background: "#fff" }}>
        {INVOICE_BANK_ACCOUNTS.map((b, n, all) => (
          <div key={b.bank} data-testid="invoice-bank" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: n < all.length - 1 ? "1px solid var(--border-default)" : "none" }}>
            <img src={bankLogo(b.bank) ?? ""} alt={b.label} style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flex: "none" }} />
            <span style={{ flex: 1, font: "600 12px var(--font-body)", color: "var(--text-strong)" }}>{b.label}</span>
            <span style={{ font: "700 13px var(--font-mono)", color: "var(--navy-700)" }}>{b.accountNumber}</span>
          </div>
        ))}
      </div>
      <div
        lang="so"
        style={{
          display: "flex",
          gap: 10,
          padding: 12,
          background: "var(--status-warning-bg)",
          border: "1px solid #F2D49B",
          borderRadius: "var(--radius-m)",
          color: "var(--status-warning)",
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        <Icon name="TriangleAlert" size={18} style={{ flex: "none" }} />
        <div>
          <b>Ogeysiis:</b> Haddii alaabtaada aadan qaadan muddo 3 maalmood gudahood ah marka ay timaaddo, waxaa ku bilaabanaya kharash
          kaydin (demurrage) oo maalin kasta ku soo kordhaya.
        </div>
      </div>
      <div style={{ textAlign: "center", fontSize: 10, lineHeight: 1.5, color: "var(--text-muted)" }}>
        {co.name}, {co.address} · {co.phone} · {t("Hours")} {COMPANY.hours}
      </div>
    </div>
  );
}
