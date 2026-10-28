"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { Flag, Overline, StatusBadge, SHIPMENT_STATUS_LABEL } from "@/ui/kit";
import { Icon } from "@/ui/primitives";
import { num } from "@/ui/format";
import type { MyShipment } from "@/modules/portal/customerApp";

/** Customer App building blocks (design customer-app/Phone.jsx + Shipments.jsx). */

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  const t = useT();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
      <div style={{ font: "700 15px var(--font-display)", color: "var(--text-strong)" }}>{t(children)}</div>
      {action}
    </div>
  );
}

/** The year the screen shows, kept in the address (?year=). */
export function YearPicker({ year, years }: { year: number; years: number[] }) {
  const t = useT();
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (
    <label style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 10px", border: "1px solid var(--border-default)", borderRadius: "var(--radius-m)", background: "#fff", color: "var(--navy-700)", font: "700 14px var(--font-body)", flex: "none" }}>
      <Icon name="Calendar" size={15} />
      {year}
      <Icon name="ChevronDown" size={14} />
      <select
        aria-label={t("Year")}
        value={year}
        onChange={(e) => {
          const p = new URLSearchParams(params.toString());
          p.set("year", e.target.value);
          router.push(`${path}?${p.toString()}`, { scroll: false });
        }}
        style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Navy summary card with an overline (Home, Finance, Shipment detail). */
export function NavyCard({ overline, right, children }: { overline: string; right?: ReactNode; children: ReactNode }) {
  const t = useT();
  return (
    <div style={{ background: "var(--navy-700)", color: "#fff", borderRadius: "var(--radius-l)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Overline color="var(--orange-400)">{t(overline)}</Overline>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Card({ children, href, pad = 14, title }: { children: ReactNode; href?: string; pad?: number; title?: string }) {
  const t = useT();
  const style = { display: "block", background: "#fff", border: "1px solid var(--border-default)", borderRadius: "var(--radius-l)", boxShadow: "var(--shadow-1)", padding: pad, color: "inherit", textDecoration: "none" } as const;
  const body = (
    <>
      {title && <div style={{ font: "700 15px var(--font-display)", color: "var(--text-strong)", marginBottom: 8 }}>{t(title)}</div>}
      {children}
    </>
  );
  return href ? (
    <Link href={href} style={style}>
      {body}
    </Link>
  ) : (
    <div style={style}>{body}</div>
  );
}

/** "label … value" line inside a card. */
export function Row({ label, value, mono, strong }: { label: string; value: ReactNode; mono?: boolean; strong?: boolean }) {
  const t = useT();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--border-default)", fontSize: 13 }}>
      <span style={{ color: "var(--text-muted)" }}>{t(label)}</span>
      <span style={{ color: "var(--text-strong)", fontWeight: strong ? 800 : 600, fontFamily: mono ? "var(--font-mono)" : undefined, textAlign: "end" }}>{value}</span>
    </div>
  );
}

export function Empty({ children = "No records found" }: { children?: string }) {
  const t = useT();
  return <div style={{ textAlign: "center", padding: 28, color: "var(--text-muted)", fontSize: 14 }}>{t(children)}</div>;
}

export const measureLabel = (s: Pick<MyShipment, "mode" | "measure">) => (s.mode === "AIR" ? `${num(s.measure, 1)} kg` : `${num(s.measure, 2)} m³`);

export function packagesLabel(s: Pick<MyShipment, "packages" | "mixCount">, t: (k: string) => string) {
  return s.mixCount ? `${s.packages} + ${s.mixCount} ${t("MIX")}` : String(s.packages);
}

export function ShipmentCard({ s }: { s: MyShipment }) {
  const t = useT();
  const air = s.mode === "AIR";
  const dest = s.destCountry ?? "Somalia";
  return (
    <Card href={`/account/shipments/${s.id}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid={`ship-${s.code}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ width: 30, height: 30, borderRadius: "var(--radius-s)", background: air ? "var(--orange-50)" : "var(--navy-50)", color: air ? "var(--orange-600)" : "var(--navy-700)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <Icon name={air ? "Plane" : "Ship"} size={16} />
            </span>
            <span>
              <span style={{ display: "block", font: "600 13px var(--font-mono)", color: "var(--text-strong)", whiteSpace: "nowrap" }}>{s.code}</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t(air ? "Air Cargo" : "Sea Cargo")}</span>
            </span>
          </span>
          <StatusBadge status={SHIPMENT_STATUS_LABEL[s.status]} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Place label="Origin" country={s.originCountry} city={s.originCity} />
          <div style={{ flex: 1, height: 2, background: "repeating-linear-gradient(90deg,var(--orange-500) 0 6px,transparent 6px 10px)", minWidth: 20 }} />
          <Place label="Destination" country={dest} city={s.destCity ?? s.destCode} end />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, paddingTop: 10, borderTop: "1px solid var(--border-default)" }}>
          {(
            [
              [air ? "Weight" : "CBM", measureLabel(s)],
              ["Packages", packagesLabel(s, t)],
            ] as const
          ).map(([l, v]) => (
            <div key={l}>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t(l)}</div>
              <div style={{ font: "700 13px var(--font-body)", color: "var(--text-strong)" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Place({ label, country, city, end }: { label: string; country: string; city: string | null; end?: boolean }) {
  const t = useT();
  return (
    <div style={{ minWidth: 0, textAlign: end ? "end" : "start" }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t(label)}</div>
      <div style={{ font: "700 14px var(--font-body)", color: "var(--text-strong)", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Flag country={country} size={13} />
        {t(country)}
      </div>
      {city && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{city}</div>}
    </div>
  );
}

/** "Download PDF": the browser's print dialog (Save as PDF); the app shell is hidden on paper. */
export function PrintButton({ label = "Download PDF", title }: { label?: string; title?: string }) {
  const t = useT();
  return (
    <button
      type="button"
      className="no-print"
      onClick={() => {
        const before = document.title;
        if (title) document.title = title;
        window.print();
        document.title = before;
      }}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 44, width: "100%", border: "1.5px solid var(--navy-700)", borderRadius: "var(--radius-s)", background: "#fff", color: "var(--navy-700)", font: "700 14px var(--font-body)", cursor: "pointer" }}
    >
      <Icon name="FileDown" size={16} />
      {t(label)}
    </button>
  );
}
