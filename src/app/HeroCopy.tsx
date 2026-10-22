"use client";

import Link from "next/link";
import { useT } from "@/i18n/I18nProvider";
import { Button, Icon, type IconName } from "@/ui/primitives";

const SERVICES: [IconName, string][] = [
  ["Plane", "Air Freight"],
  ["Ship", "Sea Freight"],
  ["FileCheck", "Customs Clearance"],
  ["Handshake", "Supplier Services"],
];

/**
 * Landing hero copy — the approved brand line from the design system
 * (customer-app login/home), translated EN/SO/AR. The part after the comma is
 * set in orange, matching the DS split-colour headline. Copy names no
 * countries, since the served routes will grow. One login serves customers
 * and staff (the role decides where they land).
 */
export function HeroCopy() {
  const t = useT();
  const line = t("Your Cargo, Our Priority");
  const cut = line.search(/[,،]/);
  const [first, second] = cut > 0 ? [line.slice(0, cut + 1), line.slice(cut + 1)] : [line, ""];

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          font: "700 11px var(--font-body)",
          letterSpacing: ".14em",
          textTransform: "uppercase",
          color: "var(--orange-400)",
          marginBottom: 20,
        }}
      >
        <span style={{ width: 24, height: 2, background: "var(--orange-500)" }} />
        Orbit Cargo &amp; Logistics
      </div>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontVariationSettings: "'wdth' 118",
          fontWeight: 850,
          fontSize: 52,
          lineHeight: 1.02,
          letterSpacing: "-0.01em",
          textTransform: "uppercase",
          margin: 0,
          maxWidth: 820,
        }}
      >
        {first}
        {second && <span style={{ color: "var(--orange-500)" }}>{second}</span>}
      </h1>
      <p
        style={{
          font: "400 17px/1.5 var(--font-body)",
          color: "var(--navy-100)",
          maxWidth: 560,
          margin: "16px 0 18px",
        }}
      >
        {t(
          "Air and sea freight, customs clearance and supplier services — every shipment, invoice and payment in one place.",
        )}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
        {SERVICES.map(([ic, l]) => (
          <span
            key={l}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: "var(--radius-xs)",
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.14)",
              font: "700 12px var(--font-body)",
              letterSpacing: ".04em",
            }}
          >
            <Icon name={ic} size={14} color="var(--orange-400)" />
            {t(l)}
          </span>
        ))}
      </div>
      <Link href="/login">
        <Button size="l" trailingIcon={<Icon name="ArrowRight" size={16} />}>
          {t("Customer & Admin Login")}
        </Button>
      </Link>
    </>
  );
}
