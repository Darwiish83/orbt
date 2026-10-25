"use client";

/* eslint-disable @next/next/no-img-element -- brand logo */
import type { CSSProperties, ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { fdate, money, num } from "@/ui/format";
import { SHIPMENT_STATUS_LABEL } from "@/ui/kit";
import type { getAdminReport } from "@/modules/reporting/service";

export type ReportData = Awaited<ReturnType<typeof getAdminReport>>;

export const REPORT_SECTIONS: [ReportData["section"], string][] = [
  ["company", "Company report"],
  ["shipments", "Shipments report"],
  ["operations", "Operations report"],
  ["finance", "Finance report"],
  ["customers", "Customers report"],
];

const INK = "var(--navy-700)";
const th: CSSProperties = { padding: "9px 12px", font: "700 11px var(--font-body)", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-muted)", background: "var(--surface-sunken)", textAlign: "end", whiteSpace: "nowrap", borderBottom: "1px solid var(--border-default)" };
const td: CSSProperties = { padding: "10px 12px", fontSize: 14, textAlign: "end", borderBottom: "1px solid var(--border-default)", color: "var(--text-strong)", whiteSpace: "nowrap" };
const first: CSSProperties = { ...td, textAlign: "start", fontWeight: 600 };
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * The report as a readable document (owner 2026-10-25): a header, the key
 * figures, a short summary, then numbered sections of plain tables. Shared by
 * the Reports page and its printable PDF.
 */
export function ReportBody({ r }: { r: ReportData }) {
  const t = useT();
  const T = r.totals;
  const showShip = r.section !== "finance" && r.section !== "customers";
  const showFin = r.section === "company" || r.section === "finance";
  const showCust = r.section === "company" || r.section === "customers";
  const showCountries = (r.section === "company" || r.section === "finance") && r.byCountry.length > 0;
  const title = t(REPORT_SECTIONS.find((s) => s[0] === r.section)![1]);
  const where = typeof r.countries === "string" ? t("All countries") : r.countries.map((c: string) => t(c)).join(", ");
  const collectedPct = pct(Number(T.collected), Number(T.revenue));
  // Months shown: from the first month with activity to the latest (or this month).
  const now = new Date();
  const active = r.monthly.map((m, i) => (m.air || m.sea || Number(m.revenue) ? i : -1)).filter((i) => i >= 0);
  const upTo = active.length ? (r.year === now.getUTCFullYear() ? Math.max(active.at(-1)!, now.getUTCMonth()) : active.at(-1)!) : -1;
  const months = active.length ? r.monthly.slice(active[0], upTo + 1) : [];
  const monthRev = months.reduce((a, m) => a + Math.round(Number(m.revenue) * 100), 0) / 100;
  const maxRev = Math.max(1, ...months.map((m) => Number(m.revenue)));
  let n = 0;
  const head = (label: string) => {
    n += 1;
    return (
      <h2 style={{ margin: "0 0 10px", display: "flex", alignItems: "center", gap: 10, font: "700 17px var(--font-display)", color: INK }}>
        <span style={{ width: 26, height: 26, borderRadius: 13, background: INK, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", font: "700 13px var(--font-body)" }}>{n}</span>
        {t(label)}
      </h2>
    );
  };

  const figures: [string, string, string?][] = [
    ...(showShip ? ([["Shipments", String(T.shipments), `${T.air} ${t("Air")} · ${T.sea} ${t("Sea")}`]] as [string, string, string][]) : []),
    ...(showFin
      ? ([
          ["Invoiced", money(T.revenue), `${T.invoices} ${t("invoices")}`],
          ["Collected", money(T.collected), `${collectedPct}% ${t("of invoiced")}`],
          ["Outstanding", money(T.outstanding), `${100 - collectedPct}% ${t("still to collect")}`],
        ] as [string, string, string][])
      : []),
    ...(showShip && !showFin
      ? ([
          ["Weight (air)", `${num(T.kg, 1)} KG`],
          ["Volume (sea)", `${num(T.cbm, 2)} CBM`],
          ["Packages", num(T.packages)],
        ] as [string, string][])
      : []),
    ...(showCust && !showShip ? ([["Customers", String(T.customers), `${T.activeCustomers} ${t("active")}`]] as [string, string, string][]) : []),
  ];

  return (
    <article style={{ background: "#fff", border: "1px solid var(--border-default)", borderTop: "4px solid var(--orange-500)", borderRadius: 10, padding: "28px 32px", display: "flex", flexDirection: "column", gap: 26 }}>
      {/* Header */}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", paddingBottom: 18, borderBottom: `2px solid ${INK}` }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <img src="/brand/orbit-logo.png" alt="Orbit Cargo & Logistics" style={{ height: 46, alignSelf: "flex-start" }} />
          <h1 style={{ margin: "8px 0 0", font: "800 26px/1.15 var(--font-display)", color: INK, textTransform: "uppercase", letterSpacing: ".02em" }}>{title}</h1>
          <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
            {t("Business year")} {r.year} · {where}
          </div>
        </div>
        <div style={{ textAlign: "end", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
          <div>
            {t("Prepared")}: <b style={{ color: "var(--text-strong)" }}>{fdate(r.generatedAt)}</b>
          </div>
          <div>{t("All amounts in USD")}</div>
        </div>
      </header>

      {/* Key figures */}
      {figures.length > 0 && (
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 1, background: "var(--border-default)", border: "1px solid var(--border-default)", borderRadius: 10, overflow: "hidden" }}>
          {figures.map(([l, v, sub], i) => (
            <div key={l} style={{ padding: "16px 18px", background: i === 0 ? "var(--surface-brand-tint, #EEF3FA)" : "#fff" }}>
              <div style={{ font: "700 11px var(--font-body)", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-muted)" }}>{t(l)}</div>
              <div style={{ font: "800 24px var(--font-display)", color: l === "Outstanding" && Number(T.outstanding) > 0 ? "var(--red-600)" : INK, marginTop: 4 }}>{v}</div>
              {sub && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
            </div>
          ))}
        </section>
      )}

      {/* Summary in plain words */}
      <section>
        {head("Summary")}
        <ul style={{ margin: 0, paddingInlineStart: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 14, lineHeight: 1.5, color: "var(--text-strong)" }}>
          {showShip && (
            <li>
              <b>{T.shipments}</b> {t("shipments")} ({T.air} {t("air")}, {T.sea} {t("sea")}) · <b>{num(T.kg, 1)}</b> KG · <b>{num(T.cbm, 2)}</b> CBM · <b>{num(T.packages)}</b> {t("packages")}
            </li>
          )}
          {showFin && (
            <li>
              {t("Invoiced")} <b>{money(T.revenue)}</b> {t("on")} {T.invoices} {t("invoices")} · {t("collected")} <b>{money(T.collected)}</b> ({collectedPct}%) · {t("outstanding")} <b style={{ color: Number(T.outstanding) > 0 ? "var(--red-600)" : undefined }}>{money(T.outstanding)}</b>
            </li>
          )}
          {showShip && r.status.some((s) => s.count > 0) && (
            <li>
              {r.status
                .filter((s) => s.count > 0)
                .map((s) => `${s.count} ${t(SHIPMENT_STATUS_LABEL[s.status] ?? s.status).toLowerCase()}`)
                .join(" · ")}
            </li>
          )}
          {showCust && (
            <li>
              <b>{T.customers}</b> {t("customers")} · <b>{T.activeCustomers}</b> {t("active")} · <b>{T.customers - T.activeCustomers}</b> {t("inactive")}
            </li>
          )}
        </ul>
      </section>

      {showShip && (
        <section style={{ breakInside: "avoid" }}>
          {head("Shipments")}
          <Table head={["", "Air", "Sea", "Total"]}>
            <tr>
              <td style={first}>{t("Shipments")}</td>
              <td style={td}>{T.air}</td>
              <td style={td}>{T.sea}</td>
              <td style={{ ...td, fontWeight: 800 }}>{T.shipments}</td>
            </tr>
            <tr>
              <td style={first}>{t("Weight / volume")}</td>
              <td style={td}>{num(T.kg, 1)} KG</td>
              <td style={td}>{num(T.cbm, 2)} CBM</td>
              <td style={{ ...td, color: "var(--text-muted)" }}>—</td>
            </tr>
            <tr>
              <td style={first}>{t("Packages")}</td>
              <td style={td}>{num(T.packagesAir)}</td>
              <td style={td}>{num(T.packagesSea)}</td>
              <td style={{ ...td, fontWeight: 800 }}>{num(T.packages)}</td>
            </tr>
          </Table>
        </section>
      )}

      {showShip && (
        <section style={{ breakInside: "avoid" }}>
          {head("Where the shipments are")}
          <Table head={["Status", "Shipments", "Share"]}>
            {r.status.map((s) => {
              const p = pct(s.count, T.shipments);
              return (
                <tr key={s.status}>
                  <td style={first}>{t(SHIPMENT_STATUS_LABEL[s.status] ?? s.status)}</td>
                  <td style={td}>{s.count}</td>
                  <td style={{ ...td, width: "40%" }}>
                    <Meter value={p} label={`${p}%`} />
                  </td>
                </tr>
              );
            })}
          </Table>
        </section>
      )}

      {showFin && (
        <section style={{ breakInside: "avoid" }}>
          {head("Money")}
          <Table head={["", "Amount", "Share"]}>
            <tr>
              <td style={first}>{t("Invoiced")}</td>
              <td style={{ ...td, fontWeight: 800 }}>{money(T.revenue)}</td>
              <td style={{ ...td, color: "var(--text-muted)" }}>100%</td>
            </tr>
            <tr>
              <td style={first}>{t("Collected")}</td>
              <td style={{ ...td, color: "var(--green-600)", fontWeight: 700 }}>{money(T.collected)}</td>
              <td style={{ ...td, width: "40%" }}>
                <Meter value={collectedPct} label={`${collectedPct}%`} color="var(--green-600)" />
              </td>
            </tr>
            <tr>
              <td style={first}>{t("Outstanding")}</td>
              <td style={{ ...td, color: Number(T.outstanding) > 0 ? "var(--red-600)" : undefined, fontWeight: 700 }}>{money(T.outstanding)}</td>
              <td style={{ ...td, width: "40%" }}>
                <Meter value={100 - collectedPct} label={`${100 - collectedPct}%`} color="var(--red-600)" />
              </td>
            </tr>
          </Table>
        </section>
      )}

      {showCountries && (
        <section style={{ breakInside: "avoid" }}>
          {head("By country")}
          <Table head={["Country", "Shipments", "Invoiced", "Collected", "Outstanding"]}>
            {r.byCountry.map((c) => (
              <tr key={c.country}>
                <td style={first}>{t(c.country)}</td>
                <td style={td}>
                  {c.shipments} <span style={{ color: "var(--text-muted)", fontSize: 12 }}>({c.air} {t("air")} · {c.sea} {t("sea")})</span>
                </td>
                <td style={td}>{money(c.revenue)}</td>
                <td style={{ ...td, color: "var(--green-600)" }}>{money(c.collected)}</td>
                <td style={{ ...td, color: Number(c.outstanding) > 0 ? "var(--red-600)" : undefined }}>{money(c.outstanding)}</td>
              </tr>
            ))}
          </Table>
        </section>
      )}

      {(showShip || showFin) && months.length > 0 && (
        <section style={{ breakInside: "avoid" }}>
          {head("Month by month")}
          <Table head={showShip && showFin ? ["Month", "Air", "Sea", "Invoiced"] : showShip ? ["Month", "Air", "Sea", "Total"] : ["Month", "Invoiced"]}>
            {months.map((m) => (
              <tr key={m.month}>
                <td style={first}>
                  {t(m.month)} {r.year}
                </td>
                {showShip && <td style={{ ...td, color: m.air ? undefined : "var(--text-muted)" }}>{m.air}</td>}
                {showShip && <td style={{ ...td, color: m.sea ? undefined : "var(--text-muted)" }}>{m.sea}</td>}
                {showShip && !showFin && <td style={{ ...td, fontWeight: 700 }}>{m.air + m.sea}</td>}
                {showFin && (
                  <td style={{ ...td, width: showShip ? "38%" : "60%" }}>
                    <Meter value={pct(Number(m.revenue), maxRev)} label={money(m.revenue)} muted={!Number(m.revenue)} />
                  </td>
                )}
              </tr>
            ))}
            <tr>
              <td style={{ ...first, fontWeight: 800 }}>{t("Total")}</td>
              {showShip && <td style={{ ...td, fontWeight: 800 }}>{months.reduce((a, m) => a + m.air, 0)}</td>}
              {showShip && <td style={{ ...td, fontWeight: 800 }}>{months.reduce((a, m) => a + m.sea, 0)}</td>}
              {showShip && !showFin && <td style={{ ...td, fontWeight: 800 }}>{months.reduce((a, m) => a + m.air + m.sea, 0)}</td>}
              {showFin && <td style={{ ...td, fontWeight: 800 }}>{money(monthRev)}</td>}
            </tr>
          </Table>
        </section>
      )}

      {showCust && (
        <section style={{ breakInside: "avoid" }}>
          {head("Customers")}
          <Table head={["", "Customers", "Share"]}>
            {(
              [
                ["Active", T.activeCustomers, "var(--green-600)"],
                ["Inactive", T.customers - T.activeCustomers, "var(--text-muted)"],
              ] as const
            ).map(([l, v, c]) => (
              <tr key={l}>
                <td style={first}>{t(l)}</td>
                <td style={td}>{v}</td>
                <td style={{ ...td, width: "40%" }}>
                  <Meter value={pct(v, T.customers)} label={`${pct(v, T.customers)}%`} color={c} />
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ ...first, fontWeight: 800 }}>{t("Total")}</td>
              <td style={{ ...td, fontWeight: 800 }}>{T.customers}</td>
              <td style={td} />
            </tr>
          </Table>
        </section>
      )}

      <footer style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", paddingTop: 14, borderTop: "1px solid var(--border-default)", fontSize: 12, color: "var(--text-muted)" }}>
        <span>Orbit Cargo &amp; Logistics · {title}</span>
        <span>
          {t("Generated from OrbitCargo on")} {fdate(r.generatedAt)}
        </span>
      </footer>
    </article>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  const t = useT();
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border-default)", borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h || i} style={{ ...th, textAlign: i ? "end" : "start" }}>
                {h && t(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** A thin bar with its value: share of a whole, readable on screen and on paper. */
function Meter({ value, label, color = INK, muted }: { value: number; label: string; color?: string; muted?: boolean }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
      <span style={{ flex: 1, maxWidth: 220, height: 8, borderRadius: 4, background: "var(--gray-100, #EEF0F3)", overflow: "hidden" }}>
        <span style={{ display: "block", width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", background: color, borderRadius: 4 }} />
      </span>
      <span style={{ minWidth: 56, textAlign: "end", fontWeight: 600, color: muted ? "var(--text-muted)" : undefined }}>{label}</span>
    </span>
  );
}
