"use client";

import { COMPANY } from "@/config/company";
import { useT } from "@/i18n/I18nProvider";
import { Icon, type IconName } from "@/ui/primitives";
import { Card, SectionTitle } from "../ui";

const digits = (p: string) => p.replace(/\D/g, "");
const wa = (phone: string, text: string) => `https://wa.me/${digits(phone)}?text=${encodeURIComponent(text)}`;
const btn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderRadius: 12, font: "700 14px var(--font-body)", textDecoration: "none" } as const;

/** Support (design customer-app/Support.jsx): WhatsApp and call, quick questions, hours, office. */
export function SupportView({ ref_ }: { ref_: string }) {
  const t = useT();
  const base = `${t("Hello Orbit Cargo, my reference is")} ${ref_}.`;
  const topics: [IconName, string][] = [
    ["PackageSearch", "Where is my cargo?"],
    ["ReceiptText", "Question about my invoice"],
    ["Banknote", "I made a payment"],
    ["FileText", "I need my documents"],
    ["MessageCircleQuestion", "Other question"],
  ];
  return (
    <>
      <div style={{ background: "var(--navy-700)", color: "#fff", borderRadius: "var(--radius-l)", padding: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
          <Icon name="Headset" size={22} />
        </span>
        <div>
          <div style={{ font: "700 17px var(--font-display)" }}>{t("How can we help?")}</div>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{t("Our team replies on WhatsApp during working hours.")}</div>
        </div>
      </div>
      {COMPANY.phones.map((p) => (
        <Card key={p}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, font: "700 15px var(--font-body)", color: "var(--text-strong)" }}>
              <Icon name="Phone" size={16} color="var(--navy-700)" />
              {p}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <a href={wa(p, base)} target="_blank" rel="noopener" style={{ ...btn, background: "#075E54", color: "#fff" }}>
                <Icon name="MessageCircle" size={18} />
                WhatsApp
              </a>
              <a href={`tel:+${digits(p)}`} style={{ ...btn, background: "#fff", color: "var(--navy-700)", border: "1.5px solid var(--navy-700)" }}>
                <Icon name="Phone" size={16} />
                {t("Call")}
              </a>
            </div>
          </div>
        </Card>
      ))}
      <SectionTitle>Quick questions</SectionTitle>
      <Card pad={0}>
        {topics.map(([ic, l], i) => (
          <a key={l} href={wa(COMPANY.phones[0], `${base} ${t(l)}`)} target="_blank" rel="noopener" style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderTop: i ? "1px solid var(--border-default)" : 0, textDecoration: "none", color: "var(--text-strong)" }}>
            <Icon name={ic} size={18} color="var(--navy-700)" />
            <span style={{ flex: 1, font: "500 14px var(--font-body)" }}>{t(l)}</span>
            <Icon name="ChevronRight" size={16} color="var(--text-muted)" />
          </a>
        ))}
      </Card>
      <SectionTitle>Working hours</SectionTitle>
      <Card>
        {(
          [
            ["Saturday – Thursday", COMPANY.hours],
            ["Friday", "Closed"],
          ] as const
        ).map(([d, h]) => (
          <div key={d} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
            <span style={{ color: "var(--text-muted)" }}>{t(d)}</span>
            <b style={{ color: h === "Closed" ? "var(--red-600)" : "var(--text-strong)" }}>{t(h)}</b>
          </div>
        ))}
      </Card>
      <SectionTitle>Office</SectionTitle>
      <Card>
        <div style={{ display: "flex", gap: 12 }}>
          <Icon name="MapPin" size={18} color="var(--orange-600)" />
          <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--text-body)" }}>
            <b style={{ color: "var(--text-strong)" }}>{COMPANY.name}</b>
            <br />
            {COMPANY.addressLines.map((l) => (
              <span key={l}>
                {l}
                <br />
              </span>
            ))}
            {COMPANY.phones.join(" · ")}
          </div>
        </div>
      </Card>
    </>
  );
}
