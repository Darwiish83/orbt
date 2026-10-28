"use client";

/* eslint-disable @next/next/no-img-element -- announcement image from the private store */
import { useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { Icon, Tabs, type IconName } from "@/ui/primitives";
import { fdate } from "@/ui/format";
import { Card } from "../ui";

export interface Note {
  id: string;
  type: string;
  audience: string;
  title: string;
  message: string;
  at: string;
  details: {
    lastDay?: string;
    departureDate?: string;
    origin?: string | null;
    destination?: string | null;
  } | null;
  image: boolean;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} · ${d.toTimeString().slice(0, 5)}`;
};
const LOOK: Record<string, [IconName, string, string]> = {
  shipment: ["Package", "var(--navy-50)", "var(--navy-700)"],
  payment: ["BadgeCheck", "#E8F6EE", "var(--green-600)"],
  reminder: ["BellRing", "var(--orange-50)", "var(--orange-600)"],
  flight: ["PlaneTakeoff", "var(--orange-50)", "var(--orange-600)"],
  container: ["Ship", "var(--navy-50)", "var(--navy-700)"],
  general: ["Megaphone", "var(--navy-50)", "var(--navy-700)"],
};

/** Notifications (design customer-app/Notifications.jsx). */
export function NotificationsView({ notes }: { notes: Note[] }) {
  const t = useT();
  const mine = notes.filter((n) => n.audience === "CUSTOMER");
  const general = notes.filter((n) => n.audience !== "CUSTOMER" && n.type === "general");
  const flights = notes.filter(
    (n) => n.audience !== "CUSTOMER" && (n.type === "flight" || n.type === "container"),
  );
  const [tab, setTab] = useState("mine");
  const rows = tab === "mine" ? mine : tab === "general" ? general : flights;
  return (
    <>
      <div className="cust-scroll-x">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "mine", label: t("Shipment updates"), count: mine.length },
            { value: "general", label: t("Customer announcements"), count: general.length },
            { value: "flight", label: t("Flight announcements"), count: flights.length },
          ]}
        />
      </div>
      {rows.map((n) => {
        const [ic, bg, fg] = LOOK[n.type] ?? LOOK.general!;
        const d = n.details;
        return (
          <Card key={n.id} pad={n.image ? 0 : 14}>
            {n.image && (
              <img
                src={`/api/notifications/${n.id}/image`}
                alt=""
                style={{
                  display: "block",
                  width: "100%",
                  height: 160,
                  objectFit: "cover",
                  borderRadius: "var(--radius-l) var(--radius-l) 0 0",
                }}
              />
            )}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: n.image ? 14 : 0,
              }}
              data-testid={`note-${n.id}`}
            >
              <div style={{ display: "flex", gap: 10 }}>
                <span
                  style={{
                    width: 36,
                    height: 36,
                    flex: "none",
                    borderRadius: "var(--radius-s)",
                    background: bg,
                    color: fg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name={ic} size={18} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{ font: "700 14px/1.3 var(--font-body)", color: "var(--text-strong)" }}
                  >
                    {t(n.title)}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text-body)",
                      marginTop: 4,
                      lineHeight: 1.45,
                      whiteSpace: "pre-line",
                    }}
                  >
                    {n.message}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      color: "var(--text-muted)",
                      textAlign: "end",
                    }}
                  >
                    {when(n.at)}
                  </div>
                </div>
              </div>
              {d && (d.origin || d.departureDate) && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    padding: 12,
                    background: "var(--surface-sunken)",
                    borderRadius: "var(--radius-m)",
                  }}
                >
                  {(
                    [
                      ["Origin", d.origin],
                      ["Destination", d.destination],
                      ["Last Day", d.lastDay ? fdate(d.lastDay) : null],
                      [
                        n.type === "container" ? "Departure Date" : "Flight Date",
                        d.departureDate ? fdate(d.departureDate) : null,
                      ],
                    ] as const
                  )
                    .filter(([, v]) => v)
                    .map(([l, v]) => (
                      <div key={l}>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t(l)}</div>
                        <div
                          style={{
                            font: "600 13px var(--font-body)",
                            color: l === "Last Day" ? "var(--orange-600)" : "var(--text-strong)",
                          }}
                        >
                          {v}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </Card>
        );
      })}
      {!rows.length && (
        <Card pad={20}>
          <div
            style={{
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Icon name="BellOff" size={22} />
            {t(tab === "mine" ? "No shipment updates yet" : "No records found")}
          </div>
        </Card>
      )}
    </>
  );
}
