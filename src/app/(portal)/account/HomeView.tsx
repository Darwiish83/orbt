"use client";
/* eslint-disable @next/next/no-img-element -- static brand image */

import Link from "next/link";
import { useT } from "@/i18n/I18nProvider";
import { Overline } from "@/ui/kit";
import { Icon, type IconName } from "@/ui/primitives";
import { num } from "@/ui/format";
import type { MyShipment, myProfile } from "@/modules/portal/customerApp";
import { Empty, SectionTitle, ShipmentCard } from "./ui";

type Me = Awaited<ReturnType<typeof myProfile>>;

/** Home (design customer-app/Home.jsx). */
export function HomeView({ me, ships, year }: { me: Me; ships: MyShipment[]; year: number }) {
  const t = useT();
  const kg = ships.filter((s) => s.mode === "AIR").reduce((a, s) => a + Number(s.measure), 0);
  const cbm = ships.filter((s) => s.mode === "SEA").reduce((a, s) => a + Number(s.measure), 0);
  const stats: [IconName, string, string, string][] = [
    ["Package", "Shipments", String(ships.length), "var(--navy-700)"],
    ["PackageCheck", "Arrived", String(ships.filter((s) => s.status === "ARRIVED").length), "var(--status-success)"],
    ["Plane", "Air Freight KG", num(kg, 1), "var(--orange-600)"],
    ["Ship", "Sea Freight CBM", num(cbm, 2), "var(--navy-700)"],
  ];
  const quick: [IconName, string, string][] = [
    ["Package", "Shipments", "/account/shipments"],
    ["ReceiptText", "Invoices", "/account/finance"],
    ["Wallet", "Finance", "/account/finance?tab=statement"],
    ["FolderOpen", "Documents", "/account/documents"],
    ["UserRound", "My Profile", "/account/profile"],
    ["Headset", "Support", "/account/support"],
  ];
  const active = me.status === "ACTIVE";
  return (
    <>
      <div>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("Welcome back")},</div>
        <div style={{ font: "700 22px/1.2 var(--font-display)", color: "var(--text-strong)" }} data-testid="cust-welcome">
          {me.name}
        </div>
      </div>

      <div style={{ background: "var(--navy-700)", color: "#fff", borderRadius: "var(--radius-l)", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Overline color="var(--orange-400)">{t("Customer information")}</Overline>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "700 11px var(--font-body)", color: active ? "#3DDC97" : "var(--orange-400)", letterSpacing: ".06em", textTransform: "uppercase" }}>
            <span style={{ width: 7, height: 7, borderRadius: 4, background: active ? "#3DDC97" : "var(--orange-400)" }} />
            {t(active ? "Active" : "Inactive")}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--navy-300)" }}>{t("Customer Reference")}</div>
            <div style={{ font: "600 18px var(--font-mono)", marginTop: 2 }}>{me.ref}</div>
          </div>
          <div style={{ textAlign: "end" }}>
            <div style={{ fontSize: 12, color: "var(--navy-300)", marginBottom: 4 }}>
              {t("Customer Level")} · {year}
            </div>
            <span style={{ display: "inline-block", padding: "3px 7px", borderRadius: "var(--radius-xs)", background: "var(--orange-500)", font: "800 10px var(--font-body)", letterSpacing: ".06em" }}>{me.levelName}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 6 }}>
        {stats.map(([ic, l, v, c]) => (
          <div key={l} style={{ background: "#fff", border: "1px solid var(--border-default)", borderRadius: "var(--radius-m)", padding: "10px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, textAlign: "center", minWidth: 0 }}>
            <Icon name={ic} size={15} color={c} />
            <div style={{ font: "800 15px/1.1 var(--font-display)", color: "var(--text-strong)", whiteSpace: "nowrap" }}>{v}</div>
            <div style={{ font: "500 10px/1.2 var(--font-body)", color: "var(--text-muted)" }}>{t(l)}</div>
          </div>
        ))}
      </div>

      {/* Banner: the design's port photo under a navy shade, brand line and services */}
      <div style={{ position: "relative", minHeight: 140, borderRadius: "var(--radius-l)", overflow: "hidden", background: "var(--navy-700)", color: "#fff", display: "flex", alignItems: "center", padding: "16px 18px" }}>
        <img src="/brand/home-banner.jpg" alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <span aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(1,27,64,.88) 0%, rgba(1,27,64,.55) 55%, rgba(1,27,64,.15) 100%)" }} />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 850, fontSize: 21, lineHeight: 1.02, textTransform: "uppercase", maxWidth: 230 }}>{t("Your Cargo, Our Priority")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxWidth: 300 }}>
            {(
              [
                ["Plane", "Air Freight"],
                ["Ship", "Sea Freight"],
                ["FileCheck", "Customs Clearance"],
                ["Handshake", "Supplier Services"],
              ] as [IconName, string][]
            ).map(([ic, l]) => (
              <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 7px", borderRadius: 3, background: "rgba(1,46,108,.85)", font: "700 10px var(--font-body)", letterSpacing: ".04em" }}>
                <Icon name={ic} size={12} />
                {t(l)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <SectionTitle>Quick Access</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {quick.map(([i, l, href]) => (
          <Link key={l} href={href} style={{ border: "1px solid var(--border-default)", background: "#fff", borderRadius: "var(--radius-m)", padding: "10px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, font: "600 11px var(--font-body)", color: "var(--text-strong)", textDecoration: "none" }}>
            <span style={{ width: 30, height: 30, borderRadius: "var(--radius-s)", background: "var(--navy-50)", color: "var(--navy-700)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={i} size={16} />
            </span>
            {t(l)}
          </Link>
        ))}
      </div>

      <SectionTitle
        action={
          <Link href="/account/shipments" style={{ fontSize: 13, color: "var(--navy-700)", fontWeight: 600 }}>
            {t("View all")}
          </Link>
        }
      >
        Shipments
      </SectionTitle>
      {ships.slice(0, 2).map((s) => (
        <ShipmentCard key={s.id} s={s} />
      ))}
      {!ships.length && <Empty>You have no shipments yet.</Empty>}
    </>
  );
}
