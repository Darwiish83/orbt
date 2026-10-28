"use client";

import { useT } from "@/i18n/I18nProvider";
import { COMPANY } from "@/config/company";
import { Flag, StatusBadge, SHIPMENT_STATUS_LABEL } from "@/ui/kit";
import { Icon, TrackingTimeline } from "@/ui/primitives";
import { fdate } from "@/ui/format";
import type { myShipment } from "@/modules/portal/customerApp";
import { Card, measureLabel, NavyCard, packagesLabel, Row } from "../../ui";

type Data = Awaited<ReturnType<typeof myShipment>>;
const STEP: Record<string, number> = { AT_ORIGIN_STORE: 0, DEPARTED: 1, IN_TRANSIT: 2, ARRIVED: 3 };

/** Shipment details with the 4-step timeline, no AWB (design ShipmentDetail). */
export function ShipmentDetailView({ d, ref_ }: { d: Data; ref_: string }) {
  const t = useT();
  const s = d.shipment;
  const air = s.mode === "AIR";
  const idx = STEP[s.status] ?? 0;
  const dest = s.destCountry ?? "Somalia";
  const events = (
    [
      ["At Origin Store", `${s.originCity ?? t(s.originCountry)} · ${t("warehouse")}`, s.shipDate],
      ["Departed", `${s.originCity ?? ""} ${t(s.originCountry)}`.trim(), s.departedAt],
      ["In Transit", t(air ? "Flight" : "Vessel"), null],
      ["Arrived", `${s.destCity ?? s.destCode ?? ""} ${t(dest)}`.trim(), s.arrivedAt ?? (idx < 3 ? s.arrivalDate : null)],
    ] as [string, string, string | null][]
  ).map(([l, loc, when], i) => ({ title: t(l), location: loc, time: when ? fdate(when) : "", state: (i < idx ? "done" : i === idx ? "current" : "upcoming") as "done" | "current" | "upcoming" }));
  const pct = Math.max(8, (idx / 3) * 100);
  const ask = `${COMPANY.whatsappUrl}?text=${encodeURIComponent(`${t("Hello Orbit Cargo, my reference is")} ${ref_}. ${t("Question about shipment")} ${s.code}.`)}`;
  return (
    <>
      <NavyCard overline="Tracking number" right={<StatusBadge status={SHIPMENT_STATUS_LABEL[s.status]} />}>
        <div style={{ font: "600 18px var(--font-mono)" }}>{s.code}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ font: "800 18px var(--font-display)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Flag country={s.originCountry} size={13} />
              {t(s.originCountry)}
            </div>
            <div style={{ fontSize: 12, color: "var(--navy-300)" }}>{s.originCity ?? ""}</div>
          </div>
          <div style={{ flex: 1, position: "relative", height: 2, background: "rgba(255,255,255,.2)" }}>
            <div style={{ width: `${pct}%`, height: 2, background: "var(--orange-500)" }} />
            <span style={{ position: "absolute", left: `${pct}%`, top: -10, transform: "translateX(-50%)", color: "var(--orange-500)" }}>
              <Icon name={air ? "Plane" : "Ship"} size={20} />
            </span>
          </div>
          <div style={{ textAlign: "end" }}>
            <div style={{ font: "800 18px var(--font-display)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Flag country={dest} size={13} />
              {t(dest)}
            </div>
            <div style={{ fontSize: 12, color: "var(--navy-300)" }}>{s.destCity ?? s.destCode ?? ""}</div>
          </div>
        </div>
      </NavyCard>
      <Card pad={16}>
        <TrackingTimeline events={events} />
      </Card>
      <Card pad={16} title="Shipment details">
        <Row label="Customer Reference" value={ref_} mono />
        <Row label="Shipment" value={s.code} mono />
        <Row label="Type" value={t(air ? "Air Cargo" : "Sea Cargo")} />
        <Row label={air ? "Weight" : "CBM"} value={measureLabel(s)} />
        <Row label="Packages" value={packagesLabel(s, t)} />
        <Row label="Date" value={s.shipDate ? fdate(s.shipDate) : "—"} />
        <Row label="Arrival" value={s.arrivedAt ? fdate(s.arrivedAt) : s.arrivalDate ? fdate(s.arrivalDate) : "—"} />
        {d.invoice && <Row label="Invoice" value={<a href={`/account/invoices/${d.invoice.id}`} style={{ color: "var(--navy-700)" }}>{d.invoice.number}</a>} mono />}
      </Card>
      <a href={ask} target="_blank" rel="noopener" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 12, background: "#075E54", color: "#fff", font: "700 14px var(--font-body)", textDecoration: "none" }}>
        <Icon name="MessageCircle" size={18} />
        {t("Ask about this shipment")}
      </a>
    </>
  );
}
