"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { SearchBox, StatusBadge, INVOICE_STATUS_LABEL } from "@/ui/kit";
import { Icon, Tabs, Tag } from "@/ui/primitives";
import { fdate, money } from "@/ui/format";
import type { myFinance, myProfile } from "@/modules/portal/customerApp";
import { Card, Empty, NavyCard, Row, SectionTitle, YearPicker } from "../ui";

type Fin = Awaited<ReturnType<typeof myFinance>>;
type Me = Awaited<ReturnType<typeof myProfile>>;
const FILTERS: [string, string][] = [
  ["ALL", "All"],
  ["PAID", "Paid"],
  ["PARTIAL", "Partial Paid"],
  ["UNPAID", "Unpaid"],
];

/** Finance (design customer-app/Finance.jsx): Invoices and Statement. */
export function FinanceView({ fin, me, year, years, shipments, tab }: { fin: Fin; me: Me; year: number; years: number[]; shipments: number; tab: "invoices" | "statement" }) {
  const t = useT();
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [st, setSt] = useState("ALL");
  const setTab = (v: string) => {
    const p = new URLSearchParams(params.toString());
    if (v === "invoices") p.delete("tab");
    else p.set("tab", v);
    router.push(`${path}?${p.toString()}`, { scroll: false });
  };
  const rows = fin.invoices.filter((i) => (st === "ALL" || i.status === st) && (!q || `${i.number} ${i.shipment ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const byBank = Object.entries(fin.payments.reduce<Record<string, number>>((m, p) => ({ ...m, [p.bank ?? "Other"]: (m[p.bank ?? "Other"] ?? 0) + Number(p.amount) }), {})).sort((a, b) => b[1] - a[1]);
  const maxB = Math.max(1, ...byBank.map((b) => b[1]));
  const recent = [
    ...fin.payments.map((p) => ({ d: p.date, icon: "CircleCheck" as const, c: "var(--status-success)", a: `${t("Payment received")} · ${money(p.amount)}`, b: `${p.invoiceNo ?? ""} · ${fdate(p.date)}` })),
    ...fin.invoices.map((i) => ({ d: i.date, icon: "FileText" as const, c: "var(--navy-700)", a: `${t("New invoice")} · ${i.number}`, b: `${money(i.total)} · ${fdate(i.date)}` })),
  ]
    .sort((x, y) => (x.d < y.d ? 1 : -1))
    .slice(0, 5);
  const T = fin.totals;
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <h1 style={{ margin: 0, font: "700 24px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{t("Finance")}</h1>
        <YearPicker year={year} years={years} />
      </div>
      <NavyCard overline="Account Summary">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 12px" }}>
          {(
            [
              ["Total Invoices", String(T.invoices)],
              ["Total Invoiced", money(T.invoiced)],
              ["Total Paid", money(T.paid)],
              ["Balance Due", money(T.balance)],
            ] as const
          ).map(([l, v], i) => (
            <div key={l}>
              <div style={{ fontSize: 12, color: "var(--navy-300)" }}>{t(l)}</div>
              <div style={{ font: "800 19px var(--font-display)", color: i === 3 ? "var(--orange-400)" : "#fff", marginTop: 2 }}>{v}</div>
            </div>
          ))}
        </div>
      </NavyCard>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "invoices", label: t("Invoices"), count: fin.invoices.length },
          { value: "statement", label: t("Statement") },
        ]}
      />
      {tab === "invoices" && (
        <>
          <SearchBox value={q} onChange={setQ} placeholder="Search invoice number" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {FILTERS.map(([k, l]) => (
              <Tag key={k} selected={st === k} onClick={() => setSt(k)}>
                {t(l)}
              </Tag>
            ))}
          </div>
          {rows.map((i) => (
            <Card key={i.id} href={`/account/invoices/${i.id}`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid={`inv-${i.number}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ font: "600 13px var(--font-mono)", color: "var(--text-strong)", whiteSpace: "nowrap" }}>{i.number}</span>
                  <StatusBadge status={INVOICE_STATUS_LABEL[i.status]} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)" }}>
                  <span>
                    {i.shipment} · {t(i.mode === "AIR" ? "Air Freight" : "Sea Freight")}
                  </span>
                  <span>{fdate(i.date)}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, paddingTop: 10, borderTop: "1px solid var(--border-default)" }}>
                  {(
                    [
                      ["Amount", i.total],
                      ["Paid", i.paid],
                      ["Balance", i.balance],
                    ] as const
                  ).map(([l, v], k) => (
                    <div key={l}>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t(l)}</div>
                      <div style={{ font: "700 13px var(--font-body)", color: k === 2 && Number(v) > 0 ? "var(--status-danger)" : "var(--text-strong)" }}>{money(v)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
          {!rows.length && <Empty />}
        </>
      )}
      {tab === "statement" && (
        <>
          <Card>
            <Row label="Customer ID" value={me.ref} mono />
            <Row label="Member Since" value={fdate(me.memberSince)} />
            <Row label="Total Shipments" value={String(shipments)} />
          </Card>
          <a href={`/account/statement?year=${year}`} target="_blank" rel="noopener" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: "var(--radius-s)", background: "var(--action-secondary)", color: "#fff", font: "700 14px var(--font-body)", textDecoration: "none" }}>
            <Icon name="FileDown" size={16} />
            {t("Download Statement PDF")}
          </a>
          <SectionTitle>Payment history</SectionTitle>
          <div style={{ background: "#fff", border: "1px solid var(--border-default)", borderRadius: "var(--radius-l)", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "8px 14px", background: "var(--surface-sunken)", borderBottom: "1px solid var(--border-default)", font: "700 10px var(--font-body)", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
              <span>
                {t("Date")} · {t("Invoice No.")}
              </span>
              <span style={{ textAlign: "end" }}>
                {t("Amount")} · {t("Bank")}
              </span>
            </div>
            {fin.payments.map((p) => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4, padding: "11px 14px", borderBottom: "1px solid var(--border-default)", fontSize: 13 }}>
                <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>{fdate(p.date)}</span>
                <span style={{ textAlign: "end", fontWeight: 700, color: "var(--status-success)" }}>{money(p.amount)}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>{p.invoiceNo}</span>
                <span style={{ textAlign: "end", fontSize: 12, color: "var(--text-muted)" }}>{p.bank ? t(p.bank) : "—"}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-subtle)", alignSelf: "center" }}>{p.receiptNo}</span>
                <span style={{ textAlign: "end" }}>
                  {p.receiptNo && (
                    <Link href={`/account/receipts/${p.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: 14, background: "#fff", font: "600 12px var(--font-body)", color: "var(--navy-700)", textDecoration: "none" }}>
                      <Icon name="Receipt" size={13} />
                      {t("View payment")}
                    </Link>
                  )}
                </span>
              </div>
            ))}
            {!fin.payments.length && <Empty />}
          </div>
          <SectionTitle>Payment Breakdown by Bank</SectionTitle>
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {byBank.map(([b, v]) => (
                <div key={b}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>{t(b)}</span>
                    <span style={{ fontWeight: 700 }}>{money(v)}</span>
                  </div>
                  <div style={{ height: 6, background: "var(--gray-100)", borderRadius: 3 }}>
                    <div style={{ width: `${(v / maxB) * 100}%`, height: 6, borderRadius: 3, background: "var(--navy-700)" }} />
                  </div>
                </div>
              ))}
              {!byBank.length && <Empty />}
            </div>
          </Card>
          <SectionTitle>Recent Activity</SectionTitle>
          <Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {recent.map((r) => (
                <div key={r.a + r.d} style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: r.c, marginTop: 1 }}>
                    <Icon name={r.icon} size={18} />
                  </span>
                  <div>
                    <div style={{ font: "600 13px var(--font-body)", color: "var(--text-strong)" }}>{r.a}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{r.b}</div>
                  </div>
                </div>
              ))}
              {!recent.length && <Empty />}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
