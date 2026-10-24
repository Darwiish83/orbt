"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { DataTable, DateField, SearchBox, Stat, type DataColumn } from "@/ui/kit";
import { Badge, Button, Dialog, Icon, Input } from "@/ui/primitives";
import { fdate, money, num } from "@/ui/format";
import type {
  countryBalances,
  incomeAndOut,
  listCommissions,
  listDebts,
  listOpening,
  listReceipts,
  listShipmentCosts,
  overview,
  partnersProfit,
  profitAndExpenses,
} from "@/modules/accounting/service";
import { FinBox, ToastHost, useToast } from "@/components/admin/ui";
import { closePeriodAction, lockAction, returnDebtAction } from "./actions";
import { CostsTab } from "./CostsTab";
import { IncomeTab, OutDialog, type OutOptions } from "./IncomeTab";
import { OpeningBalance } from "./OpeningBalance";

export type AccTab = "costs" | "income" | "debts" | "partners" | "profit" | "commissions" | "receipts" | "overview";
type A<F extends (...a: never[]) => unknown> = Awaited<ReturnType<F>>;

export interface AccountingData {
  tab: AccTab;
  mode: "AIR" | "SEA";
  scope: { year: number; country: string };
  perms: { write: boolean; manage: boolean; origin: boolean; mgq: boolean };
  costs?: A<typeof listShipmentCosts>;
  income?: A<typeof incomeAndOut>;
  balances?: A<typeof countryBalances>;
  options?: OutOptions;
  outFilter?: string;
  debts?: A<typeof listDebts>;
  partners?: A<typeof partnersProfit>;
  profit?: A<typeof profitAndExpenses>;
  commissions?: A<typeof listCommissions>;
  receipts?: A<typeof listReceipts>;
  receiptFilter?: { kind: string; q: string };
  overview?: A<typeof overview>;
  opening?: A<typeof listOpening>;
}

const TABS: [AccTab, string][] = [
  ["costs", "Shipment cost payment"],
  ["income", "Income & Out"],
  ["debts", "Debts"],
  ["partners", "Partners profit"],
  ["profit", "Profit & Expenses"],
  ["commissions", "Commissions"],
  ["receipts", "Receipts"],
  ["overview", "Overview · Period closing"],
];

function Table<R>(p: { cols: DataColumn<R>[]; rows: R[]; empty?: string; rowKey?: (r: R, i: number) => string }) {
  const T = DataTable as unknown as (q: typeof p) => ReactNode;
  return <T {...p} />;
}
const statusTone = (s: string) => (s === "Paid" ? "success" : s === "Partial" ? "warning" : "danger");

export function AccountingView({ data }: { data: AccountingData }) {
  return (
    <ToastHost>
      <Inner data={data} />
    </ToastHost>
  );
}

function Inner({ data }: { data: AccountingData }) {
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: nav ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, font: "700 26px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{t("Accounting")}</h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
            {t(data.scope.country)} · {t("Business year")} {data.scope.year}
          </div>
        </div>
        <Button
          variant="outline"
          leadingIcon={<Icon name="Lock" size={16} />}
          onClick={async () => {
            await lockAction();
            router.refresh();
          }}
          data-testid="acc-lock"
        >
          {t("Lock")}
        </Button>
      </div>
      <div role="tablist" style={{ display: "flex", background: "#fff", border: "1px solid var(--border-default)", borderRadius: "var(--radius-l)", overflowX: "auto" }}>
        {TABS.map(([k, l]) => {
          const on = data.tab === k;
          return (
            <button key={k} role="tab" aria-selected={on} onClick={() => go({ tab: k, out: null, kind: null, q: null })} style={{ flex: "1 0 auto", minWidth: 120, height: 48, padding: "0 12px", border: 0, borderBottom: "3px solid " + (on ? "var(--navy-700)" : "transparent"), background: "transparent", cursor: "pointer", font: `${on ? 700 : 600} 13px var(--font-body)`, color: on ? "var(--navy-700)" : "var(--text-strong)", whiteSpace: "nowrap" }}>
              {t(l)}
            </button>
          );
        })}
      </div>
      {data.tab === "costs" && data.costs && <CostsTab costs={data.costs} mode={data.mode} go={go} />}
      {data.tab === "income" && data.income && data.balances && data.options && (
        <IncomeTab io={data.income} balances={data.balances} options={data.options} filter={data.outFilter ?? ""} canWrite={data.perms.write} go={go} country={data.scope.country} />
      )}
      {data.tab === "debts" && data.debts && data.options && <DebtsTab debts={data.debts} options={data.options} canWrite={data.perms.write} />}
      {data.tab === "partners" && data.partners && <PartnersTab p={data.partners} />}
      {data.tab === "profit" && data.profit && <ProfitTab p={data.profit} />}
      {data.tab === "commissions" && data.commissions && <CommissionsTab c={data.commissions} />}
      {data.tab === "receipts" && data.receipts && <ReceiptsTab rows={data.receipts} filter={data.receiptFilter!} go={go} />}
      {data.tab === "overview" && data.overview && data.opening && (
        <>
          <OpeningBalance o={data.opening} year={data.scope.year} canManage={data.perms.manage} />
          <OverviewTab o={data.overview} canManage={data.perms.manage} year={data.scope.year} />
        </>
      )}
    </div>
  );
}

function DebtsTab({ debts, options, canWrite }: { debts: A<typeof listDebts>; options: OutOptions; canWrite: boolean }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [ret, setRet] = useState<A<typeof listDebts>["rows"][number] | null>(null);
  const [lend, setLend] = useState(false);
  const [v, setV] = useState({ amount: "", bankId: options.banks[0]?.id ?? "", date: new Date().toISOString().slice(0, 10) });
  const [pending, start] = useTransition();
  const cols: DataColumn<A<typeof listDebts>["rows"][number]>[] = [
    { key: "p", label: "Person / company", strong: true, render: (r) => r.person },
    { key: "d", label: "Date", render: (r) => (r.fromYear ? <Badge tone="neutral">{`${t("From")} ${r.fromYear}`}</Badge> : fdate(r.date)) },
    { key: "l", label: "Lent", align: "right", render: (r) => money(r.lent) },
    { key: "r", label: "Returned", align: "right", render: (r) => <span style={{ color: "var(--green-600)" }}>{money(r.returned)}</span> },
    { key: "o", label: "Still owed", align: "right", strong: true, render: (r) => <span style={{ color: Number(r.owed) ? "var(--red-600)" : undefined }}>{money(r.owed)}</span> },
    { key: "s", label: "Status", render: (r) => <Badge tone={statusTone(r.status)}>{t(r.status)}</Badge> },
    {
      key: "x",
      label: "",
      align: "right",
      render: (r) =>
        canWrite && Number(r.owed) > 0 ? (
          <Button size="s" variant="outline" onClick={() => { setRet(r); setV((o) => ({ ...o, amount: r.owed })); }}>
            {t("Money returned")}
          </Button>
        ) : null,
    },
  ];
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        <Stat icon="HandCoins" label="Total lent" value={money(debts.totals.lent)} />
        <Stat icon="Banknote" tone="green" label="Returned" value={money(debts.totals.returned)} />
        <Stat icon="CircleAlert" tone="red" label="Still owed" value={money(debts.totals.owed)} />
      </div>
      <FinBox
        title="Debts"
        pad={0}
        actions={
          canWrite && (
            <Button size="s" leadingIcon={<Icon name="Plus" size={14} />} onClick={() => setLend(true)}>
              {t("Add Debt")}
            </Button>
          )
        }
      >
        <Table rows={debts.rows} cols={cols} rowKey={(r) => r.id} empty="No records found" />
      </FinBox>
      {lend && <OutDialog options={options} preset={{ category: "DEBT" }} onClose={() => setLend(false)} onDone={() => { setLend(false); router.refresh(); }} />}
      {ret && (
        <Dialog
          open
          title={`${t("Money returned")} · ${ret.person}`}
          onClose={() => setRet(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRet(null)}>
                {t("Cancel")}
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await returnDebtAction(ret.id, v.amount, v.bankId, v.date);
                    if (!r.ok) return toast({ tone: "danger", title: r.error });
                    toast({ tone: "success", title: "Saved", message: r.data?.receiptNo });
                    setRet(null);
                    router.refresh();
                  })
                }
              >
                {t("Save")}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 13 }}>
              {t("Still owed")}: <b>{money(ret.owed)}</b>
            </div>
            <Input label={`${t("Amount")} (USD)`} type="number" min="0" step="0.01" value={v.amount} onChange={(e) => setV((o) => ({ ...o, amount: e.target.value }))} />
            <label style={{ display: "flex", flexDirection: "column", gap: 6, font: "600 13px var(--font-body)" }}>
              {t("Bank")}
              <select value={v.bankId} onChange={(e) => setV((o) => ({ ...o, bankId: e.target.value }))} style={{ height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: 6 }}>
                {options.banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {t(b.name)}
                  </option>
                ))}
              </select>
            </label>
            <DateField label="Date" value={v.date} onChange={(d) => setV((o) => ({ ...o, date: d }))} />
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("Money returned is added to Income automatically.")}</div>
          </div>
        </Dialog>
      )}
    </>
  );
}

function PartnersTab({ p }: { p: A<typeof partnersProfit> }) {
  const t = useT();
  if (!p.applies) {
    return (
      <FinBox>
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>{t("This country's profit is 100% Orbit Cargo; there are no partners.")}</div>
      </FinBox>
    );
  }
  const card = (name: string, x: typeof p.somaliTransport) => (
    <FinBox title={name}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        <Stat compact label="Earned" value={money(x.earned)} />
        <Stat compact tone="green" label="Paid" value={money(x.paid)} />
        <Stat compact tone="orange" label="What we hold" value={money(x.hold)} />
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("A share is earned only once the shipment's cost has been collected. Payouts are made with Add Out → Profit payout.")}</div>
      {x.payouts.map((o) => (
        <div key={o.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderTop: "1px solid var(--border-default)", paddingTop: 6 }}>
          <span>
            {fdate(o.date)} · <span style={{ fontFamily: "var(--font-mono)" }}>{o.receiptNo}</span>
          </span>
          <b>{money(o.amount)}</b>
        </div>
      ))}
    </FinBox>
  );
  const cols: DataColumn<A<typeof partnersProfit>["perShipment"][number]>[] = [
    { key: "c", label: "Shipment", mono: true, strong: true, render: (r) => r.code },
    { key: "p", label: "Profit", align: "right", render: (r) => money(r.profit) },
    { key: "s", label: "Split", align: "right", render: (r) => r.split.join(" / ") + " %" },
    { key: "st", label: "Somali Transport", align: "right", render: (r) => money(r.somaliTransport) },
    { key: "m", label: "Mahad", align: "right", render: (r) => money(r.mahad) },
  ];
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
        {card(t("Somali Transport"), p.somaliTransport)}
        {card(t("Mahad"), p.mahad)}
      </div>
      <FinBox title="Per shipment" pad={0}>
        <Table rows={p.perShipment} cols={cols} rowKey={(r) => r.code + r.mode} empty="No records found" />
      </FinBox>
    </>
  );
}

function ProfitTab({ p }: { p: A<typeof profitAndExpenses> }) {
  const cols: DataColumn<A<typeof profitAndExpenses>["perShipment"][number]>[] = [
    { key: "c", label: "Shipment", mono: true, strong: true, render: (r) => r.code },
    { key: "i", label: "Total income", align: "right", render: (r) => money(r.income) },
    { key: "k", label: "Total shipment cost", align: "right", render: (r) => money(r.cost) },
    { key: "p", label: "Profit", align: "right", render: (r) => money(r.profit) },
    { key: "o", label: "Orbit share", align: "right", strong: true, render: (r) => `${money(r.orbit)} (${r.orbitShare}%)` },
  ];
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        <Stat icon="TrendingUp" label="Orbit profit" value={money(p.orbit)} />
        <Stat icon="Receipt" tone="red" label="Expenses" value={money(p.expenses)} />
        <Stat icon="Wallet" tone="green" label="Net profit" value={money(p.net)} />
      </div>
      <FinBox title="Orbit profit per shipment" pad={0}>
        <Table rows={p.perShipment} cols={cols} rowKey={(r) => r.code + r.mode} empty="No records found" />
      </FinBox>
      <FinBox title="Expenses" pad={0}>
        <Table
          rows={p.expenseRows}
          rowKey={(r) => r.id}
          empty="No records found"
          cols={[
            { key: "d", label: "Date", render: (r) => fdate(r.date) },
            { key: "s", label: "Sent to", render: (r) => r.sentTo ?? "—" },
            { key: "n", label: "Note", render: (r) => r.note ?? "—" },
            { key: "r", label: "Receipt", mono: true, render: (r) => r.receiptNo },
            { key: "a", label: "Amount", align: "right", strong: true, render: (r) => money(r.amount) },
          ]}
        />
      </FinBox>
    </>
  );
}

function CommissionsTab({ c }: { c: A<typeof listCommissions> }) {
  const t = useT();
  const cols: DataColumn<A<typeof listCommissions>["rows"][number]>[] = [
    { key: "a", label: "Agent", strong: true, render: (r) => r.agent },
    { key: "s", label: "Shipment", mono: true, render: (r) => r.shipment },
    { key: "c", label: "Customer", render: (r) => r.customer },
    { key: "q", label: "KG", align: "right", render: (r) => num(r.quantity, 1) },
    { key: "r", label: "Commission rate", align: "right", render: (r) => money(r.rate) },
    { key: "m", label: "Amount", align: "right", render: (r) => money(r.amount) },
    { key: "p", label: "Paid", align: "right", render: (r) => money(r.paid) },
    { key: "st", label: "Status", render: (r) => <Badge tone={statusTone(r.status)}>{t(r.status)}</Badge> },
    { key: "y", label: "Payable", render: (r) => (r.payable ? <Badge tone="success">{t("Yes")}</Badge> : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("After the customer pays in full")}</span>) },
    { key: "h", label: "History", render: (r) => r.history.map((h) => `${fdate(h.date)} ${money(h.amount)}`).join(", ") || "—" },
  ];
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        <Stat icon="Handshake" label="Total commission" value={money(c.totals.amount)} />
        <Stat icon="Banknote" tone="green" label="Paid" value={money(c.totals.paid)} />
        <Stat icon="CircleAlert" tone="orange" label="Payable now" value={money(c.totals.payable)} />
      </div>
      <FinBox title="Commissions" pad={0}>
        <Table rows={c.rows} cols={cols} rowKey={(r) => r.invoiceId} empty="No records found" />
      </FinBox>
    </>
  );
}

const RKINDS: [string, string][] = [
  ["", "All"],
  ["PAYMENT", "Payment"],
  ["COMMISSION", "Commission"],
  ["EXPENSE", "Expense"],
  ["SHIPMENT_COST", "Shipment cost"],
  ["TRANSFER", "Transfer"],
  ["DEBT", "Debt"],
  ["DEBT_RETURN", "Debt returned"],
  ["OTHER", "Profit payout"],
];

function ReceiptsTab({ rows, filter, go }: { rows: A<typeof listReceipts>; filter: { kind: string; q: string }; go: (p: Record<string, string | null>) => void }) {
  const t = useT();
  const [q, setQ] = useState(filter.q);
  const cols: DataColumn<A<typeof listReceipts>[number]>[] = [
    { key: "n", label: "Receipt", mono: true, strong: true, render: (r) => r.number },
    { key: "d", label: "Date", render: (r) => fdate(r.date) },
    { key: "k", label: "Type", render: (r) => <Badge tone={r.direction === "IN" ? "success" : "warning"}>{t(r.kindLabel)}</Badge> },
    { key: "p", label: "Customer / recipient", render: (r) => r.party },
    { key: "b", label: "Bank", render: (r) => (r.bank ? t(r.bank) : "—") },
    { key: "a", label: "Amount", align: "right", strong: true, render: (r) => <span style={{ color: r.direction === "IN" ? "var(--green-600)" : "var(--red-600)", textDecoration: r.reversed ? "line-through" : undefined }}>{r.direction === "IN" ? "" : "−"}{money(r.amount)}</span> },
    { key: "x", label: "", align: "right", render: (r) => <Button size="s" variant="outline" onClick={() => window.open(`/print/accounting-receipt/${r.number}`, "_blank", "noopener")}>{t("Download PDF")}</Button> },
  ];
  return (
    <FinBox title="Receipts" pad={0}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "0 14px" }}>
        {RKINDS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => go({ kind: k || null })} style={{ height: 32, padding: "0 12px", borderRadius: 16, border: "1px solid " + (filter.kind === k ? "var(--navy-700)" : "var(--border-default)"), background: filter.kind === k ? "var(--navy-700)" : "#fff", color: filter.kind === k ? "#fff" : "var(--text-strong)", font: "600 12px var(--font-body)", cursor: "pointer" }}>
            {t(l)}
          </button>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go({ q });
          }}
        >
          <SearchBox value={q} onChange={setQ} style={{ width: 240, maxWidth: "100%" }} />
        </form>
      </div>
      <Table rows={rows} cols={cols} rowKey={(r) => r.id} empty="No records found" />
    </FinBox>
  );
}

function OverviewTab({ o, canManage, year }: { o: A<typeof overview>; canManage: boolean; year: number }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [ask, setAsk] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const LABEL: Record<string, string> = { H1: "January – June", H2: "July – December", YEAR: "Full year" };
  const range = (p: (typeof o.periods)[number]) => `${fdate(p.from)} – ${fdate(p.to)}`;
  const yearClosed = !!o.periods.find((p) => p.period === "YEAR")?.closedAt;
  return (
    <FinBox title="Period closing" pad={0}>
      <div style={{ padding: "0 14px", fontSize: 13, color: "var(--text-muted)" }}>
        {t("Closing a period locks everything dated in it. Closing the full year also opens the next year with this year's balance.")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 12, padding: "0 14px 14px" }}>
        {o.periods.map((p, i) => {
          const closed = !!p.closedAt || (p.period !== "YEAR" && yearClosed);
          const net = Number(p.net);
          const isYear = p.period === "YEAR";
          return (
            <div
              key={p.period}
              data-testid={`period-${p.period}`}
              style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 12, border: `1.5px solid ${closed ? "var(--border-default)" : isYear ? "var(--navy-700)" : "var(--border-strong)"}`, background: closed ? "var(--surface-sunken)" : "#fff" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", background: closed ? "var(--text-muted)" : "var(--navy-700)", color: "#fff", font: "700 12px var(--font-body)" }}>{i + 1}</span>
                  <b style={{ font: "700 16px var(--font-display)" }}>{t(LABEL[p.period]!)}</b>
                </div>
                <span style={{ padding: "3px 10px", borderRadius: 12, font: "700 11px var(--font-body)", background: closed ? "#E5E7EB" : "#EAF7EF", color: closed ? "var(--text-strong)" : "var(--green-600)" }}>{closed ? `🔒 ${t("Closed")}` : `● ${t("Open")}`}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{range(p)}</div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("Net Profit")}</div>
                <div style={{ font: "800 24px var(--font-display)", color: net < 0 ? "var(--red-600)" : net > 0 ? "var(--green-600)" : "var(--text-strong)" }}>{money(p.net)}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 5, fontSize: 13 }}>
                {(
                  [
                    ["Revenue", p.revenue, false],
                    ["Shipment cost", p.shipmentCost, true],
                    ["Commission", p.commission, true],
                    ["Expenses", p.expenses, true],
                    ["Collected", p.collected, false],
                    ["Outstanding", p.outstanding, false],
                  ] as const
                ).map(([l, v, minus]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 6, borderBottom: "1px dashed var(--border-default)", paddingBottom: 3 }}>
                    <span style={{ color: "var(--text-muted)" }}>{t(l)}</span>
                    <b>{minus && Number(v) ? `−${money(v)}` : money(v)}</b>
                  </div>
                ))}
              </div>
              {isYear && (
                <div style={{ fontSize: 12, padding: "8px 10px", borderRadius: 8, background: "#F0F4FA", color: "var(--navy-700)" }}>
                  {closed ? `✓ ${t("Balance carried to")} ${year + 1}` : `→ ${t("Opens")} ${year + 1} ${t("with this year's balance, banks, parts and debts")}`}
                </div>
              )}
              <div style={{ marginTop: "auto" }}>
                {closed ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{p.closedAt ? `${t("Closed")} ${fdate(p.closedAt)}` : t("Closed with the full year")}</div>
                ) : canManage ? (
                  <Button size="s" variant={isYear ? "primary" : "outline"} leadingIcon={<Icon name="Lock" size={14} />} onClick={() => setAsk(p.period)} data-testid={`close-${p.period}`}>
                    {t("Close")} {t(LABEL[p.period]!)}
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {ask && (
        <Dialog
          open
          title={`${t("Close period")} · ${t(LABEL[ask]!)} ${year}`}
          onClose={() => setAsk(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setAsk(null)}>
                {t("Cancel")}
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await closePeriodAction(ask);
                    toast(r.ok ? { tone: "success", title: "Period closed" } : { tone: "danger", title: r.error });
                    setAsk(null);
                    router.refresh();
                  })
                }
              >
                {t("Close period")}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
            <div>{t("After closing, nothing dated in this period can be changed in Finance or Accounting.")}</div>
            <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 4 }}>
              <li>{t("No new or reversed payments, outs or debt returns dated in it.")}</li>
              <li>{t("The cost sheets of shipments sent in it are locked.")}</li>
              {ask !== "H2" && <li>{t("The opening balance of earlier years is locked.")}</li>}
              <li>{t("A closed period cannot be opened again.")}</li>
            </ul>
            {ask === "YEAR" && <div style={{ fontSize: 13, padding: "8px 10px", borderRadius: 8, background: "#F0F4FA", color: "var(--navy-700)" }}>{t("The closing balance is carried into next year as its opening balance.")}</div>}
          </div>
        </Dialog>
      )}
    </FinBox>
  );
}
