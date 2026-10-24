"use client";

/* eslint-disable @next/next/no-img-element -- bank logos */
import { useMemo, useState, useTransition } from "react";
import { bankLogo } from "@/config/company";
import { useT } from "@/i18n/I18nProvider";
import { DateField, StatusBadge, INVOICE_STATUS_LABEL } from "@/ui/kit";
import { Button, Dialog, Icon, Input } from "@/ui/primitives";
import { money } from "@/ui/format";
import type { ShipmentInvoiceRow, ShipmentPaymentRow } from "@/modules/finance/shipmentFinance";
import { addPaymentAction, editPaymentAction } from "./actions";
import { labelStyle, useToast } from "@/components/admin/ui";

export interface BankOption {
  id: string;
  name: string;
  isCash: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const cents = (v: string | number) => Math.round((Number(v) || 0) * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);

/**
 * + Add Payment / Edit Payment (design: AdminFinance pay dialog). Only this
 * shipment's invoices are offered; Total / Paid / Balance and the status
 * before → after are shown so staff see what is owed. The server re-checks
 * every figure.
 */
export function PaymentDialog({
  shipmentCode,
  invoices,
  banks,
  editing,
  onClose,
}: {
  shipmentCode: string;
  invoices: ShipmentInvoiceRow[];
  banks: BankOption[];
  editing?: ShipmentPaymentRow;
  onClose: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState(editing ? `${editing.customerRef} — ${editing.customerName}` : "");
  const [open, setOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState(editing?.invoiceId ?? "");
  const [amount, setAmount] = useState(editing?.amount ?? "");
  const [bankId, setBankId] = useState(banks.find((b) => b.name === editing?.bank)?.id ?? banks[0]?.id ?? "");
  const [date, setDate] = useState(editing ? editing.receivedAt.slice(0, 10) : today());
  // One idempotency key per opened dialog: a double click can't pay twice.
  const [key] = useState(() => crypto.randomUUID());

  const inv = invoices.find((i) => i.id === invoiceId);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    return invoices
      .filter((i) => editing || Number(i.balance) > 0)
      .filter((i) => !s || `${i.customerRef} ${i.customerName} ${i.number}`.toLowerCase().includes(s));
  }, [q, invoices, editing]);

  // When editing, the old amount is given back before the new one applies.
  const oldC = editing ? cents(editing.amount) : 0;
  const balC = inv ? cents(inv.balance) + oldC : 0;
  const paidC = inv ? cents(inv.paid) - oldC : 0;
  const amtC = Math.min(cents(amount), balC);
  const afterC = balC - amtC;
  const nextStatus = afterC === 0 && inv ? "PAID" : paidC + amtC > 0 ? "PARTIAL" : "UNPAID";

  const save = () =>
    start(async () => {
      setError(null);
      if (!inv) return setError("Select a customer first");
      const values = { amount: String(amount).trim(), bankId, date };
      const r = editing ? await editPaymentAction(editing.id, values) : await addPaymentAction(inv.id, values, key);
      if (!r.ok) return setError(r.error);
      toast({ tone: "success", title: editing ? "Payment updated" : "Payment added", message: `${money(values.amount)} · ${inv.customerName}` });
      onClose();
    });

  const ro = { height: 40, padding: "0 12px", display: "flex", alignItems: "center", border: "1px solid var(--border-default)", borderRadius: 6, background: "var(--surface-sunken)", fontSize: 14, color: "var(--text-strong)" } as const;

  return (
    <Dialog
      open
      width={560}
      title={`${t(editing ? "Edit Payment" : "Add Payment")} · ${shipmentCode}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("Cancel")}
          </Button>
          <Button leadingIcon={<Icon name="Check" size={16} />} onClick={save} disabled={pending || !inv || amtC <= 0} data-testid="save-payment">
            {t("Save Payment")}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {!editing && (
          <div style={{ position: "relative" }}>
            <Input
              label={t("Customer Name / Reference")}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder={t("Type name or reference...")}
              leadingIcon={<Icon name="Search" size={15} />}
              data-testid="payment-customer"
            />
            {open && (
              <div
                role="listbox"
                style={{ position: "absolute", left: 0, right: 0, top: "100%", marginTop: 4, zIndex: 30, background: "#fff", border: "1px solid var(--border-default)", borderRadius: "var(--radius-m)", boxShadow: "var(--shadow-3)", maxHeight: 220, overflowY: "auto" }}
              >
                {matches.length ? (
                  matches.map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      role="option"
                      aria-selected={i.id === invoiceId}
                      onClick={() => {
                        setInvoiceId(i.id);
                        setAmount(i.balance);
                        setQ(`${i.customerRef} — ${i.customerName}`);
                        setOpen(false);
                      }}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", border: 0, borderBottom: "1px solid var(--border-default)", background: "#fff", cursor: "pointer", textAlign: "start" }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ display: "block", fontSize: 13, color: "var(--text-strong)" }}>{i.customerName}</b>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                          {i.customerRef} · {i.number}
                        </span>
                      </span>
                      <StatusBadge status={INVOICE_STATUS_LABEL[i.status]} />
                    </button>
                  ))
                ) : (
                  <div style={{ padding: 12, fontSize: 13, color: "var(--text-muted)" }}>{t("No customer found in this shipment")}</div>
                )}
              </div>
            )}
          </div>
        )}
        {inv && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              ["Customer", inv.customerName],
              ["Reference", inv.customerRef],
            ].map(([k, x]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <span style={labelStyle}>{t(k!)}</span>
                <div style={ro}>{x}</div>
              </div>
            ))}
          </div>
        )}
        {inv && (
          <div style={{ padding: 12, borderRadius: "var(--radius-m)", background: "var(--surface-sunken)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, fontSize: 12 }}>
              {(
                [
                  ["Total", inv.total],
                  ["Paid", fromCents(paidC)],
                  ["Balance", fromCents(balC)],
                ] as const
              ).map(([k, x]) => (
                <div key={k}>
                  <div style={{ color: "var(--text-muted)" }}>{t(k)}</div>
                  <b style={{ color: k === "Balance" ? "var(--red-600)" : "var(--text-strong)" }}>{money(x)}</b>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingTop: 10, borderTop: "1px dashed var(--border-strong)", fontSize: 12, color: "var(--text-muted)" }}>
              <span>{t("Status")}:</span>
              <StatusBadge status={INVOICE_STATUS_LABEL[inv.status]} />
              <Icon name="ArrowRight" size={14} />
              <span>{t("After payment")}:</span>
              <StatusBadge status={INVOICE_STATUS_LABEL[nextStatus]} />
              {afterC > 0 && (
                <span style={{ marginInlineStart: "auto" }}>
                  {t("Remaining")}: <b style={{ color: "var(--red-600)" }}>{money(fromCents(afterC))}</b>
                </span>
              )}
            </div>
            {cents(amount) > balC && <div style={{ color: "var(--status-danger)", fontSize: 12 }}>{t("Amount is more than the balance")}</div>}
          </div>
        )}
        <Input label={`${t("Amount")} (USD)`} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="payment-amount" />
        <div>
          <div style={{ ...labelStyle, marginBottom: 6 }}>{t("Bank")}</div>
          <div role="radiogroup" aria-label={t("Bank")} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 8 }}>
            {banks.map((b) => {
              const on = bankId === b.id;
              const logo = bankLogo(b.name);
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setBankId(b.id)}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 10, borderRadius: "var(--radius-m)", cursor: "pointer", border: "1.5px solid " + (on ? "var(--navy-700)" : "var(--border-default)"), background: on ? "var(--surface-brand-tint)" : "#fff", font: "600 12px var(--font-body)", color: "var(--text-strong)" }}
                >
                  {logo ? (
                    <img src={logo} alt="" style={{ width: 32, height: 32, borderRadius: 6 }} />
                  ) : (
                    <span style={{ width: 32, height: 32, borderRadius: 6, background: "var(--green-50, #EAF7EF)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="Banknote" size={18} color="var(--green-600)" />
                    </span>
                  )}
                  {t(b.name)}
                </button>
              );
            })}
          </div>
        </div>
        <DateField label="Date" value={date} onChange={setDate} max={today()} />
        {error && (
          <div role="alert" style={{ color: "var(--status-danger)", fontSize: 13 }}>
            {t(error)}
          </div>
        )}
      </div>
    </Dialog>
  );
}
