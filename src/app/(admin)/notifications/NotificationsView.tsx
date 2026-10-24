"use client";

/* eslint-disable @next/next/no-img-element -- announcement image from the authorized API / local preview */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useT } from "@/i18n/I18nProvider";
import { SearchBox, Seg, Stat, StatusBadge } from "@/ui/kit";
import { Badge, Button, Icon, type IconName } from "@/ui/primitives";
import { fdate } from "@/ui/format";
import type { listNotificationsAdmin } from "@/modules/notifications/announcements";
import { FinBox, ToastHost, useToast } from "@/components/admin/ui";
import { createAnnouncementAction } from "./actions";

type Data = Awaited<ReturnType<typeof listNotificationsAdmin>>;
type Item = Data["items"][number];
type Props = { data: Data; filters: { kind: string; status: string; q: string }; compose: boolean; canWrite: boolean };

const ICON: Record<string, IconName> = { flight: "PlaneTakeoff", container: "Ship", general: "Megaphone", payment: "Banknote", payment_reminder: "BellRing", demurrage: "ReceiptText", demurrage_warning: "TriangleAlert", status: "Truck", shipment: "Package" };
const STATUS: Record<string, string> = { SENT: "Sent", SCHEDULED: "Scheduled", DRAFT: "Draft" };

export function NotificationsView(props: Props) {
  return (
    <ToastHost>
      <Inner {...props} />
    </ToastHost>
  );
}

function Inner({ data, filters, compose, canWrite }: Props) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [nav, startNav] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [sel, setSel] = useState<Item | null>(data.items[0] ?? null);
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === "ALL" || v === "all") p.delete(k);
      else p.set(k, v);
    }
    startNav(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  };
  if (compose && canWrite) return <ScheduleAnnouncement customers={data.stats.customers} back={() => go({ compose: null })} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: nav ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, font: "700 26px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{t("Notifications")}</h1>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{t("Customer announcements and records")}</div>
        </div>
        {canWrite && (
          <Button leadingIcon={<Icon name="Megaphone" size={16} />} onClick={() => go({ compose: "1" })} data-testid="schedule-announcement">
            {t("Schedule Announcement")}
          </Button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
        <Stat icon="Bell" label="All Notifications" value={String(data.stats.all)} />
        <Stat icon="Megaphone" tone="orange" label="Announcements" value={String(data.stats.announcements)} />
        <Stat icon="Clock" label="Scheduled" value={String(data.stats.scheduled)} />
        <Stat icon="ContactRound" tone="green" label="Active Customers" value={String(data.stats.customers)} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Seg
          options={[
            ["all", "All"],
            ["announcements", "Announcements"],
            ["customer", "Customer"],
          ]}
          value={filters.kind}
          onChange={(v) => go({ kind: v, page: null })}
        />
        <select aria-label={t("Status")} value={filters.status} onChange={(e) => go({ status: e.target.value, page: null })} style={{ height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-s)", background: "#fff" }}>
          <option value="ALL">{t("All statuses")}</option>
          <option value="SENT">{t("Sent")}</option>
          <option value="SCHEDULED">{t("Scheduled")}</option>
        </select>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go({ q, page: null });
          }}
        >
          <SearchBox value={q} onChange={setQ} style={{ width: 280, maxWidth: "100%" }} />
        </form>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 360px", minWidth: 0 }}>
          <FinBox pad={0}>
            {data.items.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>{t("No records found")}</div>}
            {data.items.map((n) => {
              const on = sel?.id === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setSel(n)}
                  style={{ display: "flex", gap: 12, alignItems: "flex-start", width: "100%", padding: "12px 14px", border: 0, borderTop: "1px solid var(--border-default)", background: on ? "var(--surface-brand-tint)" : "#fff", textAlign: "start", cursor: "pointer" }}
                >
                  <span style={{ width: 34, height: 34, borderRadius: "var(--radius-s)", background: "var(--navy-50)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    <Icon name={ICON[n.type ?? ""] ?? "Bell"} size={17} color="var(--navy-700)" />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", font: "600 14px var(--font-body)", color: "var(--text-strong)" }}>{t(n.title)}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.message}</span>
                    <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {n.audience === "ALL" ? t("All customers") : n.customer} · {fdate(n.sentAt ?? n.scheduledAt ?? n.createdAt)}
                    </span>
                  </span>
                  <StatusBadge status={STATUS[n.status] ?? n.status} />
                </button>
              );
            })}
          </FinBox>
        </div>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <FinBox title="Selected notification">
            {sel ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sel.hasImage && <img src={`/api/notifications/${sel.id}/image`} alt="" style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 8 }} />}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b style={{ font: "700 17px var(--font-display)" }}>{t(sel.title)}</b>
                  <StatusBadge status={STATUS[sel.status] ?? sel.status} />
                  {sel.audience === "ALL" && <Badge tone="brand">{t("All customers")}</Badge>}
                </div>
                {sel.details.lastDay && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                    <span>
                      {t("Last day")}: <b style={{ color: "var(--red-600)" }}>{fdate(sel.details.lastDay)}</b>
                    </span>
                    <span>
                      {t("Departure date")}: <b>{fdate(sel.details.departureDate)}</b>
                    </span>
                    <span>
                      {t("Origin")}: <b>{sel.details.origin ?? "-"}</b>
                    </span>
                    <span>
                      {t("Destination")}: <b>{sel.details.destination ?? "-"}</b>
                    </span>
                  </div>
                )}
                <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6, color: "var(--text-body)" }}>{sel.message}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  {sel.status === "SCHEDULED" ? `${t("Scheduled")}: ${fdate(sel.scheduledAt)}` : `${t("Sent")}: ${fdate(sel.sentAt ?? sel.createdAt)}`}
                </div>
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>{t("No records found")}</div>
            )}
          </FinBox>
        </div>
      </div>
    </div>
  );
}

const TITLE: Record<string, string> = { AIR: "Ogeysiis Diyaarad", SEA: "Ogeysiis Konteenar", GENERAL: "Ogeysiis Guud" };
const MESSAGE: Record<string, string> = {
  AIR: "Dhammaan macaamiisha Orbit Cargo, waxaan idinla socodsiinaynaa in diyaaradda ay u diri doonto {dest} sida ku cad jadwalka kore. Fadlan alaabtaada keenta ka hor maalinta ugu dambeysa ee qabashada si ay ugu baxdo diyaaradda.",
  SEA: "Dhammaan macaamiisha Orbit Cargo, waxaan idinla socodsiinaynaa in konteenarku u dhoofi doono {dest} sida ku cad jadwalka kore. Fadlan alaabtaada keenta ka hor maalinta ugu dambeysa ee qabashada si ay ugu raacdo konteenarka.",
  GENERAL: "Dhammaan macaamiisha Orbit Cargo, ",
};

function ScheduleAnnouncement({ customers, back }: { customers: number; back: () => void }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [type, setType] = useState<"AIR" | "SEA" | "GENERAL">("AIR");
  const [v, setV] = useState({ title: TITLE.AIR!, message: MESSAGE.AIR!.replace("{dest}", "Muqdisho"), lastDay: "", departureDate: "", origin: "", destination: "Mogadishu", sendAt: "" });
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const set = (k: keyof typeof v, x: string) => setV((o) => ({ ...o, [k]: x }));
  const pick = (k: "AIR" | "SEA" | "GENERAL") => {
    setType(k);
    setV((o) => ({ ...o, title: TITLE[k]!, message: MESSAGE[k]!.replace("{dest}", o.destination === "Mogadishu" ? "Muqdisho" : o.destination) }));
  };
  const dated = type !== "GENERAL";
  const save = () =>
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("type", type);
      for (const [k, x] of Object.entries(v)) if (dated || !["lastDay", "departureDate", "origin", "destination"].includes(k)) fd.set(k, x);
      if (file) fd.set("image", file);
      const r = await createAnnouncementAction(fd);
      if (!r.ok) return setError(r.error);
      toast({ tone: "success", title: r.data?.status === "SCHEDULED" ? "Announcement scheduled" : "Announcement sent", message: `${t("Sent to")} ${customers} ${t("customers")}` });
      back();
      router.refresh();
    });
  const lab = { font: "500 12px var(--font-body)", color: "var(--text-strong)", marginBottom: 6, display: "block" } as const;
  const box = { display: "flex", alignItems: "center", gap: 10, height: 44, padding: "0 12px", border: "1px solid var(--border-strong)", borderRadius: 6, background: "#fff" } as const;
  const inp = { flex: 1, minWidth: 0, border: 0, outline: 0, background: "transparent", font: "400 15px var(--font-body)", color: "var(--text-strong)" } as const;
  const F = (label: string, icon: IconName, k: keyof typeof v, type = "text", req = true) => (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={lab}>
        {t(label)}
        {req ? " *" : ""}
      </span>
      <span style={box}>
        <Icon name={icon} size={16} color="var(--navy-700)" />
        <input type={type} value={v[k]} onChange={(e) => set(k, e.target.value)} style={inp} />
      </span>
    </label>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Button variant="ghost" size="s" leadingIcon={<Icon name="ArrowLeft" size={15} />} onClick={back}>
          {t("Notifications")}
        </Button>
      </div>
      <h1 style={{ margin: 0, font: "700 26px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{t("Schedule Announcement")}</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 460px", minWidth: 0, background: "#fff", border: "1px solid var(--border-default)", borderRadius: "var(--radius-l)", padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
            {(
              [
                ["AIR", "Flight Announcement", "PlaneTakeoff"],
                ["SEA", "Container Announcement", "Ship"],
                ["GENERAL", "General Announcement", "Megaphone"],
              ] as const
            ).map(([k, l, ic]) => {
              const on = type === k;
              return (
                <button key={k} type="button" aria-pressed={on} onClick={() => pick(k)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, height: 48, border: 0, borderRadius: 6, cursor: "pointer", background: on ? "var(--navy-700)" : "var(--surface-brand-tint)", color: on ? "#fff" : "var(--text-strong)", font: `${on ? 700 : 500} 13px var(--font-body)` }}>
                  <Icon name={ic} size={17} />
                  {t(l)}
                </button>
              );
            })}
          </div>
          {F("Title", type === "AIR" ? "PlaneTakeoff" : type === "SEA" ? "Ship" : "Megaphone", "title")}
          {dated && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
              {F("Last day for cargo accept", "Calendar", "lastDay", "date")}
              {F(type === "AIR" ? "Flight date" : "Departure date", "Calendar", "departureDate", "date")}
              {F("Origin", type === "AIR" ? "PlaneTakeoff" : "Ship", "origin")}
              {F("Destination", "MapPin", "destination")}
            </div>
          )}
          <label style={{ display: "block" }}>
            <span style={lab}>{t("Message (Somali)")} *</span>
            <textarea value={v.message} onChange={(e) => set("message", e.target.value)} rows={6} maxLength={4000} style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: "14px 16px", border: "1px solid var(--border-strong)", borderRadius: 6, font: "400 15px/1.6 var(--font-body)", color: "var(--text-strong)", outline: 0 }} />
          </label>
          <div>
            <span style={lab}>
              {t("Image")} ({t("optional")})
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ width: 116, height: 72, borderRadius: 6, background: "var(--surface-brand-tint)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flex: "none" }}>
                {preview ? <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name={type === "AIR" ? "Plane" : type === "SEA" ? "Ship" : "Megaphone"} size={30} color="var(--navy-700)" />}
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 44, padding: "0 18px", border: "1px solid var(--border-strong)", borderRadius: 22, cursor: "pointer", font: "500 14px var(--font-body)", color: "var(--navy-700)" }}>
                <Icon name="Image" size={16} />
                {t("Upload Image")}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ display: "none" }} />
              </label>
              {file && (
                <Button size="s" variant="ghost" onClick={() => setFile(null)}>
                  {t("Remove")}
                </Button>
              )}
            </div>
          </div>
          {F("Send date", "Clock", "sendAt", "date", false)}
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("Sent to every customer. Leave the send date empty to send now; a later date keeps it Scheduled until then.")}</div>
          {error && (
            <div role="alert" style={{ color: "var(--status-danger)", fontSize: 13 }}>
              {t(error)}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={back} disabled={pending}>
              {t("Cancel")}
            </Button>
            <Button leadingIcon={<Icon name="Send" size={16} />} onClick={save} disabled={pending} data-testid="send-announcement">
              {t("Schedule Announcement")}
            </Button>
          </div>
        </div>
        <div style={{ flex: "1 1 320px", minWidth: 0, maxWidth: 420 }}>
          <FinBox title="Preview">
            <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border-default)" }}>
              {preview && <img src={preview} alt="" style={{ width: "100%", maxHeight: 180, objectFit: "cover", display: "block" }} />}
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10, background: "#fff" }}>
                <div style={{ font: "800 18px var(--font-display)", color: "var(--navy-700)" }}>{v.title}</div>
                {dated && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
                    <span>
                      Maalinta ugu dambeysa ee qabashada alaabta: <b style={{ color: "var(--red-600)" }}>{fdate(v.lastDay)}</b>
                    </span>
                    <span>
                      {type === "AIR" ? "Waqtiga Rarista (Flight Date)" : "Waqtiga Dhoofka (Departure Date)"}: <b>{fdate(v.departureDate)}</b>
                    </span>
                    <span>
                      Goobta laga soo tari doono: <b>{v.origin || "-"}</b>
                    </span>
                    <span>
                      Goobta laga geyn doono: <b>{v.destination || "-"}</b>
                    </span>
                  </div>
                )}
                <div lang="so" style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6 }}>
                  {v.message}
                </div>
              </div>
            </div>
          </FinBox>
        </div>
      </div>
    </div>
  );
}
