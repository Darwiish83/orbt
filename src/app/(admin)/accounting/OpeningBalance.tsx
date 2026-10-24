"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import { useT } from "@/i18n/I18nProvider";
import { Badge, Button, Dialog, Icon, Input } from "@/ui/primitives";
import { fdate, money } from "@/ui/format";
import type { listOpening } from "@/modules/accounting/service";
import { FinBox, useToast } from "@/components/admin/ui";
import { addOpeningDebtAction, removeOpeningYearAction, reverseOpeningAction, saveOpeningYearAction } from "./actions";

type Opening = Awaited<ReturnType<typeof listOpening>>;
type Year = Opening["years"][number];

export const OPENING_LABEL: Record<string, string> = {
  PROFIT: "Profit",
  TRANSFER: "Transfer Money",
  COMMISSION: "Commission",
  SOMALI_TRANSPORT: "Somali Transport profit",
  MAHAD: "Mahad profit",
  DEBT: "Debt (owed to us)",
  SHIPMENT_COST: "Shipment cost",
  OTHER: "Other",
};

const OUT_LABEL: Record<string, string> = { SHIPMENT_COST: "Shipment cost", TRANSFER: "Transfer Money", COMMISSION: "Commission", EXPENSE: "Expenses", PROFIT_PAYOUT: "Profit payout" };

/** Cents from a typed amount (display checks only; the server re-checks with Decimal). */
const cents = (v: string | null | undefined) => {
  const n = Number(String(v ?? "").replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const th: CSSProperties = { padding: "8px 10px", font: "700 11px var(--font-body)", textTransform: "uppercase", color: "var(--text-muted)", background: "var(--surface-sunken)", textAlign: "end", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "7px 10px", borderTop: "1px solid var(--border-default)", fontSize: 13, whiteSpace: "nowrap", textAlign: "end" };
const amt = (v: string, bold?: boolean): CSSProperties => ({ ...td, fontWeight: bold ? 800 : 600, color: Number(v) < 0 ? "var(--red-600)" : "var(--text-strong)" });
const card: CSSProperties = { border: "1px solid var(--border-default)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10, background: "#fff", minWidth: 0 };

/**
 * Overview → Opening balance (owner 2026-10-24). For each earlier year: first
 * its balance, then the banks it is in, then what the money is — both must
 * equal the balance. Only what was typed is shown. Then the company balance:
 * brought forward + this year = now.
 */
export function OpeningBalance({ o, year, canManage }: { o: Opening; year: number; canManage: boolean }) {
  const t = useT();
  const editable = canManage && !o.locked;
  const [fy, setFy] = useState<number | null>(o.years[0]?.fromYear ?? null);
  const [editing, setEditing] = useState<number | null>(null);
  const [history, setHistory] = useState(false);
  const known = o.years.map((y) => y.fromYear);
  const more = Array.from({ length: 15 }, (_, i) => year - 1 - i).filter((y) => !known.includes(y));
  const current = o.years.find((y) => y.fromYear === fy) ?? null;
  const thisYear = String((cents(o.now.balance) - cents(o.now.opening)) / 100);
  return (
    <FinBox
      title={`${t("Opening balance")} · ${t("from earlier years")}`}
      pad={0}
      actions={
        o.locked ? (
          <Badge tone="neutral">🔒 {t("Locked")}</Badge>
        ) : editable && more.length > 0 ? (
          <select
            value=""
            data-testid="opening-add-year"
            onChange={(e) => {
              const y = Number(e.target.value);
              if (!y) return;
              setFy(y);
              setEditing(y);
            }}
            style={{ height: 34, padding: "0 10px", border: "1px solid var(--orange-500)", borderRadius: 8, background: "var(--orange-500)", color: "#fff", font: "700 13px var(--font-body)", cursor: "pointer" }}
          >
            <option value="">+ {t("Add a year's balance")}</option>
            {more.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        ) : undefined
      }
    >
      {/* Company balance: brought forward + this year = now */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "0 14px" }} data-testid="company-balance">
        <Sum label={t("Brought forward from earlier years")} v={o.now.opening} />
        <span style={{ font: "800 20px var(--font-display)", color: "var(--text-muted)" }}>+</span>
        <Sum label={`${year}`} v={thisYear} />
        <span style={{ font: "800 20px var(--font-display)", color: "var(--text-muted)" }}>=</span>
        <Sum label={t("Company balance now")} v={o.now.balance} strong />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "0 14px" }}>
        {[...new Set([...known, ...(editing ? [editing] : [])])]
          .sort((a, b) => b - a)
          .map((y) => {
            const on = y === fy;
            const tot = o.years.find((s) => s.fromYear === y)?.total;
            return (
              <button
                key={y}
                type="button"
                data-testid={`opening-year-${y}`}
                onClick={() => {
                  setFy(y);
                  if (editing !== y) setEditing(null);
                }}
                style={{ height: 38, padding: "0 16px", borderRadius: 19, border: "1px solid " + (on ? "var(--navy-700)" : "var(--border-default)"), background: on ? "var(--navy-700)" : "#fff", color: on ? "#fff" : "var(--text-strong)", font: "700 14px var(--font-body)", cursor: "pointer" }}
              >
                {y}
                {tot && <span style={{ fontWeight: 500, marginInlineStart: 8, opacity: 0.9 }}>{money(tot)}</span>}
              </button>
            );
          })}
      </div>

      {o.years.length === 0 && editing === null && (
        <div style={{ padding: "4px 14px 8px", fontSize: 13, color: "var(--text-muted)" }}>{t("No earlier year yet. Use \"Add a year's balance\": first the year's balance, then the banks it is in, then what the money is.")}</div>
      )}

      {fy !== null && editing === fy ? (
        <YearForm o={o} fromYear={fy} y={current} onDone={() => setEditing(null)} />
      ) : (
        current && <YearView y={current} year={year} editable={editable} onEdit={() => setEditing(current.fromYear)} />
      )}


      <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 14px" }}>
        <Button size="s" variant="ghost" onClick={() => setHistory((h) => !h)} trailingIcon={<Icon name={history ? "ChevronUp" : "ChevronDown"} size={14} />}>
          {t("History")}
        </Button>
      </div>
      {history && <History o={o} editable={editable} />}
    </FinBox>
  );
}

function Sum({ label, v, strong }: { label: string; v: string; strong?: boolean }) {
  const neg = Number(v) < 0;
  return (
    <div style={{ padding: "10px 14px", borderRadius: 10, background: strong ? "var(--navy-700)" : "var(--surface-sunken)", color: strong ? "#fff" : "var(--text-strong)" }}>
      <div style={{ fontSize: 11, opacity: 0.8 }}>{label}</div>
      <div style={{ font: "800 20px var(--font-display)", color: strong ? "#fff" : neg ? "var(--red-600)" : undefined }}>{money(v)}</div>
    </div>
  );
}

/** A saved year: its balance, then only the banks and parts that were typed. */
function YearView({ y, year, editable, onEdit }: { y: Year; year: number; editable: boolean; onEdit: () => void }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();
  const list = (title: string, rows: { key: string; label: string; amount: string; sub?: string }[], testid: string) => (
    <div style={card} data-testid={testid}>
      <b style={{ font: "700 14px var(--font-display)" }}>{t(title)}</b>
      {rows.map((r) => (
        <div key={r.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14, borderTop: "1px solid var(--border-default)", paddingTop: 6 }}>
          <span>
            {r.label}
            {r.sub && <span style={{ display: "block", fontSize: 12, color: "var(--orange-600)" }}>{r.sub}</span>}
          </span>
          <b style={{ color: Number(r.amount) < 0 ? "var(--red-600)" : undefined }}>{money(r.amount)}</b>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderTop: "2px solid var(--border-strong)", paddingTop: 6, color: "var(--green-600)", fontWeight: 700 }}>
        <span>✓ {t("Equals the balance")}</span>
        <span>{money(y.total ?? "0")}</span>
      </div>
    </div>
  );
  return (
    <div style={{ padding: "0 14px", display: "flex", flexDirection: "column", gap: 12 }}>
      {y.total !== null && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "12px 16px", borderRadius: 10, background: Number(y.total) < 0 ? "#FDEEEE" : "#EAF7EF" }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {t("Balance of")} {y.fromYear} {y.carried && <Badge tone="neutral">{t("Carried")}</Badge>}
              </div>
              <div data-testid="opening-year-total" style={{ font: "800 26px var(--font-display)", color: Number(y.total) < 0 ? "var(--red-600)" : "var(--green-600)" }}>
                {money(y.total)}
              </div>
              {y.note && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{y.note}</div>}
            </div>
            {editable && (
              <div style={{ display: "flex", gap: 8 }}>
                <Button size="s" variant="outline" leadingIcon={<Icon name="Pencil" size={14} />} onClick={onEdit}>
                  {t("Edit")}
                </Button>
                <Button size="s" variant="ghost" onClick={() => setAsk(true)}>
                  {t("Remove")}
                </Button>
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
            {list("Where it is (banks)", y.banks.map((b) => ({ key: b.bankId ?? "none", label: b.bank ? t(b.bank) : t("Not in a bank"), amount: b.amount })), "opening-banks")}
            {list(
              "What the money is",
              y.parts.map((p) => ({ key: p.source, label: t(OPENING_LABEL[p.source]!), amount: p.amount, sub: Number(p.paid) ? `${t("Paid in")} ${year}: −${money(p.paid)} · ${t("Left")}: ${money(p.left)}` : undefined })),
              "opening-parts",
            )}
          </div>
          {y.paidAfter.length > 0 && (
            <div style={card} data-testid="opening-paid-after">
              <b style={{ font: "700 14px var(--font-display)" }}>
                {t("Paid in")} {year} {t("for")} {y.fromYear}
              </b>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Date", "Category", "Details", "Paid from", "Receipt", "Amount"].map((h, i) => (
                        <th key={h} style={{ ...th, textAlign: i === 5 ? "end" : "start" }}>
                          {t(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {y.paidAfter.map((o) => (
                      <tr key={o.id}>
                        <td style={{ ...td, textAlign: "start" }}>{fdate(o.date)}</td>
                        <td style={{ ...td, textAlign: "start" }}>{t(OUT_LABEL[o.category] ?? o.category)}{o.partner ? ` · ${t(OPENING_LABEL[o.partner] ?? o.partner)}` : ""}</td>
                        <td style={{ ...td, textAlign: "start" }}>{[o.what, o.sentTo].filter(Boolean).join(" · ") || "—"}</td>
                        <td style={{ ...td, textAlign: "start" }}>{t(o.bank)}</td>
                        <td style={{ ...td, textAlign: "start", fontFamily: "var(--font-mono)" }}>{o.receiptNo}</td>
                        <td style={{ ...td, fontWeight: 700, color: "var(--red-600)" }}>−{money(o.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700 }}>
                <span>{t("Total paid")}</span>
                <span style={{ color: "var(--red-600)" }}>−{money(y.paidTotal)}</span>
              </div>
            </div>
          )}
        </>
      )}
      <Debts y={y} editable={editable} />
      {ask && (
        <Dialog
          open
          title={`${t("Remove")} ${y.fromYear}?`}
          onClose={() => setAsk(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setAsk(false)}>
                {t("Cancel")}
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await removeOpeningYearAction(y.fromYear);
                    toast(r.ok ? { tone: "success", title: "Removed" } : { tone: "danger", title: r.error });
                    setAsk(false);
                    router.refresh();
                  })
                }
              >
                {t("Remove")}
              </Button>
            </>
          }
        >
          <div style={{ fontSize: 14 }}>{t("The year's balance, banks and parts stop counting. They stay in the History.")}</div>
        </Dialog>
      )}
    </div>
  );
}

/** 1. the year's balance → 2. which banks → 3. what the money is. */
function YearForm({ o, fromYear, y, onDone }: { o: Opening; fromYear: number; y: Year | null; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [total, setTotal] = useState(y?.total ?? "");
  const [banks, setBanks] = useState<Record<string, string>>(Object.fromEntries(o.banks.map((b) => [b.id, y?.banks.find((x) => x.bankId === b.id)?.amount ?? ""])));
  const [parts, setParts] = useState<Record<string, string>>(Object.fromEntries(o.parts.map((p) => [p, y?.parts.find((x) => x.source === p)?.amount ?? ""])));
  const [note, setNote] = useState(y?.note ?? "");
  const T = cents(total);
  const hasTotal = total.trim() !== "" && Number.isFinite(T) && T !== 0;
  const sumOf = (r: Record<string, string>) => Object.values(r).reduce((a, v) => a + (v.trim() ? cents(v) : 0), 0);
  const left = (r: Record<string, string>) => T - sumOf(r);
  const ok = hasTotal && left(banks) === 0 && left(parts) === 0 && Number.isFinite(sumOf(banks)) && Number.isFinite(sumOf(parts));
  const num = (v: string) => v.replace(/[^\d.-]/g, "");
  const step = (n: number, title: string, on: boolean) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, font: "700 14px var(--font-display)", color: on ? "var(--text-strong)" : "var(--text-muted)" }}>
      <span style={{ width: 24, height: 24, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? "var(--navy-700)" : "var(--gray-200, #E5E7EB)", color: "#fff", fontSize: 12 }}>{n}</span>
      {title}
    </div>
  );
  const remain = (r: Record<string, string>) => {
    const l = left(r);
    return (
      <div style={{ fontSize: 13, fontWeight: 700, color: l === 0 ? "var(--green-600)" : "var(--red-600)" }}>
        {l === 0 ? `✓ ${t("Equals the balance")} ${money(total)}` : `${t("Still to place")}: ${money(l / 100)}`}
      </div>
    );
  };
  const grid = (r: Record<string, string>, set: (k: string, v: string) => void, rows: { key: string; label: string }[], testid: string) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }} data-testid={testid}>
      {rows.map((x) => (
        <Input key={x.key} label={x.label} inputMode="decimal" placeholder="0" disabled={!hasTotal} value={r[x.key] ?? ""} onChange={(e) => set(x.key, num(e.target.value))} />
      ))}
    </div>
  );
  return (
    <div style={{ margin: "0 14px", ...card, border: "1.5px solid var(--navy-700)" }} data-testid="opening-form">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <b style={{ font: "700 16px var(--font-display)" }}>
          {t("Balance of")} {fromYear}
        </b>
        <Button size="s" variant="ghost" onClick={onDone}>
          {t("Cancel")}
        </Button>
      </div>
      {step(1, t("The year's balance"), true)}
      <div style={{ maxWidth: 260 }}>
        <Input label={`${t("Balance")} ${fromYear} (USD)`} inputMode="decimal" placeholder="34207 / -1500" value={total} onChange={(e) => setTotal(num(e.target.value))} data-testid="opening-total-input" />
      </div>
      {step(2, t("Which banks is it in?"), hasTotal)}
      {grid(banks, (k, v) => setBanks((x) => ({ ...x, [k]: v })), o.banks.map((b) => ({ key: b.id, label: t(b.name) })), "opening-form-banks")}
      {hasTotal && remain(banks)}
      {step(3, t("What is the money?"), hasTotal)}
      {grid(parts, (k, v) => setParts((x) => ({ ...x, [k]: v })), o.parts.map((p) => ({ key: p, label: t(OPENING_LABEL[p]!) })), "opening-form-parts")}
      {hasTotal && remain(parts)}
      <Input label={t("Note")} value={note} onChange={(e) => setNote(e.target.value)} />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button
          disabled={!ok || pending}
          data-testid="opening-save"
          onClick={() =>
            start(async () => {
              const r = await saveOpeningYearAction({
                fromYear,
                total,
                banks: Object.entries(banks).filter(([, v]) => v.trim()).map(([bankId, amount]) => ({ bankId, amount })),
                parts: Object.entries(parts).filter(([, v]) => v.trim()).map(([source, amount]) => ({ source: source as never, amount })),
                note,
              });
              if (!r.ok) return toast({ tone: "danger", title: r.error });
              toast({ tone: "success", title: "Saved" });
              onDone();
              router.refresh();
            })
          }
        >
          {t("Save")}
        </Button>
      </div>
    </div>
  );
}

/** Debts from that year: money someone still owes us (not in the balance). */
function Debts({ y, editable }: { y: Year; editable: boolean }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const [v, setV] = useState({ person: "", amount: "", note: "" });
  if (!y.debts.length && !editable) return null;
  return (
    <div style={{ ...card, background: "var(--surface-sunken)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ font: "700 14px var(--font-display)" }}>
          {t("Debts owed to us")} · {y.fromYear}
        </b>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("Not in the balance until returned. They appear in Debts.")}</span>
        {editable && (
          <Button size="s" variant="outline" leadingIcon={<Icon name="Plus" size={14} />} onClick={() => setAdding(true)}>
            {t("Add Debt")}
          </Button>
        )}
      </div>
      {y.debts.map((d) => (
        <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, borderTop: "1px solid var(--border-default)", paddingTop: 6 }}>
          <span>
            <b>{d.person}</b> {d.note && <span style={{ color: "var(--text-muted)" }}>· {d.note}</span>} {d.carried && <Badge tone="neutral">{t("Carried")}</Badge>}
          </span>
          <span>
            {money(d.amount)}
            {Number(d.returned) > 0 && (
              <span style={{ color: "var(--green-600)", marginInlineStart: 8 }}>
                {t("Returned")} {money(d.returned)}
              </span>
            )}
          </span>
        </div>
      ))}
      {adding && (
        <Dialog
          open
          title={`${t("Add Debt")} · ${y.fromYear}`}
          onClose={() => setAdding(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                {t("Cancel")}
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await addOpeningDebtAction({ fromYear: y.fromYear, amount: v.amount, person: v.person, note: v.note });
                    if (!r.ok) return toast({ tone: "danger", title: r.error });
                    toast({ tone: "success", title: "Saved" });
                    setAdding(false);
                    setV({ person: "", amount: "", note: "" });
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
            <Input label={t("Who owes us")} value={v.person} onChange={(e) => setV((x) => ({ ...x, person: e.target.value }))} />
            <Input label={`${t("Amount")} (USD)`} inputMode="decimal" value={v.amount} onChange={(e) => setV((x) => ({ ...x, amount: e.target.value.replace(/[^\d.]/g, "") }))} />
            <Input label={t("Note")} value={v.note} onChange={(e) => setV((x) => ({ ...x, note: e.target.value }))} />
          </div>
        </Dialog>
      )}
    </div>
  );
}

const KIND: Record<string, string> = { TOTAL: "Balance", BANK: "Bank", SOURCE: "Part", DEBT: "Debt" };

/** Every line ever written, replaced ones included (audit view). */
function History({ o, editable }: { o: Opening; editable: boolean }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div style={{ overflowX: "auto", borderTop: "1px solid var(--border-default)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["From year", "Type", "Bank / part / person", "Note", "Amount", ""].map((h, i) => (
              <th key={h || i} style={{ ...th, textAlign: i === 4 ? "end" : "start" }}>
                {t(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {o.legacy !== null && (
            <tr>
              <td style={{ ...td, textAlign: "start" }}>—</td>
              <td style={{ ...td, textAlign: "start" }}>{t("Carried balance")}</td>
              <td style={{ ...td, textAlign: "start" }}>—</td>
              <td style={{ ...td, textAlign: "start" }}>—</td>
              <td style={amt(o.legacy)}>{money(o.legacy)}</td>
              <td style={td} />
            </tr>
          )}
          {o.history.map((r) => (
            <tr key={r.id} style={{ opacity: r.reversed ? 0.5 : 1 }}>
              <td style={{ ...td, textAlign: "start" }}>{r.fromYear}</td>
              <td style={{ ...td, textAlign: "start" }}>
                {t(KIND[r.kind]!)} {r.carried && <Badge tone="neutral">{t("Carried")}</Badge>} {r.reversed && <Badge tone="danger">{t("Replaced")}</Badge>}
              </td>
              <td style={{ ...td, textAlign: "start" }}>{r.kind === "DEBT" ? r.person : r.kind === "BANK" ? (r.bank ? t(r.bank) : t("Not in a bank")) : r.source ? t(OPENING_LABEL[r.source]!) : "—"}</td>
              <td style={{ ...td, textAlign: "start", whiteSpace: "normal", color: "var(--text-muted)" }}>{r.note ?? "—"}</td>
              <td style={{ ...amt(r.amount), textDecoration: r.reversed ? "line-through" : undefined }}>{money(r.amount)}</td>
              <td style={td}>
                {editable && r.kind === "DEBT" && !r.reversed && (
                  <Button
                    size="s"
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await reverseOpeningAction(r.id);
                        toast(res.ok ? { tone: "success", title: "Reversed" } : { tone: "danger", title: res.error });
                        router.refresh();
                      })
                    }
                  >
                    {t("Reverse")}
                  </Button>
                )}
              </td>
            </tr>
          ))}
          {o.history.length === 0 && o.legacy === null && (
            <tr>
              <td colSpan={6} style={{ ...td, textAlign: "center", color: "var(--text-muted)", padding: 20 }}>
                {t("No records found")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
