"use client";

import type { InvoiceStatus } from "@prisma/client";
import { useT } from "@/i18n/I18nProvider";
import type { MyReceiptRow } from "@/modules/finance/shipmentFinance";
import { money } from "@/ui/format";
import { Badge, Icon, type BadgeTone } from "@/ui/primitives";

export interface MyInvoice {
  id: string;
  number: string;
  currency: string;
  status: InvoiceStatus;
  total: string;
  paid: string;
  balance: string;
  receipts: MyReceiptRow[];
}

const TONE: Record<InvoiceStatus, BadgeTone> = { UNPAID: "danger", PARTIAL: "warning", PAID: "success", VOID: "neutral" };
const LABEL: Record<InvoiceStatus, string> = { UNPAID: "Unpaid", PARTIAL: "Partial", PAID: "Paid", VOID: "Void" };

const card: React.CSSProperties = {
  background: "var(--surface-card)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-l)",
  boxShadow: "var(--shadow-1)",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const link: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, color: "var(--navy-700)", fontWeight: 600, textDecoration: "none" };
const figure: React.CSSProperties = { fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" };

/** Opens the paper in a new tab; its "Download PDF" button prints or saves it. */
function PaperLink({ href, label, testId }: { href: string; label: string; testId: string }) {
  return (
    <a href={href} target="_blank" rel="noopener" style={link} data-testid={testId}>
      <Icon name="FileDown" size={16} />
      {label}
    </a>
  );
}

const day = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function InvoiceList({ invoices }: { invoices: MyInvoice[] }) {
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <h1 style={{ font: "700 24px/1.2 var(--font-display)", color: "var(--text-strong)", margin: 0 }}>{t("Invoices")}</h1>
      {invoices.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>{t("No invoices yet.")}</p>
      ) : (
        invoices.map((inv) => (
          <div key={inv.id} style={card} data-testid="my-invoice">
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--navy-700)" }}>{inv.number}</span>
              <Badge tone={TONE[inv.status]} dot>
                {t(LABEL[inv.status])}
              </Badge>
              <span style={{ marginInlineStart: "auto" }}>
                <PaperLink href={`/account/invoices/${inv.id}`} label={t("Invoice PDF")} testId="invoice-pdf" />
              </span>
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 14, color: "var(--text-body)" }}>
              <span>
                {t("Total")}: <span style={figure}>{money(inv.total)}</span>
              </span>
              <span>
                {t("Paid")}: <span style={figure}>{money(inv.paid)}</span>
              </span>
              <span>
                {t("Balance")}: <span style={figure}>{money(inv.balance)}</span>
              </span>
            </div>
            {inv.receipts.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border-default)", paddingTop: 10 }}>
                <span style={{ font: "700 12px var(--font-body)", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-muted)" }}>{t("Receipts")}</span>
                {inv.receipts.map((r) => (
                  <div key={r.paymentId} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{r.receiptNo}</span>
                    <span style={{ color: "var(--text-muted)" }}>{day(r.date)}</span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>{money(r.amount)}</span>
                    <span style={{ marginInlineStart: "auto" }}>
                      <PaperLink href={`/account/receipts/${r.paymentId}`} label={t("Receipt")} testId="receipt-pdf" />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
