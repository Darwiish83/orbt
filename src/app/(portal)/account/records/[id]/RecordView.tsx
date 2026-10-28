"use client";

import Link from "next/link";
import { useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { StatusBadge, INVOICE_STATUS_LABEL, SHIPMENT_STATUS_LABEL } from "@/ui/kit";
import { Icon, Tabs } from "@/ui/primitives";
import { fdate, money } from "@/ui/format";
import type { myProfile, myShipment } from "@/modules/portal/customerApp";
import { Card, Empty, measureLabel, NavyCard, packagesLabel, Row } from "../../ui";

type Data = Awaited<ReturnType<typeof myShipment>>;
type Me = Awaited<ReturnType<typeof myProfile>>;

/** Record detail (design customer-app/Records.jsx RecordDetail). */
export function RecordView({ d, me }: { d: Data; me: Me }) {
  const t = useT();
  const [tab, setTab] = useState("overview");
  const s = d.shipment;
  const air = s.mode === "AIR";
  return (
    <>
      <NavyCard overline="Shipment No." right={<StatusBadge status={SHIPMENT_STATUS_LABEL[s.status]} />}>
        <div style={{ font: "600 18px var(--font-mono)" }}>{s.code}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {(
            [
              ["Paid", d.invoice?.paid ?? "0", "#3DDC97"],
              ["Remaining", d.invoice?.balance ?? "0", "var(--orange-400)"],
            ] as const
          ).map(([l, v, c]) => (
            <div key={l} style={{ background: "rgba(255,255,255,.08)", borderRadius: "var(--radius-m)", padding: 10 }}>
              <div style={{ fontSize: 11, color: "var(--navy-300)" }}>{t(l)}</div>
              <div style={{ font: "800 18px var(--font-display)", color: c }}>{money(v)}</div>
            </div>
          ))}
        </div>
      </NavyCard>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "overview", label: t("Overview") },
          { value: "documents", label: t("Documents"), count: d.documents.length },
          { value: "transactions", label: t("Transactions"), count: d.payments.length },
        ]}
      />
      {tab === "overview" && (
        <>
          <Card title="Shipment information">
            <Row label="Type" value={t(air ? "Air Cargo" : "Sea Cargo")} />
            <Row label="Origin" value={`${s.originCity ?? ""} ${t(s.originCountry)}`.trim()} />
            <Row label="Destination" value={`${s.destCity ?? s.destCode ?? ""} ${t(s.destCountry ?? "Somalia")}`.trim()} />
            <Row label="Date" value={s.shipDate ? fdate(s.shipDate) : "—"} />
            <Row label="Arrival" value={s.arrivedAt ? fdate(s.arrivedAt) : s.arrivalDate ? fdate(s.arrivalDate) : "—"} />
            <Row label="Packages" value={packagesLabel(s, t)} />
            <Row label={air ? "Weight" : "CBM"} value={measureLabel(s)} />
            <Row
              label="Invoice"
              value={
                d.invoice ? (
                  <Link href={`/account/invoices/${d.invoice.id}`} style={{ color: "var(--navy-700)" }}>
                    {d.invoice.number}
                  </Link>
                ) : (
                  "—"
                )
              }
              mono
            />
            {d.invoice && <Row label="Status" value={<StatusBadge status={INVOICE_STATUS_LABEL[d.invoice.status]} />} />}
          </Card>
          <Card title="Customer information">
            <Row label="Full Name" value={me.name} />
            <Row label="Customer Reference" value={me.ref} mono />
            <Row label="Phone Number" value={me.phone ?? "—"} />
            <Row label="Location" value={me.location ?? "—"} />
          </Card>
        </>
      )}
      {tab === "documents" &&
        (d.documents.length ? (
          d.documents.map((doc) => (
            <Card key={doc.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ color: "var(--red-600)" }}>
                  <Icon name="FileText" size={22} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "600 13px var(--font-body)", color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.filename}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{fdate(doc.date)}</div>
                </div>
                <a href={`/api/documents/${doc.id}/download`} aria-label={t("Download")} style={{ width: 34, height: 34, borderRadius: "var(--radius-s)", border: "1px solid var(--border-strong)", color: "var(--navy-700)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="Download" size={15} />
                </a>
              </div>
            </Card>
          ))
        ) : (
          <Empty />
        ))}
      {tab === "transactions" && (
        <Card title="Transaction history">
          {d.payments.length ? (
            d.payments.map((p) => (
              <Link key={p.id} href={`/account/receipts/${p.id}`} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border-default)", fontSize: 13, color: "inherit", textDecoration: "none" }}>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text-strong)" }}>{p.bank ? t(p.bank) : "—"}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {p.receiptNo} · {fdate(p.date)}
                  </div>
                </div>
                <b style={{ color: "var(--status-success)" }}>{money(p.amount)}</b>
              </Link>
            ))
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("No payments yet")}</div>
          )}
        </Card>
      )}
    </>
  );
}
