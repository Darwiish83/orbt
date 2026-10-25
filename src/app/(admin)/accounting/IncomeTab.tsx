"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { useT } from "@/i18n/I18nProvider";
import { DateField, Flag, Stat } from "@/ui/kit";
import { Badge, Button, Dialog, Icon, IconButton, Input, type IconName } from "@/ui/primitives";
import { fdate, money } from "@/ui/format";
import type { countryBalances, incomeAndOut, outFormOptions } from "@/modules/accounting/service";
import { bankLogo } from "@/config/company";
import { RowMenu, useToast } from "@/components/admin/ui";
import { setAdminScopeAction } from "@/app/(admin)/scopeActions";
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
/** How an out is sent (owner 2026-10-25). */
const SENT_VIA = ["EVC Plus", "Zaad", "eDahab", "Sahal", "Salaam Bank", "Dahabshiil Bank", "Premier Bank", "Other bank", "Cash"];
const STAGE: Record<string, string> = { ORIGIN: "Origin", TRANSIT: "Transit", ARRIVED: "Arrived" };
const PARTNER: Record<string, string> = { SOMALI_TRANSPORT: "Somali Transport", MAHAD: "Mahad" };

export function IncomeTab({ io, balances, options, filter, canWrite, go, country }: { io: IO; balances: Balances; options: OutOptions; filter: string; canWrite: boolean; go: (p: Record<string, string | null>) => void; country: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [, start] = useTransition();
  const [out, setOut] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const toCountry = (c: string) => c !== country && start(async () => {
    await setAdminScopeAction({ country: c });
    router.refresh();
  });

  const totalIn = (Number(io.balance) * 100 + Number(io.totals.out) * 100) / 100;
  const outs = io.outs.filter((o) => !filter || o.category === filter);
  const outSum = outs.reduce((a, o) => a + Math.round(Number(o.amount) * 100), 0) / 100;
  // Income, grouped like the design: one line per shipment, then Money Receive and debts returned.
  const groups = useMemo(() => {
    const m = new Map<string, IO["income"]>();
    for (const r of io.income) if (r.shipment) m.set(r.shipment, [...(m.get(r.shipment) ?? []), r]);
    return [...m.entries()].map(([code, rows]) => ({ code, rows, mode: rows[0]!.mode, amount: rows.reduce((a, r) => a + Math.round(Number(r.amount) * 100), 0) / 100, last: rows[0]!.date }));
  }, [io.income]);
  const others = io.income.filter((r) => !r.shipment);
  const reverse = (r: IO["outs"][number]) =>
    start(async () => {
      const res = await reverseOutAction(r.id);
      toast(res.ok ? { tone: "success", title: "Reversed", message: r.receiptNo } : { tone: "danger", title: res.error });
      router.refresh();
    });

  return (
    <>
      {/* Balance per country + all countries together */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        {balances.rows.map((b) => (
          <button
            key={b.country}
            type="button"
            onClick={() => toCountry(b.country)}
            title={t("Balance breakdown")}
            style={{ ...card, cursor: "pointer", textAlign: "start", font: "inherit", border: "1.5px solid " + (b.country === country ? "var(--navy-700)" : "var(--border-default)"), padding: 14, gap: 6 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "var(--text-strong)" }}>
              <Flag country={b.country} size={13} />
              {t(b.country)} {t("Balance")}
            </div>
            <div style={{ font: "800 22px var(--font-display)", color: Number(b.balance) < 0 ? "var(--red-600)" : "var(--text-strong)" }}>{money(b.balance)}</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "var(--green-600)" }}>↓ {money(b.in)}</span>
              <span style={{ color: "var(--red-600)" }}>↑ {money(b.out)}</span>
            </div>
          </button>
        ))}
        <div style={{ background: "var(--navy-700)", color: "#fff", borderRadius: "var(--radius-l)", padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
            <Icon name="Globe" size={15} />
            {t("Total Balance")}
          </div>
          <div style={{ font: "800 22px var(--font-display)" }}>{money(balances.total)}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{t("All countries together")}</div>
        </div>
      </div>

      <BankCount io={io} canWrite={canWrite} onSaved={() => router.refresh()} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <Stat icon="ArrowDownLeft" tone="green" label="Total In" value={money(totalIn)} />
        <Stat icon="ArrowUpRight" tone="red" label="Total Out" value={money(io.totals.out)} />
        <Stat icon="Wallet" tone={Number(io.balance) >= 0 ? "navy" : "red"} label="Balance" value={money(io.balance)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(380px,100%),1fr))", gap: 16, alignItems: "start" }}>
        {/* Income: added automatically */}
        <div style={{ ...card, padding: 0, gap: 0, overflow: "hidden" }}>
          <Head icon="ArrowDownLeft" tone={["var(--green-600)", "#E8F6EE"]} title={t("Income")} total={money(totalIn)} />
          <div style={{ padding: "8px 16px", fontSize: 11, color: "var(--text-muted)", background: "var(--surface-sunken)" }}>{t("Added automatically from shipment payments and commissions.")}</div>
          {Number(io.opening) !== 0 && <Item icon="History" title={`${t("Opening balance")} · ${t("from earlier years")}`} sub={t("Overview · Period closing")} amount={io.opening} onClick={() => go({ tab: "overview" })} />}
          {groups.map((g) => (
            <div key={g.code}>
              <Item
                icon={g.mode === "SEA" ? "Ship" : "Plane"}
                title={`${g.code} · ${t("Collected")}`}
                sub={`${g.rows.length} ${t("payments")} · ${t("last")} ${fdate(g.last)}`}
                amount={String(g.amount)}
                open={open === g.code}
                onClick={() => setOpen(open === g.code ? null : g.code)}
              />
              {open === g.code && (
                <div style={{ padding: "0 16px 12px 44px", display: "flex", flexDirection: "column", gap: 6, borderBottom: "1px solid var(--border-default)" }}>
                  {g.rows.map((p) => (
                    <div key={p.id} style={{ display: "flex", gap: 10, fontSize: 12, color: "var(--text-body)" }}>
                      <span style={{ width: 84, flex: "none" }}>{fdate(p.date)}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {p.detail}
                        {p.bank ? ` · ${t(p.bank)}` : ""}
                        {p.receiptNo ? ` · ${p.receiptNo}` : ""}
                      </span>
                      <b>{money(p.amount)}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {others.map((r) =>
            r.kind === "Money Receive" ? (
              <Item key={r.id} icon="ArrowLeftRight" title={`${t("Money Receive")} · ${r.detail}`} sub={`${fdate(r.date)} · USD`} amount={r.amount} onClick={() => (window.location.href = "/transfer")} />
            ) : (
              <Item key={r.id} icon="Undo2" title={`${t("Debt returned")} · ${r.detail}`} sub={[fdate(r.date), r.bank && t(r.bank), r.receiptNo].filter(Boolean).join(" · ")} amount={r.amount} onClick={() => go({ tab: "debts" })} />
            ),
          )}
          {!groups.length && !others.length && Number(io.opening) === 0 && <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>{t("No income yet")}</div>}
        </div>

        {/* Out: typed by you */}
        <div style={{ ...card, padding: 0, gap: 0, overflow: "hidden" }}>
          <Head icon="ArrowUpRight" tone={["var(--red-600)", "#FDECEC"]} title={t("Out")} total={money(io.totals.out)} red />
          <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, background: "var(--surface-sunken)" }}>
            <span style={{ flex: 1, fontSize: 11, color: "var(--text-muted)" }}>{t("Typed by you.")}</span>
            {canWrite && (
              <Button size="s" leadingIcon={<Icon name="Plus" size={14} />} onClick={() => setOut(true)} data-testid="add-out">
                {t("Add Out")}
              </Button>
            )}
          </div>
          <div style={{ padding: "10px 16px", display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid var(--border-default)" }}>
            {[["", "All"], ...CATEGORY].map(([k, l]) => {
              const on = filter === k;
              const n = k ? io.outs.filter((o) => o.category === k).length : io.outs.length;
              return (
                <button key={k} type="button" onClick={() => go({ out: k || null })} style={{ height: 30, padding: "0 12px", borderRadius: 15, cursor: "pointer", border: "1.5px solid " + (on ? "var(--navy-700)" : "var(--border-default)"), background: on ? "var(--navy-700)" : "#fff", color: on ? "#fff" : "var(--text-strong)", font: "600 12px var(--font-body)" }}>
                  {t(l!)} <span style={{ opacity: 0.7 }}>{n}</span>
                </button>
              );
            })}
            <span style={{ marginInlineStart: "auto", alignSelf: "center", fontSize: 12, color: "var(--text-muted)" }}>{money(outSum)}</span>
          </div>
          {outs.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border-default)" }}>
              <Icon name={OUT_ICON[r.category] ?? "ReceiptText"} size={16} color="var(--red-600)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: "700 14px var(--font-body)", color: "var(--text-strong)" }}>
                  {[t(CATEGORY.find((c) => c[0] === r.category)?.[1] ?? r.category), r.shipment, r.stage && t(STAGE[r.stage] ?? ""), r.partner && t(PARTNER[r.partner] ?? ""), r.reference].filter(Boolean).join(" · ")}
                  {r.forYear && (
                    <>
                      {" "}
                      <Badge tone="warning">{`${t("For")} ${r.forYear}`}</Badge>
                    </>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {fdate(r.date)} · {t(r.bank)}
                  {r.sentTo ? ` → ${r.sentTo}` : ""}
                  {r.sentVia ? ` (${[t(r.sentVia), r.sentAccount].filter(Boolean).join(" ")})` : ""}
                  {r.note ? ` · ${r.note}` : ""} · <span style={{ fontFamily: "var(--font-mono)" }}>{r.receiptNo}</span>
                </div>
              </div>
              <b style={{ fontSize: 14, color: "var(--red-600)", whiteSpace: "nowrap" }}>−{money(r.amount)}</b>
              <IconButton size="s" variant="ghost" label={t("View Receipt")} icon={<Icon name="Receipt" size={14} />} onClick={() => window.open(`/print/accounting-receipt/${r.receiptNo}`, "_blank", "noopener")} />
              {canWrite && <RowMenu dots items={[["Reverse", () => reverse(r)]]} />}
            </div>
          ))}
          {!outs.length && <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>{t("No records found")}</div>}
        </div>
      </div>

      <Breakdown io={io} country={country} countries={balances.rows.map((b) => b.country)} onCountry={toCountry} />

      {out && <OutDialog options={options} onClose={() => setOut(false)} onDone={() => { setOut(false); router.refresh(); }} />}
    </>
  );
}

const card: CSSProperties = { background: "#fff", border: "1px solid var(--border-default)", borderRadius: "var(--radius-l)", padding: 16, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 };
const OUT_ICON: Record<string, IconName> = { SHIPMENT_COST: "Package", EXPENSE: "ReceiptText", COMMISSION: "Handshake", TRANSFER: "ArrowLeftRight", DEBT: "HandCoins", PROFIT_PAYOUT: "Users" };

function Head({ icon, tone, title, total, red }: { icon: IconName; tone: [string, string]; title: string; total: string; red?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16 }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: tone[1], color: tone[0], display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <Icon name={icon} size={18} />
      </span>
      <b style={{ flex: 1, font: "700 17px var(--font-display)", color: "var(--text-strong)" }}>{title}</b>
      <b style={{ font: "800 18px var(--font-display)", color: red ? "var(--red-600)" : "var(--green-600)" }}>{total}</b>
    </div>
  );
}

function Item({ icon, title, sub, amount, onClick, open }: { icon: IconName; title: string; sub: string; amount: string; onClick?: () => void; open?: boolean }) {
  return (
    <button type="button" onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 16px", border: 0, borderBottom: "1px solid var(--border-default)", background: "#fff", cursor: onClick ? "pointer" : "default", textAlign: "start", font: "inherit" }}>
      <Icon name={icon} size={16} color="var(--text-strong)" />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", font: "700 14px var(--font-body)", color: "var(--text-strong)" }}>{title}</span>
        <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>{sub}</span>
      </span>
      <b style={{ fontSize: 14, color: Number(amount) < 0 ? "var(--red-600)" : "var(--text-strong)", whiteSpace: "nowrap" }}>{money(amount)}</b>
      <Icon name={open ? "ChevronDown" : "ChevronRight"} size={16} color="var(--text-muted)" />
    </button>
  );
}

/** Money in banks & cash: type the real amount in each account; it must equal the balance. */
function BankCount({ io, canWrite, onSaved }: { io: IO; canWrite: boolean; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const [pending, start] = useTransition();
  const saved = Object.fromEntries(io.perBank.map((b) => [b.bankId, b.counted ?? ""]));
  const [v, setV] = useState<Record<string, string>>(saved);
  const c = (x: string) => Math.round(Number(x || 0) * 100);
  const any = io.perBank.some((b) => (v[b.bankId] ?? "").trim() !== "");
  const typed = io.perBank.reduce((a, b) => a + c(v[b.bankId] ?? ""), 0);
  const gap = (typed - c(io.balance)) / 100;
  const dirty = io.perBank.some((b) => (v[b.bankId] ?? "") !== saved[b.bankId]);
  const tone = !any ? ["var(--surface-sunken)", "var(--border-default)", "var(--text-muted)"] : gap === 0 ? ["#E8F6EE", "#A7DCB9", "var(--green-600)"] : ["#FDECEC", "#F3B4B4", "var(--red-600)"];
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", font: "700 15px var(--font-display)", color: "var(--text-strong)" }}>
        <Icon name="Landmark" size={17} />
        {t("Money in banks & cash")}
        <span style={{ fontWeight: 400, fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>· {t("Type the real amount in each account")}</span>
        {canWrite && dirty && (
          <Button
            size="s"
            style={{ marginInlineStart: "auto" }}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveCountAction(io.perBank.map((b) => ({ bankId: b.bankId, amount: (v[b.bankId] || "0").trim() })));
                if (!r.ok) return toast({ tone: "danger", title: r.error });
                toast({ tone: "success", title: "Saved" });
                onSaved();
              })
            }
          >
            {t("Save")}
          </Button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
        {io.perBank.map((b) => {
          const logo = bankLogo(b.bank);
          return (
            <label key={b.bankId} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, border: "1.5px solid var(--border-default)", borderRadius: 10 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="" style={{ width: 28, height: 28, borderRadius: 7 }} />
                ) : (
                  <span style={{ width: 28, height: 28, borderRadius: 7, background: "#E8F6EE", color: "var(--green-600)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="Banknote" size={16} />
                  </span>
                )}
                <b style={{ fontSize: 13, color: "var(--text-strong)" }}>{t(b.bank)}</b>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, borderBottom: "1.5px dashed var(--border-strong)" }}>
                <span style={{ font: "700 18px var(--font-display)", color: "var(--text-muted)" }}>$</span>
                <input
                  inputMode="decimal"
                  value={v[b.bankId] ?? ""}
                  placeholder="0.00"
                  readOnly={!canWrite}
                  onChange={(e) => setV((o) => ({ ...o, [b.bankId]: e.target.value.replace(/[^\d.]/g, "") }))}
                  style={{ flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", font: "800 20px var(--font-display)", color: "var(--text-strong)", padding: "2px 0" }}
                />
              </span>
            </label>
          );
        })}
      </div>
      <div role={any && gap !== 0 ? "alert" : undefined} style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "12px 14px", borderRadius: 10, background: tone[0], border: "1px solid " + tone[1] }}>
        <span style={{ fontSize: 13 }}>
          {t("Total typed")}: <b>{money(typed / 100)}</b>
        </span>
        <span style={{ fontSize: 13 }}>
          {t("System balance")}: <b>{money(io.balance)}</b>
        </span>
        <span style={{ marginInlineStart: "auto", display: "inline-flex", alignItems: "center", gap: 8, font: "700 14px var(--font-body)", color: tone[2] }}>
          <Icon name={!any ? "Info" : gap === 0 ? "CircleCheck" : "CircleAlert"} size={18} />
          {!any ? t("Type the amounts to check") : gap === 0 ? t("Balanced — correct") : `${t("Error: not balanced")} (${gap > 0 ? "+" : "−"}${money(Math.abs(gap))})`}
        </span>
      </div>
      {any && gap !== 0 && <div style={{ fontSize: 12, color: "var(--red-600)" }}>{gap > 0 ? t("You have more money than the system shows. An income may be missing.") : t("You have less money than the system shows. An out (expense) may be missing.")}</div>}
    </div>
  );
}

const ROW_STYLE: Record<string, [IconName, string]> = {
  transfer: ["ArrowLeftRight", "#0E7490"],
  commission: ["Handshake", "#7C3AED"],
  cost: ["Package", "#B45309"],
  som: ["Truck", "#15803D"],
  mah: ["UserRound", "#C2410C"],
  orbit: ["Building2", "var(--navy-700)"],
};

/** Balance breakdown: what the balance is made of, then income and out by kind. */
function Breakdown({ io, country, countries, onCountry }: { io: IO; country: string; countries: string[]; onCountry: (c: string) => void }) {
  const t = useT();
  const bal = Number(io.balance);
  const cols = "minmax(0,1.6fr) repeat(3,minmax(0,1fr))";
  const rows = io.composition.map((r) => ({ ...r, came: (Math.round(Number(r.opening) * 100) + Math.round(Number(r.in) * 100)) / 100 }));
  const outBy = (k: string) => io.outs.filter((o) => o.category === k).reduce((a, o) => a + Math.round(Number(o.amount) * 100), 0) / 100;
  const bRow = (icon: IconName, label: string, v: number, sign: "+" | "-") => (
    <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border-default)", fontSize: 13 }}>
      <Icon name={icon} size={15} color="var(--text-muted)" />
      <span style={{ flex: 1, color: "var(--text-strong)" }}>{t(label)}</span>
      <b style={{ color: sign === "+" ? "var(--green-600)" : "var(--red-600)" }}>
        {v ? sign : ""}
        {money(v)}
      </b>
    </div>
  );
  return (
    <div style={{ ...card, gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", font: "700 15px var(--font-body)", color: "var(--text-strong)" }}>
        <Icon name="ChartPie" size={17} color="var(--navy-700)" />
        {t("Balance breakdown")}
        <span style={{ display: "flex", gap: 6, marginInlineStart: "auto", flexWrap: "wrap" }}>
          {countries.map((c) => (
            <button key={c} type="button" onClick={() => onCountry(c)} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px", borderRadius: 15, cursor: "pointer", border: "1.5px solid " + (c === country ? "var(--navy-700)" : "var(--border-default)"), background: c === country ? "var(--navy-700)" : "#fff", color: c === country ? "#fff" : "var(--text-strong)", font: "600 12px var(--font-body)" }}>
              <Flag country={c} size={12} />
              {t(c)}
            </button>
          ))}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderRadius: 10, background: "var(--navy-700)", color: "#fff" }}>
        <Flag country={country} size={16} />
        <span style={{ flex: 1, fontSize: 14 }}>
          {t(country)} {t("Balance")}
        </span>
        <b style={{ font: "800 24px var(--font-display)" }}>{money(io.balance)}</b>
      </div>
      <div>
        <div style={{ font: "700 13px var(--font-body)", color: "var(--text-strong)", marginBottom: 4 }}>{t("What this balance is made of")}</div>
        <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: "var(--surface-sunken)", margin: "8px 0" }}>
          {rows
            .filter((r) => Number(r.remaining) > 0)
            .map((r) => (
              <span key={r.key} style={{ width: `${bal > 0 ? Math.min(100, (Number(r.remaining) / bal) * 100) : 0}%`, background: ROW_STYLE[r.key]?.[1] ?? "var(--navy-700)" }} />
            ))}
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 460 }}>
            <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "6px 0", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", borderBottom: "1px solid var(--border-default)" }}>
              <span />
              <span style={{ textAlign: "end" }}>↓ {t("Came in")}</span>
              <span style={{ textAlign: "end" }}>↑ {t("Went out")}</span>
              <span style={{ textAlign: "end" }}>= {t("Remaining")}</span>
            </div>
            {rows.map((r) => (
              <div key={r.key} style={{ display: "grid", gridTemplateColumns: cols, gap: 8, alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--border-default)", fontSize: 13 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-strong)" }}>
                  <Icon name={ROW_STYLE[r.key]?.[0] ?? "Circle"} size={15} color={ROW_STYLE[r.key]?.[1]} />
                  {t(r.label)}
                </span>
                <span style={{ textAlign: "end", color: "var(--green-600)" }}>{money(r.came)}</span>
                <span style={{ textAlign: "end", color: "var(--red-600)" }}>{money(r.out)}</span>
                <b style={{ textAlign: "end", color: Number(r.remaining) < 0 ? "var(--red-600)" : "var(--text-strong)" }}>{money(r.remaining)}</b>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0 0", fontSize: 14 }}>
          <Icon name="Equal" size={15} color="var(--navy-700)" />
          <b style={{ flex: 1, color: "var(--text-strong)" }}>
            {t("Total")} = {t(country)} {t("Balance")}
          </b>
          <b style={{ color: "var(--navy-700)" }}>{money(io.balance)}</b>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
          {t(rows.length > 4 ? "Orbit profit = balance minus transfer, commission, shipments cost, Somali Transport and Mahad." : "Orbit profit = balance minus transfer, commission and shipments cost.")}
          {Number(io.opening) !== 0 && ` ${t("Came in includes the opening balance from earlier years.")}`}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: 16 }}>
        <div>
          <div style={{ font: "700 13px var(--font-body)", color: "var(--green-600)", marginBottom: 4 }}>↓ {t("Income")}</div>
          {Number(io.opening) !== 0 && bRow("History", "Opening balance", Number(io.opening), "+")}
          {bRow("Package", "Shipment collections", Number(io.totals.collections), "+")}
          {bRow("ArrowLeftRight", "Money Receive", Number(io.totals.moneyReceive), "+")}
          {bRow("Undo2", "Debt returned", Number(io.totals.debtReturned), "+")}
        </div>
        <div>
          <div style={{ font: "700 13px var(--font-body)", color: "var(--red-600)", marginBottom: 4 }}>↑ {t("Out")}</div>
          {CATEGORY.map(([k, l]) => bRow(OUT_ICON[k] ?? "ReceiptText", l, outBy(k), "-"))}
        </div>
      </div>
    </div>
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
    sentVia: "",
    sentAccount: "",
    note: "",
    shipmentId: "",
    stage: "",
    partner: "",
    ...preset,
  } as OutFormValues);
  const [com, setCom] = useState<Record<string, string>>({});
  const set = (k: keyof OutFormValues, x: unknown) => setV((o) => ({ ...o, [k]: x }));
  const sh = options.shipments.find((s) => s.id === v.shipmentId);
  const comTotal = useMemo(() => Object.values(com).reduce((a, x) => a + Math.round((Number(x) || 0) * 100), 0) / 100, [com]);
  const sel = { height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-s)", background: "#fff", font: "400 14px var(--font-body)", width: "100%" } as const;
  const lab = { display: "flex", flexDirection: "column" as const, gap: 6, font: "600 13px var(--font-body)" };

  const save = () =>
    start(async () => {
      setError(null);
      const values = {
        ...v,
        amount: v.category === "COMMISSION" ? comTotal.toFixed(2) : String(v.amount).trim(),
        paidAt: String(v.paidAt),
        commissions: v.category === "COMMISSION" ? Object.entries(com).filter(([, x]) => Number(x) > 0).map(([invoiceId, x]) => ({ invoiceId, amount: Number(x).toFixed(2) })) : undefined,
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
        {v.category === "SHIPMENT_COST" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={lab}>
              {t("Shipment")}
              <select value={v.shipmentId ?? ""} onChange={(e) => set("shipmentId", e.target.value)} style={sel}>
                <option value="">{t("Choose…")}</option>
                {options.shipments.map((s) => (
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
        {v.category === "COMMISSION" ? (
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
        {/* Who it went to and how (owner 2026-10-25). */}
        <Input label={`${t(v.category === "DEBT" ? "Who took the money" : "Sent to (name)")} *`} value={v.sentTo ?? ""} onChange={(e) => set("sentTo", e.target.value)} data-testid="out-sent-to" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={lab}>
            {t("Sent via")} *
            <select value={v.sentVia ?? ""} onChange={(e) => set("sentVia", e.target.value)} style={sel} data-testid="out-sent-via">
              <option value="">{t("Choose…")}</option>
              {SENT_VIA.map((m) => (
                <option key={m} value={m}>
                  {t(m)}
                </option>
              ))}
            </select>
          </label>
          <Input label={v.sentVia === "Cash" ? t("Phone number") : t("Account / phone number")} value={v.sentAccount ?? ""} onChange={(e) => set("sentAccount", e.target.value)} placeholder="61 xxx xxxx" data-testid="out-sent-account" />
        </div>
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
