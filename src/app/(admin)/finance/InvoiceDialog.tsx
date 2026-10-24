"use client";

/* eslint-disable @next/next/no-img-element -- brand logo */
import { useState, useTransition, type ReactNode } from "react";
import { COMPANY } from "@/config/company";
import { useT } from "@/i18n/I18nProvider";
import { Button, Dialog, Icon } from "@/ui/primitives";
import { fdate, money, num } from "@/ui/format";
import type { InvoiceDefaults } from "@/modules/finance/shipmentFinance";
import { createInvoiceAction, updateInvoiceAction, type InvoiceFormValues } from "./actions";
import { AddPill, fieldStyle, TrashBtn, useToast } from "@/components/admin/ui";

type Flags = "hasBrand" | "hasFatura" | "hasDelivery" | "hasOther" | "hasDiscount" | "hasAgent";
interface FormState extends Record<Flags, boolean> {
  measure: string;
  rate: string;
  quality: string;
  brandPcs: string;
  brandRate: string;
  fatura: string;
  delivery: string;
  other: string;
  otherDesc: string;
  discount: string;
  agent: string;
  comRate: string;
}

export interface InvoiceDialogTarget {
  mode: "AIR" | "SEA";
  shipmentId: string;
  shipmentCode: string;
  customerId: string;
  customerName: string;
  customerRef: string;
  /** Measure recorded on the shipment (read-only here). */
  actualMeasure: string;
  /** Existing invoice when editing. */
  invoiceId?: string;
  invoiceNo?: string;
  initial: InvoiceFormValues | InvoiceDefaults;
}

const pos = (v: unknown) => Number(v ?? 0) > 0;
const str = (v: unknown) => (v == null ? "" : String(v));

function toForm(i: InvoiceFormValues | InvoiceDefaults, actual: string): FormState {
  const v = i as Partial<InvoiceFormValues & InvoiceDefaults>;
  return {
    measure: str(v.billedMeasure ?? actual),
    rate: str(v.baseRate),
    quality: str(v.qualityRate ?? ""),
    brandPcs: str(v.brandPcs ?? ""),
    brandRate: str(v.brandRate ?? ""),
    fatura: str(v.fatura ?? ""),
    delivery: str(v.localDelivery ?? ""),
    other: str(v.others ?? ""),
    otherDesc: str(v.othersDescription ?? ""),
    discount: str(v.discount ?? ""),
    agent: str(v.agentName ?? ""),
    comRate: str(v.agentRate ?? ""),
    hasBrand: pos(v.brandPcs) && pos(v.brandRate),
    hasFatura: pos(v.fatura),
    hasDelivery: pos(v.localDelivery),
    hasOther: pos(v.others),
    hasDiscount: pos(v.discount),
    hasAgent: !!v.agentName,
  };
}

/** Display-only preview of the totals; the server recomputes everything. */
function preview(v: FormState) {
  const n = (x: string) => Number(x) || 0;
  const freight = n(v.measure) * (n(v.rate) + (v.hasAgent ? n(v.comRate) : 0));
  const qc = n(v.quality) * n(v.measure);
  const brand = v.hasBrand ? n(v.brandPcs) * n(v.brandRate) : 0;
  const sub = freight + qc + brand + (v.hasFatura ? n(v.fatura) : 0) + (v.hasDelivery ? n(v.delivery) : 0) + (v.hasOther ? n(v.other) : 0);
  const disc = v.hasDiscount ? n(v.discount) : 0;
  return { freight, qc, brand, sub, disc, total: Math.max(0, sub - disc), commission: v.hasAgent ? n(v.comRate) * n(v.measure) : 0 };
}

function toValues(v: FormState): InvoiceFormValues {
  const keep = (on: boolean, x: string) => (on && x.trim() ? x.trim() : undefined);
  return {
    billedMeasure: v.measure.trim(),
    baseRate: v.rate.trim(),
    qualityRate: v.quality.trim() || undefined,
    brandPcs: v.hasBrand && v.brandPcs.trim() ? Number(v.brandPcs) : 0,
    brandRate: keep(v.hasBrand, v.brandRate),
    fatura: keep(v.hasFatura, v.fatura),
    localDelivery: keep(v.hasDelivery, v.delivery),
    others: keep(v.hasOther, v.other),
    othersDescription: v.hasOther ? v.otherDesc.trim() || undefined : undefined,
    discount: keep(v.hasDiscount, v.discount),
    agentName: v.hasAgent ? v.agent.trim() || undefined : undefined,
    agentRate: keep(v.hasAgent, v.comRate),
  };
}

export function InvoiceDialog({ target, onClose, onSaved }: { target: InvoiceDialogTarget; onClose: () => void; onSaved: (invoiceId: string) => void }) {
  const t = useT();
  const toast = useToast();
  const air = target.mode === "AIR";
  const u = air ? "KG" : "CBM";
  const [v, setV] = useState<FormState>(() => toForm(target.initial, target.actualMeasure));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof FormState>(k: K, x: FormState[K]) => setV((o) => ({ ...o, [k]: x }));
  const c = preview(v);
  const editing = !!target.invoiceId;

  const save = () =>
    start(async () => {
      setError(null);
      const values = toValues(v);
      const r = editing ? await updateInvoiceAction(target.invoiceId!, values) : await createInvoiceAction(target.shipmentId, target.customerId, values);
      if (!r.ok) return setError(r.error);
      toast({ tone: "success", title: editing ? "Invoice updated" : "Invoice created", message: `${r.data!.number} · ${target.customerName}` });
      onSaved(r.data!.id);
    });

  const N = (k: keyof FormState, extra?: { placeholder?: string; step?: string; label?: string }) => (
    <input
      type="number"
      inputMode="decimal"
      min="0"
      step={extra?.step ?? "0.01"}
      aria-label={t(extra?.label ?? String(k))}
      value={v[k] as string}
      placeholder={extra?.placeholder}
      onChange={(e) => set(k, e.target.value as never)}
      style={fieldStyle}
    />
  );
  const dash = <span style={{ color: "var(--text-muted)" }}>-</span>;
  const rows = (
    [
      [air ? "Air Freight" : "Sea Freight", N("measure", { step: "0.001", label: `${t("Billed")} ${u}` }), N("rate", { label: "Rate (USD)" }), money(c.freight)],
      ["Quality Control", num(Number(v.measure) || 0, 1) + (air ? " kg" : " m³"), N("quality", { label: "Quality (USD)" }), money(c.qc)],
      v.hasBrand && ["Brand", N("brandPcs", { step: "1", placeholder: "PCS", label: "Brand PCS" }), N("brandRate", { label: "Brand Rate (USD)" }), money(c.brand), "hasBrand"],
      v.hasFatura && ["Fatura", dash, dash, N("fatura", { label: "Fatura (USD)" }), "hasFatura"],
      v.hasDelivery && ["Local Delivery", dash, dash, N("delivery", { label: "Local Delivery (USD)" }), "hasDelivery"],
      v.hasOther && [
        "Others",
        <input key="d" value={v.otherDesc} maxLength={120} onChange={(e) => set("otherDesc", e.target.value)} style={fieldStyle} placeholder={t("Description")} aria-label={t("Description")} />,
        dash,
        N("other", { label: "Others (USD)" }),
        "hasOther",
      ],
    ].filter(Boolean) as [string, ReactNode, ReactNode, ReactNode, Flags?][]
  );
  const adds = (
    [
      ["hasBrand", "Add Brand"],
      ["hasFatura", "Add Fatura"],
      ["hasDelivery", "Add Local Delivery"],
      ["hasOther", "Add Others"],
      ["hasDiscount", "Add Discount"],
      ["hasAgent", "Add Agent Commission"],
    ] as [Flags, string][]
  ).filter(([k]) => !v[k]);
  const diff = (Number(v.measure) || 0) - (Number(target.actualMeasure) || 0);
  const box = { minHeight: 40, padding: "0 12px", border: "1px solid var(--border-default)", borderRadius: 6, background: "var(--surface-sunken)", display: "flex", alignItems: "center", fontSize: 13, color: "var(--text-strong)" } as const;
  const F = (lb: string, x: ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ font: "600 12px var(--font-body)", color: "var(--text-strong)" }}>{t(lb)}</span>
      <div style={box}>{x}</div>
    </div>
  );
  const td = { padding: 8, fontSize: 12, color: "var(--text-strong)", verticalAlign: "middle" } as const;

  return (
    <Dialog
      open
      width={860}
      title={editing ? `${t("Edit Invoice")} ${target.invoiceNo}` : t("Create Invoice")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("Cancel")}
          </Button>
          <Button leadingIcon={<Icon name="Check" size={16} />} onClick={save} disabled={pending} data-testid="save-invoice">
            {t(editing ? "Save Changes" : "Create Invoice")}
          </Button>
        </>
      }
    >
      <div style={{ border: "1px solid var(--border-default)", borderRadius: 8, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingBottom: 12, borderBottom: "1px solid var(--border-default)" }}>
          <img src="/brand/orbit-logo.png" alt={COMPANY.name} style={{ height: 48 }} />
          <div style={{ textAlign: "end", fontSize: 10, lineHeight: 1.5, color: "var(--text-muted)" }}>
            <b style={{ fontSize: 11, color: "var(--text-strong)" }}>{COMPANY.name.toUpperCase()}</b>
            {COMPANY.addressLines.map((l) => (
              <div key={l}>{l}</div>
            ))}
            <div>{COMPANY.phone}</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          {F("Customer Name", target.customerName)}
          {F("Reference", target.customerRef)}
          {F("Invoice Date", fdate(new Date()))}
          {F("Transport Mode", t(air ? "Air Freight" : "Sea Freight"))}
          {F("Shipment", target.shipmentCode)}
          {F("Destination", "Somalia · Mogadishu")}
        </div>
        <div style={{ border: "1px solid var(--border-default)", borderRadius: 6, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", display: "table", whiteSpace: "normal" }}>
            <thead>
              <tr style={{ background: "var(--surface-brand-tint)" }}>
                {["#", "Description", `${t("Billed")} ${u}`, "Rate (USD)", "Amount (USD)", ""].map((h, i) => (
                  <th key={i} style={{ padding: 8, textAlign: "start", font: "600 11px var(--font-body)", color: "var(--text-strong)" }}>
                    {t(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r[0]} style={{ borderTop: "1px solid var(--border-default)" }}>
                  <td style={{ ...td, color: "var(--text-muted)" }}>{i + 1}</td>
                  <td style={td}>{t(r[0])}</td>
                  <td style={{ ...td, width: 130 }}>{r[1]}</td>
                  <td style={{ ...td, width: 130 }}>{r[2]}</td>
                  <td style={{ ...td, width: 140, fontWeight: 600 }}>{r[3]}</td>
                  <td style={{ width: 36 }}>{r[4] && <TrashBtn onClick={() => set(r[4]!, false)} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "10px 12px",
            borderRadius: 8,
            background: diff ? "#FFF6E8" : "var(--surface-sunken)",
            border: "1px solid " + (diff ? "#F2D49B" : "var(--border-default)"),
            fontSize: 13,
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-strong)" }}>
            <Icon name="Lock" size={14} color="var(--text-muted)" />
            {t("Actual")} {u}: <b>{num(target.actualMeasure, 1)}</b>
          </span>
          <span style={{ color: "var(--text-muted)" }}>·</span>
          <span style={{ color: "var(--text-strong)" }}>
            {t("Billed")} {u}: <b>{num(Number(v.measure) || 0, 1)}</b>
          </span>
          {diff !== 0 && (
            <span style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 6, color: "#A15C00", fontWeight: 600 }}>
              <Icon name="TriangleAlert" size={14} />
              {t("Difference")}: {diff > 0 ? "+" : ""}
              {num(diff, 1)} {u}
            </span>
          )}
          <span style={{ flexBasis: "100%", fontSize: 11, color: "var(--text-muted)" }}>{t("Reports use Actual only. The customer sees Billed on the invoice.")}</span>
        </div>
        {v.hasAgent && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", borderRadius: 8, background: "#EEF4FF", border: "1px solid #C9D9F5" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, font: "600 13px var(--font-body)", color: "var(--navy-700)" }}>
              <Icon name="Handshake" size={16} />
              {t("Agent commission")}
              <span style={{ marginInlineStart: "auto" }}>
                <TrashBtn onClick={() => set("hasAgent", false)} />
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                {t("Agent / Company")}
                <input value={v.agent} maxLength={120} onChange={(e) => set("agent", e.target.value)} placeholder="Ahmed Ali / Hamar Trading" style={fieldStyle} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)" }}>
                {t("Commission rate")} (USD / {u})
                <input type="number" min="0" step="0.01" value={v.comRate} onChange={(e) => set("comRate", e.target.value)} placeholder="1.00" style={fieldStyle} />
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 13, color: "var(--text-strong)" }}>
              <span>
                {t("Shipment rate")}: <b>{money(Number(v.rate) || 0)}</b>
              </span>
              <span style={{ color: "var(--text-muted)" }}>+</span>
              <span>
                {t("Commission")}: <b style={{ color: "var(--navy-700)" }}>{money(Number(v.comRate) || 0)}</b>
              </span>
              <span style={{ color: "var(--text-muted)" }}>=</span>
              <span>
                {t("Customer rate")}: <b>{money((Number(v.rate) || 0) + (Number(v.comRate) || 0))}</b>
              </span>
              <span style={{ marginInlineStart: "auto", fontWeight: 700, color: "var(--navy-700)" }}>
                {num(Number(v.measure) || 0, 1)} {u} × {money(Number(v.comRate) || 0)} = {money(c.commission)}
              </span>
            </div>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {t("Customer sees the total rate. Commission is not counted as shipment income, and shows in Commissions after the customer pays in full.")}
            </span>
          </div>
        )}
        {adds.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {adds.map(([k, lb]) => (
              <AddPill key={k} label={lb} onClick={() => set(k, true)} />
            ))}
          </div>
        )}
        <div style={{ alignSelf: "flex-end", width: 320, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)" }}>
            <span>{t("Sub Total")}</span>
            <b style={{ color: "var(--text-strong)" }}>{money(c.sub)}</b>
          </div>
          {v.hasDiscount && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
              <span style={{ fontSize: 13, color: "var(--text-strong)" }}>{t("Discount")}</span>
              <input type="number" min="0" step="0.01" aria-label={t("Discount")} value={v.discount} onChange={(e) => set("discount", e.target.value)} style={{ ...fieldStyle, width: 130, textAlign: "center" }} />
              <TrashBtn onClick={() => set("hasDiscount", false)} />
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--border-default)", font: "700 15px var(--font-body)", color: "var(--text-strong)" }}>
            <span>{t("TOTAL USD")}</span>
            <span style={{ fontSize: 18 }}>{money(c.total)}</span>
          </div>
        </div>
        {error && (
          <div role="alert" style={{ color: "var(--status-danger)", fontSize: 13 }}>
            {t(error)}
          </div>
        )}
      </div>
    </Dialog>
  );
}
