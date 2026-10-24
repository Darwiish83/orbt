"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { DataTable, DateField, Flag, Stat, type DataColumn } from "@/ui/kit";
import { Badge, Button, Dialog, Icon, Input } from "@/ui/primitives";
import { fdate, money } from "@/ui/format";
import type { countryBalances, incomeAndOut, outFormOptions } from "@/modules/accounting/service";
import { FinBox, RowMenu, useToast } from "@/components/admin/ui";
import { addOutAction, reverseOutAction, saveCountAction, type OutFormValues } from "./actions";

type IO = Awaited<ReturnType<typeof incomeAndOut>>;
type Balances = Awaited<ReturnType<typeof countryBalances>>;
export type OutOptions = Awaited<ReturnType<typeof outFormOptions>>;

export const CATEGORY: [string, string][] = [
  ["SHIPMENT_COST", "Shipment cost"],
  ["EXPENSE", "Expenses"],
  ["COMMISSION", "Commission"],
  ["TRANSFER", "Transfer Money"],
  ["DEBT", "Debt"],
  ["PROFIT_PAYOUT", "Profit payout"],
];
const STAGE: Record<string, string> = { ORIGIN: "Origin", TRANSIT: "Transit", ARRIVED: "Arrived" };
const PARTNER: Record<string, string> = { SOMALI_TRANSPORT: "Somali Transport", MAHAD: "Mahad" };

function Table<R>(p: { cols: DataColumn<R>[]; rows: R[]; empty?: string; rowKey?: (r: R, i: number) => string }) {
  const A = DataTable as unknown as (q: typeof p) => ReactNode;
  return <A {...p} />;
}

export function IncomeTab({ io, balances, options, filter, canWrite, go, country }: { io: IO; balances: Balances; options: OutOptions; filter: string; canWrite: boolean; go: (p: Record<string, string | null>) => void; country: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [, start] = useTransition();
  const [out, setOut] = useState(false);
  const [count, setCount] = useState(false);

  const outCols: DataColumn<IO["outs"][number]>[] = [
    { key: "d", label: "Date", render: (r) => fdate(r.date) },
    { key: "c", label: "Category", render: (r) => <Badge tone="neutral">{t(CATEGORY.find((c) => c[0] === r.category)?.[1] ?? r.category)}</Badge> },
    {
      key: "x",
      label: "Details",
      render: (r) => (
        <>
          {r.forYear && <Badge tone="warning">{`${t("For")} ${r.forYear}`}</Badge>}{" "}
          {[r.shipment && `${r.shipment}${r.stage ? ` · ${t(STAGE[r.stage] ?? "")}` : ""}`, r.reference, r.partner && t(PARTNER[r.partner] ?? ""), r.note].filter(Boolean).join(" · ") || (r.forYear ? "" : "—")}
        </>
      ),
    },
    { key: "s", label: "Sent to", render: (r) => r.sentTo ?? "—" },
    { key: "b", label: "Paid from", render: (r) => t(r.bank) },
    { key: "n", label: "Receipt", mono: true, render: (r) => r.receiptNo },
    { key: "a", label: "Amount", align: "right", strong: true, render: (r) => <span style={{ color: "var(--red-600)" }}>−{money(r.amount)}</span> },
    {
      key: "m",
      label: "",
      align: "right",
      render: (r) =>
        canWrite ? (
          <RowMenu
            items={[
              ["Receipt", () => window.open(`/print/accounting-receipt/${r.receiptNo}`, "_blank", "noopener")],
              [
                "Reverse",
                () =>
                  start(async () => {
                    const res = await reverseOutAction(r.id);
                    toast(res.ok ? { tone: "success", title: "Reversed", message: r.receiptNo } : { tone: "danger", title: res.error });
                    router.refresh();
                  }),
              ],
            ]}
          />
        ) : null,
    },
  ];
  const inCols: DataColumn<IO["income"][number]>[] = [
    { key: "d", label: "Date", render: (r) => fdate(r.date) },
    { key: "k", label: "Type", render: (r) => <Badge tone="success">{t(r.kind)}</Badge> },
    { key: "x", label: "Details", render: (r) => r.detail },
    { key: "b", label: "Bank", render: (r) => (r.bank ? t(r.bank) : "—") },
    { key: "n", label: "Receipt", mono: true, render: (r) => r.receiptNo ?? "—" },
    { key: "a", label: "Amount", align: "right", strong: true, render: (r) => <span style={{ color: "var(--green-600)" }}>{money(r.amount)}</span> },
  ];
  const th = { padding: "8px 12px", font: "700 11px var(--font-body)", textTransform: "uppercase" as const, color: "var(--text-muted)", background: "var(--surface-sunken)", textAlign: "end" as const };
  const td = { padding: "10px 12px", borderTop: "1px solid var(--border-default)", textAlign: "end" as const, fontSize: 13 };

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        {balances.rows.map((b) => (
          <div key={b.country} style={{ background: b.country === country ? "var(--navy-700)" : "#fff", color: b.country === country ? "#fff" : "var(--text-strong)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-l)", padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, opacity: 0.85 }}>
              <Flag country={b.country} /> {t(b.country)} · {t("Balance")}
            </div>
            <div style={{ font: "800 22px var(--font-display)", marginTop: 6 }}>{money(b.balance)}</div>
          </div>
        ))}
        <Stat icon="Wallet" tone="green" label="Total balance" value={money(balances.total)} />
      </div>
      <FinBox
        title="Per bank / cash"
        actions={
          canWrite && (
            <Button size="s" variant="outline" leadingIcon={<Icon name="Calculator" size={14} />} onClick={() => setCount(true)}>
              {t("Enter count")}
            </Button>
          )
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
          {io.perBank.map((b) => (
            <div key={b.bankId} style={{ padding: 12, border: "1px solid var(--border-default)", borderRadius: 8 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t(b.bank)}</div>
              <div style={{ font: "700 17px var(--font-body)" }}>{b.counted !== null ? money(b.counted) : "—"}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {t("Records")}: {money(b.recorded)}
              </div>
            </div>
          ))}
        </div>
        {io.countedTotal !== null && (
          <div role={io.countMismatch ? "alert" : undefined} style={{ padding: "10px 12px", borderRadius: 8, background: io.countMismatch ? "#FDEEEE" : "#EAF7EF", color: io.countMismatch ? "var(--red-600)" : "var(--green-600)", fontSize: 13, fontWeight: 600 }}>
            {io.countMismatch
              ? `${t("The bank amounts do not add up to the balance")}: ${money(io.countedTotal)} ≠ ${money(io.balance)} (${t("difference")} ${money(Number(io.countedTotal) - Number(io.balance))})`
              : `${t("Bank amounts match the balance")}: ${money(io.balance)}`}
          </div>
        )}
      </FinBox>
      <FinBox title="Income" pad={0}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, padding: "0 14px" }}>
          <Stat compact label="Shipment collections" value={money(io.totals.collections)} />
          <Stat compact label="Commission (paid in full)" value={money(io.totals.commission)} />
          <Stat compact label="Money Receive" value={money(io.totals.moneyReceive)} />
          <Stat compact label="Debt returned" value={money(io.totals.debtReturned)} />
          {Number(io.opening) !== 0 && <Stat compact label="Opening balance" value={money(io.opening)} />}
        </div>
        <Table rows={io.income.slice(0, 200)} cols={inCols} rowKey={(r) => r.id} empty="No records found" />
      </FinBox>
      <FinBox
        title="Out"
        pad={0}
        actions={
          canWrite && (
            <Button size="s" leadingIcon={<Icon name="Plus" size={14} />} onClick={() => setOut(true)} data-testid="add-out">
              {t("Add Out")}
            </Button>
          )
        }
      >
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "0 14px" }}>
          {[["", "All"], ...CATEGORY].map(([k, l]) => (
            <button key={k} type="button" onClick={() => go({ out: k || null })} style={{ height: 32, padding: "0 12px", borderRadius: 16, border: "1px solid " + (filter === k ? "var(--navy-700)" : "var(--border-default)"), background: filter === k ? "var(--navy-700)" : "#fff", color: filter === k ? "#fff" : "var(--text-strong)", font: "600 12px var(--font-body)", cursor: "pointer" }}>
              {t(l!)}
            </button>
          ))}
        </div>
        <Table rows={io.outs} cols={outCols} rowKey={(r) => r.id} empty="No records found" />
      </FinBox>
      <FinBox title="What this balance is made of" pad={0}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["", "From earlier years", "Came in", "Went out", "Remaining"].map((h, i) => (
                  <th key={h || i} style={{ ...th, textAlign: i ? "end" : "start" }}>
                    {t(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {io.composition.map((r) => (
                <tr key={r.key}>
                  <td style={{ ...td, textAlign: "start", fontWeight: 600 }}>{t(r.label)}</td>
                  <td style={{ ...td, color: Number(r.opening) < 0 ? "var(--red-600)" : Number(r.opening) ? undefined : "var(--text-muted)" }}>{money(r.opening)}</td>
                  <td style={td}>{money(r.in)}</td>
                  <td style={td}>{money(r.out)}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{money(r.remaining)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, textAlign: "start", fontWeight: 800 }}>{t("Balance")}</td>
                <td style={td} />
                <td style={td} />
                <td style={td} />
                <td style={{ ...td, fontWeight: 800, color: "var(--navy-700)" }}>{money(io.balance)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </FinBox>
      {out && <OutDialog options={options} onClose={() => setOut(false)} onDone={() => { setOut(false); router.refresh(); }} />}
      {count && (
        <CountDialog
          perBank={io.perBank}
          onClose={() => setCount(false)}
          onDone={() => {
            setCount(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function CountDialog({ perBank, onClose, onDone }: { perBank: IO["perBank"]; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(perBank.map((b) => [b.bankId, b.counted ?? ""])));
  return (
    <Dialog
      open
      title={t("Enter count")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveCountAction(perBank.map((b) => ({ bankId: b.bankId, amount: (v[b.bankId] || "0").trim() })));
                if (!r.ok) return toast({ tone: "danger", title: r.error });
                toast({ tone: "success", title: "Saved" });
                onDone();
              })
            }
          >
            {t("Save")}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("Type how much is in each bank and in cash. They must add up to the balance.")}</div>
        {perBank.map((b) => (
          <Input key={b.bankId} label={t(b.bank)} type="number" min="0" step="0.01" value={v[b.bankId]} onChange={(e) => setV((o) => ({ ...o, [b.bankId]: e.target.value }))} />
        ))}
      </div>
    </Dialog>
  );
}

export function OutDialog({ options, onClose, onDone, preset }: { options: OutOptions; onClose: () => void; onDone: () => void; preset?: Partial<OutFormValues> }) {
  const t = useT();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState<OutFormValues>({
    category: "EXPENSE",
    amount: "",
    bankId: options.banks[0]?.id ?? "",
    paidAt: new Date().toISOString().slice(0, 10) as unknown as Date,
    sentTo: "",
    note: "",
    shipmentId: "",
    stage: "",
    partner: "",
    forYear: "",
    reference: "",
    ...preset,
  } as OutFormValues);
  // Paid now for an earlier year (e.g. 2025 shipment W-30): it comes out of what that year left.
  const earlier = options.earlierYears.find((y) => String(y.fromYear) === String(v.forYear ?? ""));
  const canEarlier = options.earlierYears.length > 0 && v.category !== "DEBT";
  const PART: Record<string, string> = { SHIPMENT_COST: "SHIPMENT_COST", TRANSFER: "TRANSFER", COMMISSION: "COMMISSION", EXPENSE: "PROFIT" };
  const part = v.category === "PROFIT_PAYOUT" ? (v.partner || null) : PART[v.category] ?? null;
  const left = earlier && part ? earlier.parts.find((x) => x.source === part)?.left ?? "0" : null;
  const shipList = earlier ? earlier.shipments : options.shipments;
  const [com, setCom] = useState<Record<string, string>>({});
  const set = (k: keyof OutFormValues, x: unknown) => setV((o) => ({ ...o, [k]: x }));
  const sh = (options.earlierYears.find((y) => String(y.fromYear) === String(v.forYear ?? ""))?.shipments ?? options.shipments).find((s) => s.id === v.shipmentId);
  const comTotal = useMemo(() => Object.values(com).reduce((a, x) => a + Math.round((Number(x) || 0) * 100), 0) / 100, [com]);
  const sel = { height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-s)", background: "#fff", font: "400 14px var(--font-body)", width: "100%" } as const;
  const lab = { display: "flex", flexDirection: "column" as const, gap: 6, font: "600 13px var(--font-body)" };

  const save = () =>
    start(async () => {
      setError(null);
      const values = {
        ...v,
        amount: v.category === "COMMISSION" && !earlier ? comTotal.toFixed(2) : String(v.amount).trim(),
        paidAt: String(v.paidAt),
        forYear: earlier ? earlier.fromYear : undefined,
        reference: earlier ? v.reference : undefined,
        commissions: v.category === "COMMISSION" && !earlier ? Object.entries(com).filter(([, x]) => Number(x) > 0).map(([invoiceId, x]) => ({ invoiceId, amount: Number(x).toFixed(2) })) : undefined,
      } as OutFormValues;
      const r = await addOutAction(values);
      if (!r.ok) return setError(r.error);
      toast({ tone: "success", title: "Out saved", message: r.data?.receiptNo });
      onDone();
    });

  return (
    <Dialog
      open
      width={620}
      title={t("Add Out")}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("Cancel")}
          </Button>
          <Button onClick={save} disabled={pending} data-testid="save-out">
            {t("Save")}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={lab}>
          {t("Category")}
          <select value={v.category} onChange={(e) => set("category", e.target.value)} style={sel} data-testid="out-category">
            {CATEGORY.filter(([k]) => k !== "PROFIT_PAYOUT" || options.partners).map(([k, l]) => (
              <option key={k} value={k}>
                {t(l)}
              </option>
            ))}
          </select>
        </label>
        {canEarlier && (
          <label style={lab}>
            {t("Belongs to")}
            <select value={String(v.forYear ?? "")} onChange={(e) => setV((o) => ({ ...o, forYear: e.target.value, shipmentId: "", stage: "" }) as OutFormValues)} style={sel} data-testid="out-for-year">
              <option value="">
                {t("This year")} ({options.year})
              </option>
              {options.earlierYears.map((y) => (
                <option key={y.fromYear} value={y.fromYear}>
                  {y.fromYear} · {t("from the opening balance")}
                </option>
              ))}
            </select>
          </label>
        )}
        {earlier && (
          <div style={{ padding: "10px 12px", borderRadius: 8, background: "#FFF6E5", fontSize: 13 }}>
            {part ? (
              <>
                {t("It comes out of what")} {earlier.fromYear} {t("left for this part")}: <b>{money(left ?? "0")}</b>
              </>
            ) : (
              t("Choose the partner")
            )}
          </div>
        )}
        {v.category === "SHIPMENT_COST" && earlier && earlier.shipments.length === 0 && (
          <Input label={t("Shipment (e.g. W-30)")} value={v.reference ?? ""} onChange={(e) => set("reference", e.target.value)} data-testid="out-reference" />
        )}
        {v.category === "COMMISSION" && earlier && <Input label={t("Agent / shipment")} value={v.reference ?? ""} onChange={(e) => set("reference", e.target.value)} />}
        {v.category === "SHIPMENT_COST" && (!earlier || earlier.shipments.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={lab}>
              {t("Shipment")}
              <select value={v.shipmentId ?? ""} onChange={(e) => set("shipmentId", e.target.value)} style={sel}>
                <option value="">{t("Choose…")}</option>
                {shipList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.mode === "AIR" ? t("Air") : t("Sea")}
                  </option>
                ))}
              </select>
            </label>
            <label style={lab}>
              {t("Stage")}
              <select value={v.stage ?? ""} onChange={(e) => set("stage", e.target.value)} style={sel}>
                <option value="">{t("Choose…")}</option>
                {(sh?.mode === "SEA" ? ["ORIGIN", "ARRIVED"] : ["ORIGIN", "TRANSIT", "ARRIVED"]).map((k) => (
                  <option key={k} value={k}>
                    {t(STAGE[k]!)}
                    {sh ? ` · ${t("Cost")} ${money(sh.due[k as "ORIGIN"])} · ${t("Paid")} ${money(sh.paid[k as "ORIGIN"])}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {v.category === "PROFIT_PAYOUT" && options.partners && (
          <label style={lab}>
            {t("Partner")}
            <select value={v.partner ?? ""} onChange={(e) => set("partner", e.target.value)} style={sel}>
              <option value="">{t("Choose…")}</option>
              {(["SOMALI_TRANSPORT", "MAHAD"] as const).map((p) => (
                <option key={p} value={p}>
                  {t(PARTNER[p]!)} · {t("We hold")} {money(options.partners![p])}
                </option>
              ))}
            </select>
          </label>
        )}
        {v.category === "COMMISSION" && !earlier ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("Agents owed commission (customer paid in full). One payment can cover several shipments.")}</div>
            {options.commissions.length === 0 && <div style={{ fontSize: 13 }}>{t("No commission is payable yet")}</div>}
            {options.commissions.map((c) => (
              <div key={c.invoiceId} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, border: "1px solid var(--border-default)", borderRadius: 6, flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: 160, fontSize: 13 }}>
                  <b>{c.agent}</b> · {c.shipment} · {c.customer}
                  <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>
                    {t("Owed")} {money(c.due)}
                  </span>
                </span>
                <input type="number" min="0" step="0.01" placeholder="0" value={com[c.invoiceId] ?? ""} onChange={(e) => setCom((o) => ({ ...o, [c.invoiceId]: e.target.value }))} style={{ width: 110, height: 34, padding: "0 8px", border: "1px solid var(--border-strong)", borderRadius: 6, textAlign: "end" }} />
                <Button size="s" variant="ghost" onClick={() => setCom((o) => ({ ...o, [c.invoiceId]: c.due }))}>
                  {t("All")}
                </Button>
              </div>
            ))}
            <div style={{ textAlign: "end", fontWeight: 700 }}>
              {t("Total")}: {money(comTotal)}
            </div>
          </div>
        ) : (
          <Input label={`${t("Amount")} (USD)`} type="number" min="0" step="0.01" value={String(v.amount)} onChange={(e) => set("amount", e.target.value)} data-testid="out-amount" />
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
          <label style={lab}>
            {t("Paid from")}
            <select value={v.bankId} onChange={(e) => set("bankId", e.target.value)} style={sel}>
              {options.banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {t(b.name)}
                </option>
              ))}
            </select>
          </label>
          <DateField label="Date" value={String(v.paidAt)} onChange={(x) => set("paidAt", x)} />
        </div>
        <Input label={v.category === "DEBT" ? t("Who took the money") : t("Sent to (name + bank / number)")} value={v.sentTo ?? ""} onChange={(e) => set("sentTo", e.target.value)} />
        <Input label={t("Note")} value={v.note ?? ""} onChange={(e) => set("note", e.target.value)} />
        {error && (
          <div role="alert" style={{ color: "var(--status-danger)", fontSize: 13 }}>
            {t(error)}
          </div>
        )}
      </div>
    </Dialog>
  );
}
