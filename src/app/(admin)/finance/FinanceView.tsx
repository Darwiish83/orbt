"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { DataTable, InvoicePaper, type PaperCompany, INVOICE_STATUS_LABEL, ReceiptPaper, SearchBox, Stat, StatusBadge, SHIPMENT_STATUS_LABEL, type DataColumn } from "@/ui/kit";
import { Badge, Button, Dialog, Icon, IconButton } from "@/ui/primitives";
import { fdate, money, num } from "@/ui/format";
import type { DemurrageRow, DueInvoiceRow, ExtraMeasureRow, RevisionRow, Statement } from "@/modules/finance/ledger";
import type {
  FinanceShipmentRow,
  InvoiceDocument,
  PaymentReceiptDoc,
  ShipmentCustomerRow,
  ShipmentInvoiceRow,
  ShipmentPaymentRow,
} from "@/modules/finance/shipmentFinance";
import {
  approveDemurrageAction,
  collectedAction,
  deleteInvoiceAction,
  deletePaymentAction,
  extraDaysAction,
  loadInvoiceAction,
  loadReceiptAction,
  sendRemindersAction,
  warnDemurrageAction,
  type FinanceResult,
} from "./actions";
import { InvoiceDialog, type InvoiceDialogTarget } from "./InvoiceDialog";
import { PaymentDialog, type BankOption } from "./PaymentDialog";
import { FinBox, RowMenu, ToastHost, useToast } from "@/components/admin/ui";

export type FinanceTab = "invoices" | "payments" | "statement" | "history" | "reminders";

export interface FinanceData {
  scope: { year: number; country: string };
  tab: FinanceTab;
  mode: "AIR" | "SEA";
  q: string;
  perms: { invoiceWrite: boolean; invoiceManage: boolean; paymentRead: boolean; paymentWrite: boolean; paymentManage: boolean };
  banks: BankOption[];
  company: PaperCompany;
  shipments?: FinanceShipmentRow[];
  selected?: FinanceShipmentRow | null;
  customers?: ShipmentCustomerRow[];
  invoices?: ShipmentInvoiceRow[];
  payments?: ShipmentPaymentRow[];
  preview?: InvoiceDocument;
  statement?: Statement;
  statementCustomers?: { id: string; ref: string; name: string }[];
  statementCustomer?: string;
  sq?: string;
  hsub?: "changes" | "extra";
  hq?: string;
  revisions?: RevisionRow[];
  extra?: ExtraMeasureRow[];
  due?: DueInvoiceRow[];
  demurrage?: DemurrageRow[];
  demurrageCfg?: { freeDays: number; ratePerDay: string };
}

const TABS: [FinanceTab, string][] = [
  ["invoices", "Invoices"],
  ["payments", "Payments"],
  ["statement", "Statement"],
  ["history", "Invoice History"],
  ["reminders", "Reminders"],
];

/** DataTable is typed for plain records; finance rows are typed interfaces. */
function Table<R>(p: { cols: DataColumn<R>[]; rows: R[]; empty?: string; dense?: boolean; onRow?: (r: R) => void; rowKey?: (r: R, i: number) => string }) {
  const A = DataTable as unknown as (q: typeof p) => ReactNode;
  return <A {...p} />;
}

const sumOf = (xs: string[]) => xs.reduce((a, x) => a + Math.round((Number(x) || 0) * 100), 0) / 100;

export function FinanceView({ data }: { data: FinanceData }) {
  return (
    <ToastHost>
      <FinanceInner data={data} />
    </ToastHost>
  );
}

function FinanceInner({ data }: { data: FinanceData }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [nav, startNav] = useTransition();
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    startNav(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: nav ? 0.7 : 1, transition: "opacity .15s" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
        <Link href="/dashboard" style={{ color: "inherit" }}>
          {t("Home")}
        </Link>
        <Icon name="ChevronRight" size={12} />
        <span>{t("Finance")}</span>
        <Icon name="ChevronRight" size={12} />
        <span style={{ color: "var(--navy-700)" }}>{t(TABS.find((x) => x[0] === data.tab)![1])}</span>
      </div>
      <div>
        <h1 style={{ margin: 0, font: "700 26px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{t("Finance")}</h1>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
          {t("Manage shipment invoices. Select a shipment to view customers and create invoice.")} · {t(data.scope.country)} · {data.scope.year}
        </div>
      </div>
      <div role="tablist" style={{ display: "flex", background: "#fff", border: "1px solid var(--border-default)", borderRadius: "var(--radius-l)", overflowX: "auto" }}>
        {TABS.map(([k, l]) => {
          const on = k === data.tab;
          return (
            <button
              key={k}
              role="tab"
              aria-selected={on}
              data-testid={`fin-tab-${k}`}
              onClick={() => go({ tab: k, inv: null })}
              style={{ flex: 1, minWidth: 120, height: 48, border: 0, borderBottom: "3px solid " + (on ? "var(--navy-700)" : "transparent"), background: "transparent", cursor: "pointer", font: `${on ? 700 : 600} 14px var(--font-body)`, color: on ? "var(--navy-700)" : "var(--text-strong)" }}
            >
              {t(l)}
            </button>
          );
        })}
      </div>
      {(data.tab === "invoices" || data.tab === "payments") && <ShipmentWorkspace data={data} go={go} />}
      {data.tab === "statement" && <StatementTab data={data} go={go} />}
      {data.tab === "history" && <HistoryTab data={data} go={go} />}
      {data.tab === "reminders" && <RemindersTab data={data} go={go} />}
    </div>
  );
}

type Go = (patch: Record<string, string | null>) => void;

// ------------------------------------------------------------------ invoices & payments

function ShipmentWorkspace({ data, go }: { data: FinanceData; go: Go }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState(data.q);
  const [dialog, setDialog] = useState<InvoiceDialogTarget | null>(null);
  const [delInv, setDelInv] = useState<ShipmentInvoiceRow | null>(null);
  const [pay, setPay] = useState<{ editing?: ShipmentPaymentRow } | null>(null);
  const [delPay, setDelPay] = useState<ShipmentPaymentRow | null>(null);
  const [receipt, setReceipt] = useState<(PaymentReceiptDoc & { paymentId: string }) | null>(null);
  const [more, setMore] = useState(false);

  const S = data.selected;
  const ships = data.shipments ?? [];
  const per = 5;
  const pages = Math.max(1, Math.ceil(ships.length / per));
  const shown = ships.slice((page - 1) * per, page * per);
  const customers = data.customers ?? [];
  const invoices = data.invoices ?? [];
  const air = data.mode === "AIR";
  const u = air ? "KG" : "CBM";

  const after = <T,>(r: FinanceResult<T>, ok: () => void) => {
    if (!r.ok) toast({ tone: "danger", title: r.error });
    else ok();
  };
  const openEdit = (invoiceId: string) =>
    start(async () => {
      const r = await loadInvoiceAction(invoiceId);
      after(r, () => {
        const d = r.ok ? r.data! : null;
        const c = customers.find((x) => x.customerId === invoices.find((i) => i.id === invoiceId)?.customerId);
        if (!d || !S) return;
        setDialog({
          mode: d.mode,
          shipmentId: S.id,
          shipmentCode: S.code,
          customerId: c?.customerId ?? "",
          customerName: d.customerName,
          customerRef: d.customerRef,
          actualMeasure: d.actualMeasure,
          invoiceId: d.id,
          invoiceNo: d.number,
          initial: d.inputs as never,
        });
      });
    });
  const openReceipt = (p: ShipmentPaymentRow) =>
    start(async () => {
      const r = await loadReceiptAction(p.id);
      after(r, () => r.ok && setReceipt({ ...r.data!, paymentId: p.id }));
    });
  const invMenu = (inv: ShipmentInvoiceRow): [string, () => void][] =>
    [
      ["View Invoice", () => go({ inv: inv.id })] as [string, () => void],
      data.perms.invoiceWrite && (["Edit Invoice", () => openEdit(inv.id)] as [string, () => void]),
      ["View History", () => go({ tab: "history", hsub: "changes", hq: inv.number, inv: null })] as [string, () => void],
      data.perms.invoiceManage && (["Delete Invoice", () => setDelInv(inv)] as [string, () => void]),
    ].filter(Boolean) as [string, () => void][];

  const custCols: DataColumn<ShipmentCustomerRow>[] = [
    { key: "n", label: "#", render: (r) => customers.indexOf(r) + 1 },
    { key: "ref", label: "Reference", mono: true, render: (r) => r.ref },
    { key: "name", label: "Customer", render: (r) => r.name },
    { key: "m", label: u, align: "right", render: (r) => num(r.defaults.actualMeasure, air ? 1 : 2) },
    { key: "no", label: "Invoice No", mono: true, render: (r) => r.invoice?.number ?? "-" },
    { key: "st", label: "Status", render: (r) => (r.invoice ? <Badge tone="success">{t("Invoiced")}</Badge> : <Badge tone="warning">{t("Not Invoiced")}</Badge>) },
    {
      key: "a",
      label: "Action",
      render: (r) => {
        const inv = invoices.find((i) => i.id === r.invoice?.id);
        if (inv) return <RowMenu items={invMenu(inv)} />;
        if (!data.perms.invoiceWrite || !S) return "-";
        return (
          <Button
            size="s"
            data-testid={`create-invoice-${r.ref}`}
            onClick={() =>
              setDialog({
                mode: data.mode,
                shipmentId: S.id,
                shipmentCode: S.code,
                customerId: r.customerId,
                customerName: r.name,
                customerRef: r.ref,
                actualMeasure: r.defaults.actualMeasure,
                initial: r.defaults,
              })
            }
          >
            {t("Create Invoice")}
          </Button>
        );
      },
    },
  ];
  const invCols: DataColumn<ShipmentInvoiceRow>[] = [
    { key: "n", label: "#", render: (r) => invoices.indexOf(r) + 1 },
    { key: "c", label: "Customer", render: (r) => r.customerName },
    { key: "no", label: "Invoice No", mono: true, strong: true, render: (r) => r.number },
    { key: "d", label: "Invoice Date", render: (r) => fdate(r.createdAt) },
    { key: "t", label: "Amount", align: "right", render: (r) => money(r.total) },
    { key: "p", label: "Paid", align: "right", render: (r) => money(r.paid) },
    { key: "b", label: "Balance", align: "right", strong: true, render: (r) => money(r.balance) },
    { key: "s", label: "Status", render: (r) => <StatusBadge status={INVOICE_STATUS_LABEL[r.status]} /> },
    { key: "a", label: "Action", render: (r) => <RowMenu items={invMenu(r)} /> },
  ];
  const payments = data.payments ?? [];
  const payCols: DataColumn<ShipmentPaymentRow>[] = [
    { key: "n", label: "#", render: (r) => payments.indexOf(r) + 1 },
    { key: "d", label: "Payment Date", render: (r) => fdate(r.receivedAt) },
    { key: "r", label: "Reference", mono: true, render: (r) => r.customerRef },
    { key: "c", label: "Customer", render: (r) => r.customerName },
    { key: "m", label: "Payment Method", render: (r) => (r.bank ? t(r.bank) : "-") },
    { key: "a", label: "Amount (USD)", render: (r) => money(r.amount) },
    { key: "s", label: "Status", render: (r) => <StatusBadge status={INVOICE_STATUS_LABEL[r.invoiceStatus]} /> },
    {
      key: "x",
      label: "Action",
      render: (r) => (
        <RowMenu
          dots
          items={
            [
              ["View Invoice", () => go({ tab: "invoices", inv: r.invoiceId })],
              ["View Receipt", () => openReceipt(r)],
              data.perms.paymentManage && ["Edit Payment", () => setPay({ editing: r })],
              data.perms.paymentManage && ["Delete Payment", () => setDelPay(r)],
            ].filter(Boolean) as [string, () => void][]
          }
        />
      ),
    },
  ];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {(
            [
              ["AIR", "Air Shipments", "Plane"],
              ["SEA", "Sea Shipments", "Ship"],
            ] as const
          ).map(([k, l, ic]) => {
            const on = data.mode === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setPage(1);
                  go({ mode: k, ship: null, inv: null });
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 42, padding: "0 16px", borderRadius: "var(--radius-m)", border: 0, cursor: "pointer", background: on ? "var(--navy-700)" : "var(--navy-50)", color: on ? "#fff" : "var(--navy-700)", font: "700 14px var(--font-body)" }}
              >
                <Icon name={ic} size={17} />
                {t(l)}
              </button>
            );
          })}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            go({ q, ship: null, inv: null });
          }}
        >
          <SearchBox value={q} onChange={setQ} placeholder="Search shipment no..." style={{ width: 280, maxWidth: "100%" }} />
        </form>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 240px", maxWidth: 300, minWidth: 220 }}>
          <FinBox title={air ? "Air Shipments" : "Sea Shipments"} pad={12}>
            {shown.map((s) => {
              const on = S?.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-testid={`fin-ship-${s.code}`}
                  onClick={() => go({ ship: s.id, inv: null })}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: "var(--radius-m)", cursor: "pointer", textAlign: "start", border: "1px solid " + (on ? "var(--navy-500, #2E5BA8)" : "var(--border-default)"), background: on ? "var(--surface-brand-tint)" : "#fff" }}
                >
                  <span style={{ width: 32, height: 32, borderRadius: "var(--radius-s)", background: "var(--navy-700)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    <Icon name={s.mode === "AIR" ? "Plane" : "Ship"} size={16} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", font: "700 14px var(--font-body)", color: "var(--text-strong)" }}>{s.code}</span>
                    <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>{fdate(s.shipDate)}</span>
                    <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>
                      {t("Packages")}: {s.packages} | {s.mode === "AIR" ? num(s.measure) + " KG" : num(s.measure, 1) + " CBM"}
                    </span>
                  </span>
                  <span style={{ fontSize: 10, padding: "3px 6px", borderRadius: 4, background: "var(--gray-100)", color: "var(--text-body)", whiteSpace: "nowrap" }}>{t(SHIPMENT_STATUS_LABEL[s.status])}</span>
                  <Icon name="ChevronRight" size={15} color="var(--text-muted)" />
                </button>
              );
            })}
            {!shown.length && <div style={{ padding: 12, fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>{t("No records found")}</div>}
            {pages > 1 && (
              <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                <IconButton size="s" variant="outline" label={t("Prev")} icon={<Icon name="ChevronLeft" size={14} />} onClick={() => setPage((p) => Math.max(1, p - 1))} />
                {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    style={{ width: 32, height: 32, borderRadius: 6, cursor: "pointer", border: "1px solid " + (n === page ? "var(--navy-700)" : "var(--border-default)"), background: n === page ? "var(--navy-700)" : "#fff", color: n === page ? "#fff" : "var(--text-strong)", font: "700 13px var(--font-body)" }}
                  >
                    {n}
                  </button>
                ))}
                <IconButton size="s" variant="outline" label={t("Next")} icon={<Icon name="ChevronRight" size={14} />} onClick={() => setPage((p) => Math.min(pages, p + 1))} />
              </div>
            )}
          </FinBox>
        </div>
        {S ? (
          <div style={{ flex: "999 1 420px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <FinBox pad={14}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ width: 44, height: 44, borderRadius: "var(--radius-m)", background: "var(--navy-700)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  <Icon name={air ? "Plane" : "Ship"} size={22} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "700 19px var(--font-display)", color: "var(--text-strong)" }}>
                    {t("Shipment")} {S.code}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {fdate(S.shipDate)} | {S.packages} {t("Packages")} | {air ? num(S.measure) + " KG" : num(S.measure, 1) + " CBM"}
                  </div>
                </div>
                {data.tab === "payments" && data.perms.paymentWrite && (
                  <Button
                    leadingIcon={<Icon name="Plus" size={16} />}
                    data-testid="add-payment"
                    onClick={() => (invoices.some((i) => Number(i.balance) > 0) ? setPay({}) : toast({ tone: "info", title: "No outstanding invoices", message: S.code }))}
                  >
                    {t("Add Payment")}
                  </Button>
                )}
                <span style={{ position: "relative" }}>
                  <IconButton variant="outline" label={t("More")} icon={<Icon name="Ellipsis" size={18} />} onClick={() => setMore((m) => !m)} />
                  {more && (
                    <div onMouseLeave={() => setMore(false)} style={{ position: "absolute", insetInlineEnd: 0, top: 44, zIndex: 10, background: "#fff", border: "1px solid var(--border-default)", borderRadius: "var(--radius-m)", boxShadow: "var(--shadow-3)", minWidth: 190, padding: 4 }}>
                      {(
                        [
                          ["Open Shipment", "ExternalLink", () => router.push(`/shipments/${S.id}`)],
                          ["Statement", "FileText", () => go({ tab: "statement" })],
                        ] as const
                      ).map(([l, ic, fn]) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => {
                            setMore(false);
                            fn();
                          }}
                          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", height: 36, padding: "0 10px", border: 0, background: "transparent", cursor: "pointer", font: "500 13px var(--font-body)", color: "var(--text-strong)", borderRadius: 4, textAlign: "start" }}
                        >
                          <Icon name={ic} size={15} />
                          {t(l)}
                        </button>
                      ))}
                    </div>
                  )}
                </span>
              </div>
            </FinBox>
            {data.tab === "invoices" && (
              <>
                <FinBox title="Customers in this Shipment" pad={14}>
                  <Table dense rows={customers} cols={custCols} empty="No customers in this shipment" rowKey={(r) => r.customerId} />
                </FinBox>
                <FinBox title={`${t("Invoices for Shipment")} ${S.code}`} pad={14}>
                  <Table dense rows={invoices} cols={invCols} empty="No invoices yet" rowKey={(r) => r.id} onRow={(r) => go({ inv: r.id })} />
                </FinBox>
              </>
            )}
            {data.tab === "payments" &&
              (data.perms.paymentRead ? (
                <FinBox title={`${t("Payments for Shipment")} ${S.code}`} pad={14}>
                  <Table dense rows={payments} cols={payCols} empty="No payments yet" rowKey={(r) => r.id} />
                </FinBox>
              ) : (
                <FinBox>
                  <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>⛔ {t("No access")}</div>
                </FinBox>
              ))}
            <FinBox title={`${t("Shipment Financial Summary")} (${S.code})`} pad={14}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
                {(
                  [
                    ["Total Invoices", String(invoices.length), "ReceiptText", "var(--navy-50)", "var(--navy-700)"],
                    ["Invoice Amount", money(sumOf(invoices.map((i) => i.total))), "DollarSign", "#EAF7EF", "var(--green-600)"],
                    ["Amount Paid", money(sumOf(invoices.map((i) => i.paid))), "UsersRound", "#F3EEFC", "#7C4DCC"],
                    ["Outstanding", money(sumOf(invoices.map((i) => i.balance))), "DollarSign", "#FDEEEE", "var(--red-600)"],
                  ] as const
                ).map(([l, v, ic, bg, c]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderRadius: "var(--radius-m)", background: bg, minWidth: 0 }}>
                    <span style={{ width: 34, height: 34, borderRadius: "var(--radius-s)", background: "#fff", color: c, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                      <Icon name={ic} size={17} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t(l)}</div>
                      <div data-testid={`sum-${l}`} style={{ font: "700 17px var(--font-body)", color: "var(--text-strong)", whiteSpace: "nowrap" }}>
                        {v}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </FinBox>
          </div>
        ) : (
          <div style={{ flex: "999 1 420px" }}>
            <FinBox>
              <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>{t("No records found")}</div>
            </FinBox>
          </div>
        )}
        {data.tab === "invoices" && (
          <div style={{ flex: "1 1 280px", maxWidth: 380, minWidth: 260 }}>
            <FinBox title="Invoice Preview" pad={14}>
              {data.preview ? (
                <>
                  <InvoicePaper inv={data.preview} company={data.company} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button size="s" variant="outline" fullWidth leadingIcon={<Icon name="FileDown" size={14} />} onClick={() => window.open(`/print/invoice/${data.preview!.id}`, "_blank", "noopener")}>
                      {t("Download PDF")}
                    </Button>
                    <Button size="s" variant="ghost" fullWidth onClick={() => go({ inv: null })}>
                      {t("Close")}
                    </Button>
                  </div>
                </>
              ) : (
                <div style={{ padding: "30px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "var(--text-muted)", textAlign: "center" }}>
                  <Icon name="ReceiptText" size={38} color="var(--gray-400)" />
                  <span style={{ fontSize: 13 }}>{t("Select an invoice to view preview")}</span>
                </div>
              )}
            </FinBox>
          </div>
        )}
      </div>

      {dialog && (
        <InvoiceDialog
          target={dialog}
          onClose={() => setDialog(null)}
          onSaved={(id) => {
            setDialog(null);
            go({ inv: id });
          }}
        />
      )}
      {delInv && (
        <Dialog
          open
          title={t("Delete Invoice")}
          onClose={() => setDelInv(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDelInv(null)}>
                {t("Cancel")}
              </Button>
              <Button
                disabled={busy}
                style={{ background: "var(--red-600)", borderColor: "var(--red-600)" }}
                onClick={() =>
                  start(async () => {
                    const r = await deleteInvoiceAction(delInv.id);
                    after(r, () => toast({ tone: "success", title: "Invoice deleted", message: delInv.number }));
                    setDelInv(null);
                    if (r.ok) go({ inv: null });
                  })
                }
              >
                {t("Delete")}
              </Button>
            </>
          }
        >
          <div style={{ fontSize: 14, color: "var(--text-body)" }}>
            {t("Are you sure you want to delete invoice")} <b>{delInv.number}</b>?
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{t("The invoice is kept as Void for the audit trail.")}</div>
          </div>
        </Dialog>
      )}
      {pay && S && <PaymentDialog shipmentCode={S.code} invoices={invoices} banks={data.banks} editing={pay.editing} onClose={() => { setPay(null); router.refresh(); }} />}
      {delPay && (
        <Dialog
          open
          title={t("Delete Payment")}
          onClose={() => setDelPay(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDelPay(null)}>
                {t("Cancel")}
              </Button>
              <Button
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    const r = await deletePaymentAction(delPay.id);
                    after(r, () => toast({ tone: "success", title: "Payment deleted", message: `${money(delPay.amount)} · ${delPay.customerName}` }));
                    setDelPay(null);
                    router.refresh();
                  })
                }
              >
                {t("Delete")}
              </Button>
            </>
          }
        >
          <div style={{ fontSize: 14, color: "var(--text-body)" }}>
            {t("Are you sure you want to delete this payment?")} <b>{money(delPay.amount)}</b> · {delPay.customerName}
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{t("The payment and its receipt are kept as reversed for the audit trail.")}</div>
          </div>
        </Dialog>
      )}
      {receipt && (
        <Dialog
          open
          width={460}
          title={t("Payment Receipt")}
          onClose={() => setReceipt(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setReceipt(null)}>
                {t("Close")}
              </Button>
              <Button leadingIcon={<Icon name="FileDown" size={16} />} onClick={() => window.open(`/print/receipt/${receipt.paymentId}`, "_blank", "noopener")}>
                {t("Download PDF")}
              </Button>
            </>
          }
        >
          <ReceiptPaper r={receipt} />
        </Dialog>
      )}
    </>
  );
}

// ------------------------------------------------------------------ statement

function StatementTab({ data, go }: { data: FinanceData; go: Go }) {
  const t = useT();
  const [sq, setSq] = useState(data.sq ?? "");
  if (!data.perms.paymentRead || !data.statement) {
    return (
      <FinBox>
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>⛔ {t("No access")}</div>
      </FinBox>
    );
  }
  const st = data.statement;
  const cols: DataColumn<Statement["rows"][number]>[] = [
    { key: "d", label: "Date", render: (r) => fdate(r.date) },
    { key: "k", label: "Type", render: (r) => (r.kind === "INVOICE" ? <Badge tone="info">{t("Invoice")}</Badge> : <Badge tone="success">{t("Payment")}</Badge>) },
    { key: "c", label: "Customer", render: (r) => r.customerName },
    { key: "s", label: "Shipment", mono: true, render: (r) => r.shipmentCode },
    { key: "n", label: "Invoice No.", mono: true, strong: true, render: (r) => r.docNo },
    {
      key: "x",
      label: "Description",
      render: (r) => (r.kind === "INVOICE" ? `${t("Invoice")} · ${t(r.mode === "AIR" ? "Air Freight" : "Sea Freight")}` : `${t("Payment")} · ${r.bank ? t(r.bank) : "-"} · ${r.receiptNo ?? ""}`),
    },
    { key: "db", label: "Debit", align: "right", render: (r) => (Number(r.debit) ? money(r.debit) : "-") },
    { key: "cr", label: "Credit", align: "right", render: (r) => (Number(r.credit) ? <span style={{ color: "var(--green-600)" }}>{money(r.credit)}</span> : "-") },
    { key: "b", label: "Balance", align: "right", strong: true, render: (r) => money(r.balance) },
  ];
  const printUrl = `/print/statement?${new URLSearchParams({ ...(data.statementCustomer ? { cust: data.statementCustomer } : {}), ...(data.sq ? { sq: data.sq } : {}) })}`;
  return (
    <>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", justifyContent: "space-between" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, width: 320, maxWidth: "100%" }}>
          <span style={{ font: "600 13px var(--font-body)", color: "var(--text-strong)" }}>{t("Customer")}</span>
          <select
            data-testid="statement-customer"
            value={data.statementCustomer}
            onChange={(e) => go({ cust: e.target.value })}
            style={{ height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-s)", background: "#fff", font: "400 14px var(--font-body)" }}
          >
            <option value="">{t("All Customers")}</option>
            {(data.statementCustomers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.ref} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go({ sq });
            }}
          >
            <SearchBox value={sq} onChange={setSq} placeholder="Search invoice, bank, reference..." style={{ width: 260, maxWidth: "100%" }} />
          </form>
          <Button variant="outline" leadingIcon={<Icon name="FileDown" size={16} />} onClick={() => window.open(printUrl, "_blank", "noopener")}>
            {t("Download Statement PDF")}
          </Button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        <Stat compact label="Transactions" value={String(st.rows.length)} />
        <Stat compact label="Total Invoiced" value={money(st.totalInvoiced)} />
        <Stat compact tone="green" label="Total Paid" value={money(st.totalPaid)} />
        <Stat compact tone="red" label="Balance Due" value={money(st.balanceDue)} />
      </div>
      <FinBox title="All money transactions" pad={0}>
        <Table rows={st.rows} cols={cols} empty="No records found" />
        {st.truncated && <div style={{ padding: "0 14px 14px", fontSize: 12, color: "var(--status-warning)" }}>{t("Showing the first 5,000 movements. Filter by customer to see the rest.")}</div>}
      </FinBox>
    </>
  );
}

// ------------------------------------------------------------------ history

function HistoryTab({ data, go }: { data: FinanceData; go: Go }) {
  const t = useT();
  const [hq, setHq] = useState(data.hq ?? "");
  const extra = data.extra ?? [];
  const revisions = data.revisions ?? [];
  const sub = data.hsub ?? "changes";
  const fmt = (field: string, v: string) => (/\(USD\)$|^Demurrage$/.test(field) && v !== "-" ? money(v) : v === "VOID" ? t("Void") : v);
  const viewInvoice = (shipmentId: string | null, mode: "AIR" | "SEA", invoiceId: string) => go({ tab: "invoices", mode, ship: shipmentId, inv: invoiceId, hq: null, hsub: null });

  const revCols: DataColumn<RevisionRow>[] = [
    { key: "d", label: "Date", render: (r) => `${fdate(r.createdAt)} ${r.createdAt.slice(11, 16)}` },
    { key: "n", label: "Invoice No.", mono: true, strong: true, render: (r) => r.invoiceNo },
    { key: "c", label: "Customer", render: (r) => r.customerName },
    { key: "s", label: "Shipment", mono: true, render: (r) => r.shipmentCode },
    {
      key: "f",
      label: "Change",
      render: (r) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Badge tone={Number(r.before) === 0 && r.before !== "-" ? "success" : "info"}>{t(Number(r.before) === 0 && r.before !== "-" ? "Added" : "Changed")}</Badge>
          {t(r.field)}
        </span>
      ),
    },
    { key: "b", label: "Before", render: (r) => <span style={{ color: "var(--text-muted)", textDecoration: "line-through" }}>{fmt(r.field, r.before)}</span> },
    { key: "a", label: "After", strong: true, render: (r) => fmt(r.field, r.after) },
    { key: "by", label: "Changed by", render: (r) => r.changedBy },
    { key: "x", label: "Action", render: (r) => <Button size="s" variant="outline" onClick={() => viewInvoice(null, r.mode, r.invoiceId)}>{t("View Invoice")}</Button> },
  ];
  const unit = (m: "AIR" | "SEA") => (m === "AIR" ? "kg" : "m³");
  const exCols: DataColumn<ExtraMeasureRow>[] = [
    { key: "n", label: "Invoice No.", mono: true, strong: true, render: (r) => r.invoiceNo },
    { key: "c", label: "Customer", render: (r) => r.customerName },
    { key: "r", label: "Reference", mono: true, render: (r) => r.customerRef },
    { key: "s", label: "Shipment", mono: true, render: (r) => r.shipmentCode },
    { key: "ac", label: "Actual", align: "right", render: (r) => `${num(r.actual, r.mode === "AIR" ? 1 : 2)} ${unit(r.mode)}` },
    { key: "bi", label: "Billed", align: "right", render: (r) => `${num(r.billed, r.mode === "AIR" ? 1 : 2)} ${unit(r.mode)}` },
    { key: "ad", label: "Added", align: "right", render: (r) => <b style={{ color: "#A15C00" }}>+{num(r.added, r.mode === "AIR" ? 1 : 2)} {unit(r.mode)}</b> },
    { key: "di", label: "Discount", align: "right", render: (r) => (Number(r.discount) ? <span style={{ color: "var(--red-600)" }}>−{money(r.discount)}</span> : "-") },
    { key: "e", label: "Extra earned", align: "right", strong: true, render: (r) => <span style={{ color: Number(r.extraEarned) >= 0 ? "var(--green-600)" : "var(--red-600)" }}>{money(r.extraEarned)}</span> },
    { key: "x", label: "Action", render: (r) => <Button size="s" variant="outline" onClick={() => viewInvoice(r.shipmentId, r.mode, r.invoiceId)}>{t("View Invoice")}</Button> },
  ];

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(
          [
            ["changes", "Invoice changes", "History"],
            ["extra", "KG / CBM added", "Scale"],
          ] as const
        ).map(([k, l, ic]) => {
          const on = sub === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => go({ hsub: k })}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 40, padding: "0 16px", borderRadius: "var(--radius-s)", border: "1px solid " + (on ? "var(--navy-700)" : "var(--border-default)"), background: on ? "var(--navy-700)" : "#fff", color: on ? "#fff" : "var(--text-strong)", font: "600 14px var(--font-body)", cursor: "pointer" }}
            >
              <Icon name={ic} size={16} />
              {t(l)}
              {k === "extra" && extra.length > 0 && (
                <span style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: 10, background: on ? "#fff" : "var(--orange-500)", color: on ? "var(--navy-700)" : "#fff", font: "700 11px/20px var(--font-body)" }}>{extra.length}</span>
              )}
            </button>
          );
        })}
      </div>
      {sub === "changes" ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(150px,1fr))", gap: 12 }}>
              <Stat compact label="Invoices changed" value={String(new Set(revisions.map((r) => r.invoiceId)).size)} tone="orange" />
              <Stat compact label="Total changes" value={String(revisions.length)} />
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                go({ hq });
              }}
            >
              <SearchBox value={hq} onChange={setHq} placeholder="Search invoice, customer..." style={{ width: 280, maxWidth: "100%" }} />
            </form>
          </div>
          <FinBox title="Invoices with changes" pad={0}>
            <Table rows={revisions} cols={revCols} empty="No changes yet" rowKey={(r) => r.id} />
          </FinBox>
        </>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
            <Stat compact tone="orange" label="Invoices with extra" value={String(extra.length)} />
            <Stat compact label="Extra KG" value={`${num(sumOf(extra.filter((x) => x.mode === "AIR").map((x) => x.added)), 1)} kg`} />
            <Stat compact label="Extra CBM" value={`${num(sumOf(extra.filter((x) => x.mode !== "AIR").map((x) => x.added)), 2)} m³`} />
            <Stat compact tone="red" label="Total Discount" value={money(sumOf(extra.map((x) => x.discount)))} />
            <Stat compact tone="green" label="Extra earned" value={money(sumOf(extra.map((x) => x.extraEarned)))} />
          </div>
          <FinBox title="Invoices where KG / CBM was added" pad={0}>
            <Table rows={extra} cols={exCols} empty="No invoices with extra KG / CBM" rowKey={(r) => r.invoiceId} />
          </FinBox>
        </>
      )}
    </>
  );
}

// ------------------------------------------------------------------ reminders

function RemindersTab({ data, go }: { data: FinanceData; go: Go }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const cfg = data.demurrageCfg ?? { freeDays: 3, ratePerDay: "5" };
  const [free, setFree] = useState(String(cfg.freeDays));
  const [rate, setRate] = useState(cfg.ratePerDay);
  const [approve, setApprove] = useState<DemurrageRow | null>(null);
  const due = data.due ?? [];
  const dm = data.demurrage ?? [];
  const recent = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() < 24 * 3600 * 1000;

  const act = (p: Promise<FinanceResult<unknown>>, ok: string, msg?: string) =>
    start(async () => {
      const r = await p;
      if (!r.ok) toast({ tone: "danger", title: r.error });
      else toast({ tone: "success", title: ok, message: r.message ?? msg });
      router.refresh();
    });
  const dmInput = (r: DemurrageRow) => ({ shipmentId: r.shipmentId, customerId: r.customerId, freeDays: cfg.freeDays, ratePerDay: cfg.ratePerDay });

  const dueCols: DataColumn<DueInvoiceRow>[] = [
    { key: "n", label: "Invoice No.", mono: true, strong: true, render: (r) => r.invoiceNo },
    { key: "c", label: "Customer", render: (r) => r.customerName },
    { key: "s", label: "Shipment", mono: true, render: (r) => r.shipmentCode },
    { key: "d", label: "Invoice Date", render: (r) => fdate(r.date) },
    { key: "a", label: "Days", align: "right", render: (r) => <b style={{ color: r.ageDays > 14 ? "var(--red-600)" : r.ageDays > 7 ? "#A15C00" : "var(--text-strong)" }}>{r.ageDays}</b> },
    { key: "b", label: "Balance", align: "right", strong: true, render: (r) => money(r.balance) },
    { key: "st", label: "Status", render: (r) => <StatusBadge status={INVOICE_STATUS_LABEL[r.status]} /> },
    {
      key: "x",
      label: "Action",
      render: (r) =>
        recent(r.lastReminderAt) ? (
          <Badge tone="success">{t("Sent")}</Badge>
        ) : data.perms.invoiceWrite ? (
          <Button size="s" variant="outline" disabled={busy} leadingIcon={<Icon name="BellRing" size={14} />} onClick={() => act(sendRemindersAction([r.invoiceId]), "Reminder sent", r.customerName)}>
            {t("Send Reminder")}
          </Button>
        ) : (
          "-"
        ),
    },
  ];
  const dmCols: DataColumn<DemurrageRow>[] = [
    { key: "c", label: "Customer", render: (r) => r.customerName },
    { key: "r", label: "Reference", mono: true, render: (r) => r.customerRef },
    { key: "s", label: "Shipment", mono: true, render: (r) => r.shipmentCode },
    { key: "a", label: "Arrival", render: (r) => fdate(r.arrivedAt) },
    { key: "w", label: "Days waiting", align: "right", render: (r) => <b>{r.daysWaiting}</b> },
    {
      key: "e",
      label: "Extra days",
      align: "center",
      render: (r) =>
        data.perms.invoiceWrite ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <IconButton size="s" variant="ghost" label={t("Less")} disabled={busy || r.extraFreeDays === 0} icon={<Icon name="Minus" size={13} />} onClick={() => act(extraDaysAction(r.shipmentId, r.customerId, r.extraFreeDays - 1), "Extra days updated", r.customerName)} />
            <b style={{ minWidth: 24, textAlign: "center", color: r.extraFreeDays ? "var(--green-600)" : "var(--text-strong)" }}>{r.extraFreeDays}</b>
            <IconButton size="s" variant="ghost" label={t("More")} disabled={busy} icon={<Icon name="Plus" size={13} />} onClick={() => act(extraDaysAction(r.shipmentId, r.customerId, r.extraFreeDays + 1), "Extra days updated", r.customerName)} />
          </span>
        ) : (
          r.extraFreeDays
        ),
    },
    { key: "o", label: "Over free days", align: "right", render: (r) => (r.overFreeDays ? <b style={{ color: "var(--red-600)" }}>{r.overFreeDays}</b> : <span style={{ color: "var(--green-600)", fontWeight: 600 }}>0</span>) },
    {
      key: "f",
      label: "Demurrage",
      align: "right",
      render: (r) =>
        Number(r.charged) ? (
          <span>
            <b>{money(r.fee)}</b>
            <span style={{ display: "block", fontSize: 11, color: "var(--green-600)" }}>
              {t("Charged")}: {money(r.charged)}
            </span>
          </span>
        ) : (
          <b style={{ color: Number(r.fee) ? "var(--red-600)" : "var(--text-muted)" }}>{money(r.fee)}</b>
        ),
    },
    {
      key: "x",
      label: "Action",
      render: (r) => (
        <span style={{ display: "inline-flex", gap: 6, flexWrap: "nowrap" }}>
          {recent(r.lastWarningAt) ? (
            <Badge tone="warning">{t("Warned")}</Badge>
          ) : (
            data.perms.invoiceWrite && (
              <Button size="s" variant="outline" disabled={busy} leadingIcon={<Icon name="TriangleAlert" size={14} />} onClick={() => act(warnDemurrageAction(dmInput(r)), "Warning sent", r.customerName)}>
                {t("Send Warning")}
              </Button>
            )
          )}
          {data.perms.invoiceManage && Number(r.fee) > Number(r.charged) && r.invoiceId && (
            <Button size="s" disabled={busy} leadingIcon={<Icon name="Check" size={14} />} onClick={() => setApprove(r)}>
              {t("Approve")}
            </Button>
          )}
          {data.perms.invoiceWrite && (
            <Button size="s" variant="ghost" disabled={busy} onClick={() => act(collectedAction(r.shipmentId, r.customerId), "Marked as collected", r.customerName)}>
              {t("Collected")}
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <FinBox title="Payment reminders" pad={0}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "0 14px", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {due.length} {t("invoices with unpaid balance")} · {money(sumOf(due.map((i) => i.balance)))}
          </span>
          {data.perms.invoiceWrite && (
            <Button size="s" leadingIcon={<Icon name="Send" size={14} />} disabled={!due.length || busy} onClick={() => act(sendRemindersAction(due.map((i) => i.invoiceId)), "Reminder sent", `${due.length} ${t("customers")}`)}>
              {t("Send to all")}
            </Button>
          )}
        </div>
        <Table rows={due} cols={dueCols} empty="No unpaid invoices" rowKey={(r) => r.invoiceId} />
      </FinBox>
      <FinBox title="Demurrage (cargo not collected)" pad={0}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go({ free, rate });
          }}
          style={{ display: "flex", alignItems: "flex-end", gap: 12, padding: "0 14px", flexWrap: "wrap" }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6, width: 130 }}>
            <span style={{ font: "600 13px var(--font-body)" }}>{t("Free days")}</span>
            <input type="number" min="0" max="365" value={free} onChange={(e) => setFree(e.target.value)} style={{ height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: 6 }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, width: 150 }}>
            <span style={{ font: "600 13px var(--font-body)" }}>{t("Rate per day (USD)")}</span>
            <input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} style={{ height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: 6 }} />
          </label>
          <Button type="submit" variant="outline" size="s">
            {t("Apply")}
          </Button>
          <span style={{ flex: 1, minWidth: 220, fontSize: 12, color: "var(--text-muted)" }}>{t("Customers only get a warning. Money is added to the invoice only after admin approval.")}</span>
        </form>
        <Table rows={dm} cols={dmCols} empty="No uncollected cargo" rowKey={(r) => r.shipmentId + r.customerId} />
      </FinBox>
      {approve && (
        <Dialog
          open
          title={t("Approve demurrage")}
          onClose={() => setApprove(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setApprove(null)}>
                {t("Cancel")}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  act(approveDemurrageAction(dmInput(approve)), "Demurrage added to invoice");
                  setApprove(null);
                }}
              >
                {t("Approve & add to invoice")}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14, color: "var(--text-body)" }}>
            <div>
              <b>{approve.customerName}</b> · {approve.shipmentCode} · {approve.invoiceNo}
            </div>
            <div style={{ padding: 12, background: "var(--surface-sunken)", borderRadius: 8 }}>
              {approve.overFreeDays} {t("days")} × {money(cfg.ratePerDay)} = <b style={{ color: "var(--red-600)" }}>{money(sumOf([approve.fee]) - sumOf([approve.charged]))}</b>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("This amount will be added to the invoice and the customer will be notified.")}</div>
          </div>
        </Dialog>
      )}
    </>
  );
}
