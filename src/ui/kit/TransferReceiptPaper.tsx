"use client";

/* eslint-disable @next/next/no-img-element -- brand logo */
import type { ReactNode } from "react";
import { COMPANY } from "@/config/company";
import { useT } from "@/i18n/I18nProvider";
import { money } from "@/ui/format";
import { Signature, Stamp } from "./Stamp";

export interface TransferReceiptPaperData {
  number: number;
  date: string; // YYYY-MM-DD
  receivedFrom: string;
  customerRef: string | null;
  received: string;
  fee: string | null;
  amount: string;
  currency: string;
  inWords: string;
  description: string;
  voided?: boolean;
}

const INK = "var(--navy-700)";

/**
 * Receipt Voucher for a money transfer, laid out like the company's paper
 * book (owner 2026-10-25): logo and contact box, Date / No, Received From,
 * Amount of (what is sent), fee + total when a fee is typed, In Word,
 * Description, then the cashier's signature and the company stamp.
 */
export function TransferReceiptPaper({ r }: { r: TransferReceiptPaperData }) {
  const t = useT();
  const line = (label: string, value: ReactNode, testid?: string) => (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
      <b style={{ color: INK, fontSize: 15, whiteSpace: "nowrap" }}>{t(label)}:</b>
      <span data-testid={testid} style={{ flex: 1, minWidth: 0, borderBottom: `1.5px solid ${INK}`, padding: "0 4px 2px", fontSize: 15, fontWeight: 600, color: "var(--text-strong)", textAlign: "center" }}>
        {value}
      </span>
    </div>
  );
  const box = (v: ReactNode) => <span style={{ flex: 1, minWidth: 0, border: `1.5px solid ${INK}`, borderRadius: 6, padding: "6px 10px", font: "800 18px var(--font-display)", color: "var(--text-strong)", textAlign: "center" }}>{v}</span>;
  const [y, m, d] = r.date.split("-");
  return (
    <div style={{ position: "relative", background: "#fff", border: "1px solid var(--border-default)", borderTop: "4px solid var(--orange-500)", borderRadius: 8, padding: "22px 26px", display: "flex", flexDirection: "column", gap: 14, overflow: "hidden" }}>
      {r.voided && (
        <div aria-hidden style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", font: "900 96px var(--font-display)", color: "rgba(220,38,38,.14)", transform: "rotate(-18deg)", pointerEvents: "none" }}>
          VOID
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <img src="/brand/orbit-logo.png" alt={COMPANY.name} style={{ height: 74 }} />
        <div style={{ border: `1.5px solid ${INK}`, padding: "8px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <b style={{ color: INK, font: "800 15px var(--font-display)" }}>{t("Contact")}:</b>
          <span style={{ display: "flex", flexDirection: "column", font: "800 15px var(--font-display)", color: INK }}>
            {COMPANY.phones.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </span>
        </div>
      </div>
      <div style={{ textAlign: "center", font: "900 28px var(--font-display)", color: INK, letterSpacing: ".01em" }}>{t("RECEIPT VOUCHER")}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
          <b style={{ color: INK, fontSize: 15 }}>{t("Date")}:</b>
          <span style={{ borderBottom: `1.5px solid ${INK}`, padding: "0 6px 2px", fontSize: 15, fontWeight: 600 }}>
            {d}/{m}/{y}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <b style={{ color: INK, fontSize: 15 }}>{t("No")}:</b>
          <span data-testid="transfer-receipt-no" style={{ font: "800 30px/1 var(--font-display)", color: "#D21F2B", letterSpacing: ".08em", fontVariantNumeric: "lining-nums tabular-nums" }}>
            {r.number}
          </span>
        </div>
      </div>
      {/* The customer reference only links the receipt to the customer; it is not printed. */}
      {line("Received From", r.receivedFrom)}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ color: INK, fontSize: 15, whiteSpace: "nowrap" }}>{t("Amount of")}:</b>
        <b style={{ color: INK, fontSize: 15 }}>{r.currency}</b>
        {box(<span data-testid="transfer-receipt-amount">{money(r.amount)}</span>)}
        {r.fee !== null && (
          <span style={{ flex: 1, minWidth: 180, border: `1.5px solid ${INK}`, borderRadius: 6, padding: "6px 10px", fontSize: 13, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ color: "var(--text-muted)" }}>{t("Transfer fee")}</span>
              <b>{money(r.fee)}</b>
            </span>
            <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ color: "var(--text-muted)" }}>{t("Total amount")}</span>
              <b data-testid="transfer-receipt-total" style={{ color: INK }}>{money(r.received)}</b>
            </span>
          </span>
        )}
      </div>
      {line("In Word", r.inWords)}
      {line("Description", r.description)}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap", marginTop: 6 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <b style={{ color: INK, fontSize: 15 }}>{t("Cashier Signature")}:</b>
          <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", minWidth: 170 }}>
            <span style={{ height: 70, display: "flex", alignItems: "flex-end" }}><Signature width={118} /></span>
            <span style={{ alignSelf: "stretch", borderTop: `1.5px solid ${INK}`, marginTop: 2 }} />
          </span>
        </div>
        <Stamp size={108} />
      </div>
    </div>
  );
}
