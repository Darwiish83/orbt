"use client";

import { useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { SearchBox, Seg } from "@/ui/kit";
import type { MyShipment } from "@/modules/portal/customerApp";
import { Empty, ShipmentCard, YearPicker } from "../ui";

/** My Shipments (design customer-app/Shipments.jsx). */
export function ShipmentsView({ ref_, ships, year, years }: { ref_: string; ships: MyShipment[]; year: number; years: number[] }) {
  const t = useT();
  const [f, setF] = useState("all");
  const [q, setQ] = useState("");
  const rows = ships.filter((s) => (f === "all" || s.mode === f) && (!q || `${s.code} ${s.originCountry} ${s.originCity ?? ""} ${s.destCity ?? ""} ${s.status}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
            {t("Customer Reference")}:<span style={{ font: "700 13px var(--font-mono)", color: "var(--navy-700)" }}>{ref_}</span>
          </div>
          <h1 style={{ margin: "6px 0 0", font: "700 24px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{t("My Shipments")}</h1>
        </div>
        <YearPicker year={year} years={years} />
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="Search tracking number" />
      <Seg
        full
        size="s"
        options={[
          ["all", "All Shipments"],
          ["AIR", "Air Freight", "Plane"],
          ["SEA", "Sea Freight", "Ship"],
        ]}
        value={f}
        onChange={setF}
      />
      {rows.map((s) => (
        <ShipmentCard key={s.id} s={s} />
      ))}
      {!rows.length && <Empty />}
    </>
  );
}
