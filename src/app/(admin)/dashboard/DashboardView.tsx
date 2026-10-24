"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { Bars, Flag, Legend, Panel, Stat, StatusBadge, SHIPMENT_STATUS_LABEL } from "@/ui/kit";
import { fdate, money, num } from "@/ui/format";
import type { getDashboard } from "@/modules/reporting/dashboard";

type Data = Awaited<ReturnType<typeof getDashboard>>;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TONES: Record<string, string> = { AT_ORIGIN_STORE: "var(--gray-400)", DEPARTED: "var(--amber-600, #D97706)", IN_TRANSIT: "var(--blue-600, #2563EB)", ARRIVED: "var(--navy-700)" };

function Group({ label, children }: { label: string; children: ReactNode }) {
  const t = useT();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ font: "700 11px var(--font-body)", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text-muted)" }}>{t(label)}</div>
      {children}
    </div>
  );
}
const grid = (min = 160) => ({ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))`, gap: 12 }) as const;

function List({ rows, empty = "No records found" }: { rows: { key: string; title: ReactNode; sub: ReactNode; right: ReactNode; href?: string }[]; empty?: string }) {
  const t = useT();
  if (!rows.length) return <div style={{ padding: 16, textAlign: "center", fontSize: 13, color: "var(--text-muted)" }}>{t(empty)}</div>;
  return (
    <div>
      {rows.map((r, i) => {
        const body = (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--border-default)" : "none" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "600 13px var(--font-body)", color: "var(--text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</div>
            </div>
            <div style={{ flex: "none", textAlign: "end" }}>{r.right}</div>
          </div>
        );
        return r.href ? (
          <Link key={r.key} href={r.href} style={{ textDecoration: "none", color: "inherit" }}>
            {body}
          </Link>
        ) : (
          <div key={r.key}>{body}</div>
        );
      })}
    </div>
  );
}

export function DashboardView({ data, scope }: { data: Data | null; scope: { year: number; country: string } | null }) {
  const t = useT();
  if (!data || !scope) {
    return (
      <Panel>
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>{t("No business year or country is assigned to you")}</div>
      </Panel>
    );
  }
  const S = data.shipments;
  const F = data.finance;
  const P = data.payments;
  const maxBank = Math.max(1, ...(P?.byBank.map((b) => Number(b.amount)) ?? [1]));
  const view = (href: string) => (
    <Link href={href} style={{ fontSize: 13 }}>
      {t("View all")}
    </Link>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, font: "700 26px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{t("Dashboard")}</h1>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
          {t(scope.country)} · {t("Business year")} {scope.year}
        </div>
      </div>
      {F && (
        <Group label="Finance">
          <div style={grid()}>
            <Stat icon="ReceiptText" label="Total Revenue" value={money(F.invoiced, 0)} />
            <Stat icon="Banknote" tone="green" label="Total Paid" value={money(F.paid, 0)} />
            <Stat icon="CircleAlert" tone="red" label="Outstanding" value={money(F.outstanding, 0)} />
            <Stat icon="FileText" label="Total Invoices" value={String(F.count)} />
          </div>
        </Group>
      )}
      {S && (
        <Group label="Shipments">
          <div style={grid(150)}>
            <Stat icon="Package" label="Total Shipments" value={String(S.total)} />
            <Stat icon="Plane" tone="orange" label="Air Shipments" value={String(S.air)} />
            <Stat icon="Ship" label="Sea Shipments" value={String(S.sea)} />
            <Stat icon="Weight" tone="orange" label="Total KG" value={num(S.kg)} />
            <Stat icon="Box" label="Total CBM" value={num(S.cbm, 1)} />
            <Stat icon="Boxes" label="Total Packages" value={num(S.packages)} />
          </div>
        </Group>
      )}
      {(data.people.customers !== null || data.people.employees !== null) && (
        <Group label="Customers & Team">
          <div style={grid(150)}>
            {data.people.customers !== null && <Stat icon="ContactRound" label="Total Customers" value={String(data.people.customers)} />}
            {data.people.activeCustomers !== null && <Stat icon="UserCheck" tone="green" label="Active Customers" value={String(data.people.activeCustomers)} />}
            {data.people.customers !== null && data.people.activeCustomers !== null && (
              <Stat icon="UserX" tone="red" label="Inactive Customers" value={String(data.people.customers - data.people.activeCustomers)} />
            )}
            {data.people.employees !== null && <Stat icon="UsersRound" label="Employees" value={`${data.people.activeEmployees} / ${data.people.employees}`} />}
            {data.people.documents !== null && <Stat icon="FolderOpen" label="Documents" value={String(data.people.documents)} />}
          </div>
        </Group>
      )}
      <div style={grid(300)}>
        {F && (
          <Panel title="Revenue Overview" actions={<Legend items={[["Revenue", "var(--navy-700)"]]} />}>
            <Bars data={data.monthly.map((x) => ({ m: t(MONTHS[x.m]!), rev: Number(x.revenue) }))} keys={["rev"]} colors={["var(--navy-700)"]} h={190} />
          </Panel>
        )}
        {S && (
          <Panel title="Shipment Status">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {S.statusCounts.map(({ status, count }) => (
                <div key={status}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <StatusBadge status={SHIPMENT_STATUS_LABEL[status]} />
                    <b style={{ color: "var(--text-strong)" }}>{count}</b>
                  </div>
                  <div style={{ height: 6, background: "var(--gray-100)", borderRadius: 3 }}>
                    <div style={{ width: `${S.total ? (count / S.total) * 100 : 0}%`, height: 6, borderRadius: 3, background: TONES[status] }} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
      <div style={grid(300)}>
        {S && (
          <Panel title="Shipment statistics" actions={<Legend items={[["Air", "var(--orange-500)"], ["Sea", "var(--navy-700)"]]} />}>
            <Bars data={data.monthly.map((x) => ({ m: t(MONTHS[x.m]!), sea: x.sea, air: x.air }))} keys={["sea", "air"]} colors={["var(--navy-700)", "var(--orange-500)"]} h={150} />
          </Panel>
        )}
        {P && (
          <Panel title="Payment Breakdown by Bank">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {P.byBank.map((b) => (
                <div key={b.bank}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                    <span>{t(b.bank)}</span>
                    <b>{money(b.amount, 0)}</b>
                  </div>
                  <div style={{ height: 6, background: "var(--gray-100)", borderRadius: 3 }}>
                    <div style={{ width: `${(Number(b.amount) / maxBank) * 100}%`, height: 6, borderRadius: 3, background: "var(--green-600)" }} />
                  </div>
                </div>
              ))}
              {!P.byBank.length && <List rows={[]} />}
            </div>
          </Panel>
        )}
      </div>
      {S && (
        <Panel title="Recent shipments" pad={0} actions={view("/shipments")}>
          <List
            rows={S.recent.map((r) => ({
              key: r.id,
              href: `/shipments/${r.id}`,
              title: (
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{r.code}</span>
                  <Flag country={r.originCountry} />
                  {r.originCity ?? ""} → {r.destCity ?? "Mogadishu"}
                </span>
              ),
              sub: `${t(r.mode === "AIR" ? "Air Freight" : "Sea Freight")} · ${num(r.packages)} ${t("Packages")} · ${fdate(r.arrivalDate)}`,
              right: (
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <StatusBadge status={SHIPMENT_STATUS_LABEL[r.status]} />
                  {Number(r.amount) > 0 && <b>{money(r.amount, 0)}</b>}
                </span>
              ),
            }))}
          />
        </Panel>
      )}
      <div style={grid(280)}>
        {F && (
          <Panel title="Outstanding invoices" actions={view("/finance")}>
            <List rows={F.owing.map((i) => ({ key: i.id, href: "/finance?tab=reminders", title: i.customer, sub: `${i.number} · ${i.shipment}`, right: <b style={{ color: "var(--status-danger)", fontSize: 13 }}>{money(i.balance)}</b> }))} />
          </Panel>
        )}
        {P && (
          <Panel title="Recent payments" actions={view("/finance?tab=payments")}>
            <List rows={P.recent.map((p) => ({ key: p.id, title: p.customer, sub: `${fdate(p.date)} · ${p.bank ? t(p.bank) : "-"}`, right: <b style={{ color: "var(--status-success)", fontSize: 13 }}>{money(p.amount)}</b> }))} />
          </Panel>
        )}
        {data.notifications && (
          <Panel title="Notifications" actions={view("/notifications")}>
            <List rows={data.notifications.map((n) => ({ key: n.id, href: "/notifications", title: t(n.title), sub: fdate(n.at), right: null }))} />
          </Panel>
        )}
      </div>
    </div>
  );
}
