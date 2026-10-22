"use client";

/* eslint-disable @next/next/no-img-element -- small static brand/bank images */
import type { ReactNode } from "react";
import { bankLogo, COMPANY } from "@/config/company";
import { useT } from "@/i18n/I18nProvider";
import { Button, Icon } from "@/ui/primitives";
import { fdate, isPositive, money } from "@/ui/format";
import { StatusBadge } from "./display";

export interface ReceiptData {
  receiptNo: string;
  /** Decimal string from the server, e.g. "250.00". */
  amount: string;
  customerName: string;
  customerRef: string;
  invoiceNo: string;
  date: string | Date;
  bank?: string | null;
  /** Remaining invoice balance after this payment (decimal string). */
  balance: string;
}

/** Printed payment receipt (orange top rule, amount block, dashed rows). */
export function ReceiptPaper({ r, compact }: { r: ReceiptData; compact?: boolean }) {
  const t = useT();
  const lg = bankLogo(r.bank);
  const status = isPositive(r.balance) ? "Partial Paid" : "Paid";
  const fs = compact ? 12 : 13;
  const row = (l: string, v: ReactNode, mono?: boolean) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "7px 0",
        borderBottom: "1px dashed var(--border-default)",
        fontSize: fs,
        alignItems: "center",
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>{t(l)}</span>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: "var(--text-strong)",
          fontWeight: 600,
          textAlign: "end",
          fontFamily: mono ? "var(--font-mono)" : undefined,
        }}
      >
        {v}
      </span>
    </div>
  );
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border-default)",
        borderTop: "4px solid var(--orange-500)",
        borderRadius: 8,
        padding: compact ? 14 : 20,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <img src="/brand/orbit-logo.png" alt={COMPANY.name} style={{ height: compact ? 30 : 38 }} />
        <div style={{ textAlign: "end", fontSize: 10, lineHeight: 1.45, color: "var(--text-muted)" }}>
          <b style={{ color: "var(--text-strong)", fontSize: 11 }}>{COMPANY.name.toUpperCase()}</b>
          {COMPANY.addressLines.map((l) => (
            <span key={l}>
              <br />
              {l}
            </span>
          ))}
          <br />
          {COMPANY.phones.join(" · ")}
        </div>
      </div>
      <div
        style={{
          textAlign: "center",
          padding: "6px 0",
          borderTop: "1px solid var(--border-default)",
          borderBottom: "1px solid var(--border-default)",
        }}
      >
        <div
          style={{
            font: `800 ${compact ? 17 : 20}px var(--font-display)`,
            color: "var(--navy-700)",
            letterSpacing: ".04em",
          }}
        >
          {t("PAYMENT RECEIPT")}
        </div>
        <div style={{ font: "600 12px var(--font-mono)", color: "var(--text-muted)", marginTop: 2 }}>{r.receiptNo}</div>
      </div>
      <div
        style={{
          textAlign: "center",
          padding: compact ? 10 : 14,
          background: "var(--surface-sunken)",
          borderRadius: 8,
        }}
      >
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("Amount Received")}</div>
        <div
          style={{
            font: `800 ${compact ? 26 : 32}px var(--font-display)`,
            color: "var(--green-600)",
            marginTop: 2,
          }}
        >
          {money(r.amount)}
        </div>
      </div>
      <div>
        {row("Received from", r.customerName)}
        {row("Customer Reference", r.customerRef, true)}
        {row("Invoice No.", r.invoiceNo, true)}
        {row("Payment Date", fdate(r.date))}
        {row(
          "Bank",
          <>
            {lg && <img src={lg} alt="" style={{ width: 20, height: 20, borderRadius: 4 }} />}
            {r.bank ?? "—"}
          </>,
        )}
        {row("Remaining Balance", money(r.balance))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <StatusBadge status={status} />
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("Thank you for choosing Orbit Cargo")}</span>
      </div>
    </div>
  );
}

/** Bottom sheet that shows a receipt with Close / Download actions. */
export function ReceiptSheet({
  r,
  onClose,
  onDownload,
  contained,
}: {
  r: ReceiptData;
  onClose: () => void;
  onDownload?: () => void;
  /** Position inside the nearest positioned ancestor (device frame) instead of the viewport. */
  contained?: boolean;
}) {
  const t = useT();
  return (
    <div
      onClick={onClose}
      style={{
        position: contained ? "absolute" : "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(1,27,64,.55)",
        display: "flex",
        alignItems: "flex-end",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("PAYMENT RECEIPT")}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxHeight: "88%",
          overflowY: "auto",
          background: "var(--surface-sunken, #F3F5F9)",
          borderRadius: "18px 18px 0 0",
          padding: "10px 14px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <span style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, background: "var(--border-strong)" }} />
        <ReceiptPaper r={r} compact />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Button variant="outline" onClick={onClose}>
            {t("Close")}
          </Button>
          <Button leadingIcon={<Icon name="FileDown" size={16} />} onClick={onDownload} disabled={!onDownload}>
            {t("Download PDF")}
          </Button>
        </div>
      </div>
    </div>
  );
}
