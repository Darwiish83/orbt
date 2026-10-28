"use client";

/* eslint-disable @next/next/no-img-element -- small static brand/bank images */
import { bankLogo } from "@/config/company";
import { useT } from "@/i18n/I18nProvider";
import { Button, Icon } from "@/ui/primitives";
import { fdate, isPositive, money } from "@/ui/format";
import { PaymentPaper } from "./PaymentPaper";

export interface ReceiptData {
  receiptNo: string;
  /** Decimal string from the server, e.g. "250.00". */
  amount: string;
  /** The amount in words, ending with "only". */
  inWords: string;
  customerName: string;
  customerRef: string;
  invoiceNo: string;
  shipmentCode: string | null;
  mode: "AIR" | "SEA" | null;
  date: string | Date;
  bank?: string | null;
  invoiceTotal: string;
  /** Paid on the invoice up to and including this payment. */
  paidToDate: string;
  /** Remaining invoice balance after this payment (decimal string). */
  balance: string;
  reversed?: boolean;
}

/**
 * Customer payment receipt (Style 1, see PaymentPaper). `side="customer"` is
 * how the customer reads it in their app: they paid, Orbit received — so it
 * says "Payment confirmation / Amount paid / Paid by" (owner 2026-10-27).
 */
export function ReceiptPaper({ r, compact, side = "staff" }: { r: ReceiptData; compact?: boolean; side?: "staff" | "customer" }) {
  const mine = side === "customer";
  const t = useT();
  const lg = bankLogo(r.bank);
  const owing = isPositive(r.balance);
  return (
    <PaymentPaper
      compact={compact}
      title={mine ? "PAYMENT CONFIRMATION" : "PAYMENT RECEIPT"}
      amountLabel={mine ? "Amount paid" : "Amount received"}
      amount={money(r.amount)}
      inWords={r.inWords}
      numberLabel={mine ? "Payment No." : "Receipt No."}
      number={r.receiptNo}
      date={fdate(r.date)}
      reversed={r.reversed}
      fields={[
        [mine ? "Paid by" : "Received from", r.customerName, r.customerRef],
        [
          "Paid into",
          <span key="b" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {lg && <img src={lg} alt="" style={{ width: 18, height: 18, borderRadius: 4 }} />}
            {r.bank ? t(r.bank) : "—"}
          </span>,
        ],
        ["For invoice", r.invoiceNo, r.shipmentCode ? `${t("Shipment")} ${r.shipmentCode}${r.mode ? ` · ${t(r.mode === "AIR" ? "Air" : "Sea")}` : ""}` : null],
        ["Status", <span key="s" style={{ color: owing ? "#C2410C" : "var(--status-success)" }}>{t(owing ? "Partially paid" : "Paid in full")}</span>],
      ]}
      summary={[
        { label: "Invoice total", value: money(r.invoiceTotal) },
        { label: "Paid to date", value: money(r.paidToDate) },
        { label: "Balance remaining", value: money(r.balance), strong: true, tone: owing ? "orange" : "navy" },
      ]}
    />
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
