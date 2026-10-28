"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { LANG_LABELS, LANGS } from "@/i18n/config";
import { Flag, KV } from "@/ui/kit";
import { Badge, Button, Icon, IconButton, Input, Switch, type IconName } from "@/ui/primitives";
import type { getSettings, listCountries, listYears } from "@/modules/settings/service";
import { FinBox, ToastHost, useToast } from "@/components/admin/ui";
import { addCountryAction, changePasswordAction, createYearAction, removeCountryAction, saveSettingsAction, setCurrentYearAction } from "./actions";

type Settings = Awaited<ReturnType<typeof getSettings>>;
type Props = {
  settings: Settings;
  years: Awaited<ReturnType<typeof listYears>>;
  countries: Awaited<ReturnType<typeof listCountries>>;
  options: { currencies: string[]; timezones: string[] };
  selectedYear: number | null;
  canWrite: boolean;
  system: { version: string; environment: string; roles: number; permissions: number };
};

const SECTIONS: [string, string, IconName][] = [
  ["company", "Company Profile", "Building2"],
  ["general", "General", "SlidersHorizontal"],
  ["years", "Years", "CalendarRange"],
  ["countries", "Origin countries", "Globe"],
  ["notifications", "Notifications", "Bell"],
  ["security", "Security", "ShieldCheck"],
  ["appearance", "Appearance", "Palette"],
  ["system", "System", "Server"],
];

export function SettingsView(props: Props) {
  return (
    <ToastHost>
      <Inner {...props} />
    </ToastHost>
  );
}

function Inner({ settings, years, countries, options, selectedYear, canWrite, system }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [sec, setSec] = useState("company");
  const [company, setCompany] = useState(settings.company);
  const [general, setGeneral] = useState(settings.general);
  const [notif, setNotif] = useState(settings.notifications);
  const [ny, setNy] = useState(String(Math.max(...years.map((y) => y.year), new Date().getUTCFullYear()) + 1));
  const [nc, setNc] = useState("");
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });

  const act = (p: Promise<{ ok: boolean; error?: string }>, ok: string, msg?: string, then?: () => void) =>
    start(async () => {
      const r = await p;
      if (!r.ok) toast({ tone: "danger", title: r.error ?? "Error" });
      else {
        toast({ tone: "success", title: ok, message: msg });
        then?.();
      }
      router.refresh();
    });
  const save = (section: string, values: Record<string, unknown>) => (
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
      <Button disabled={!canWrite || busy} onClick={() => act(saveSettingsAction(section, values), "Settings saved")}>
        {t("Save")}
      </Button>
    </div>
  );
  const Row = ({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 0", borderBottom: "1px solid var(--border-default)" }}>
      <div>
        <div style={{ font: "600 14px var(--font-body)", color: "var(--text-strong)" }}>{t(label)}</div>
        {desc && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{t(desc)}</div>}
      </div>
      {children}
    </div>
  );
  const sel = { height: 40, padding: "0 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-s)", background: "#fff", font: "400 14px var(--font-body)" } as const;
  const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, font: "700 26px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{t("Settings")}</h1>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>{t("System")}</div>
      </div>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", maxWidth: 260 }}>
          <FinBox pad={8}>
            {SECTIONS.map(([k, l, i]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSec(k)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, height: 40, padding: "0 12px", border: 0, borderRadius: "var(--radius-s)", cursor: "pointer", background: sec === k ? "var(--navy-50)" : "transparent", color: sec === k ? "var(--navy-700)" : "var(--text-body)", font: `${sec === k ? 700 : 500} 14px var(--font-body)`, textAlign: "start", boxShadow: sec === k ? "inset 3px 0 0 var(--orange-500)" : "none" }}
              >
                <Icon name={i} size={16} />
                {t(l)}
              </button>
            ))}
          </FinBox>
        </div>
        <div style={{ flex: "999 1 420px", minWidth: 0 }}>
          <FinBox title={SECTIONS.find((s) => s[0] === sec)![1]}>
            {sec === "company" && (
              <>
                <div style={grid}>
                  {(
                    [
                      ["name", "Company name"],
                      ["email", "Company email"],
                      ["phone", "Company phone"],
                      ["address", "Company address"],
                      ["supportEmail", "Support email"],
                      ["supportPhone", "Support phone"],
                    ] as const
                  ).map(([k, l]) => (
                    <Input key={k} label={t(l)} value={company[k]} readOnly={!canWrite} onChange={(e) => setCompany((o) => ({ ...o, [k]: e.target.value }))} />
                  ))}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>{t("Used on invoices and receipts.")}</div>
                {save("company", company)}
              </>
            )}
            {sec === "general" && (
              <>
                <div style={grid}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, font: "600 13px var(--font-body)" }}>
                    {t("Language")}
                    <div style={{ display: "flex", gap: 6 }}>
                      {LANGS.map((l) => (
                        <Badge key={l} tone="neutral">
                          {LANG_LABELS[l]}
                        </Badge>
                      ))}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>{t("Each person picks a language with the toggle in the top bar.")}</span>
                  </div>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6, font: "600 13px var(--font-body)" }}>
                    {t("Currency")}
                    <select value={general.currency} disabled={!canWrite} onChange={(e) => setGeneral((o) => ({ ...o, currency: e.target.value }))} style={sel}>
                      {options.currencies.map((c) => (
                        <option key={c} value={c}>
                          {c === "USD" ? "USD ($)" : "SOS (Sh)"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 6, font: "600 13px var(--font-body)" }}>
                    {t("Timezone")}
                    <select value={general.timezone} disabled={!canWrite} onChange={(e) => setGeneral((o) => ({ ...o, timezone: e.target.value }))} style={sel}>
                      {options.timezones.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {save("general", general)}
              </>
            )}
            {sec === "years" && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, borderRadius: "var(--radius-l)", background: "var(--navy-700)", color: "#fff", marginBottom: 18, flexWrap: "wrap" }}>
                  <Icon name="CalendarCheck" size={26} color="var(--orange-400)" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "var(--navy-300)" }}>{t("Current year")}</div>
                    <div style={{ font: "850 30px var(--font-display)" }}>{years.find((y) => y.isCurrent)?.year ?? "—"}</div>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--navy-100)", maxWidth: 300 }}>
                    {t("All screens show data for the selected year only.")} {selectedYear ? `${t("You are viewing")} ${selectedYear}.` : ""}
                  </div>
                </div>
                <div style={{ font: "600 13px var(--font-body)", color: "var(--text-strong)", marginBottom: 10 }}>{t("Available years")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {years.map((y) => (
                    <div key={y.year} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", border: "1px solid " + (y.isCurrent ? "var(--navy-700)" : "var(--border-default)"), borderRadius: "var(--radius-m)", background: y.isCurrent ? "var(--navy-50)" : "#fff", flexWrap: "wrap" }}>
                      <span style={{ font: "800 18px var(--font-display)", color: "var(--navy-700)", width: 60 }}>{y.year}</span>
                      <span style={{ flex: 1, fontSize: 13, color: "var(--text-muted)" }}>
                        {y.shipments} {t("shipments")} · {y.customers} {t("customers")}
                      </span>
                      {y.isCurrent ? (
                        <Badge tone="accent" dot>
                          {t("Current year")}
                        </Badge>
                      ) : (
                        canWrite && (
                          <Button size="s" variant="outline" disabled={busy} onClick={() => act(setCurrentYearAction(y.year), "Switched to", String(y.year))}>
                            {t("Make current year")}
                          </Button>
                        )
                      )}
                    </div>
                  ))}
                </div>
                {canWrite && (
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 18, padding: 14, background: "var(--surface-sunken)", borderRadius: "var(--radius-m)", flexWrap: "wrap" }}>
                    <div style={{ width: 160 }}>
                      <Input label={t("Create new year")} value={ny} onChange={(e) => setNy(e.target.value.replace(/\D/g, "").slice(0, 4))} inputStyle={{ fontWeight: 700 }} />
                    </div>
                    <Button leadingIcon={<Icon name="Plus" size={16} />} disabled={ny.length !== 4 || years.some((y) => y.year === Number(ny)) || busy} onClick={() => act(createYearAction(Number(ny)), "Year created", ny, () => setNy(String(Number(ny) + 1)))} data-testid="create-year">
                      {t("Create new year")}
                    </Button>
                    <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: "var(--text-muted)" }}>{t("A new year starts empty. Existing data stays in its own year.")}</div>
                  </div>
                )}
              </>
            )}
            {sec === "countries" && (
              <>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>{t("Countries you ship cargo from. Each country has its own shipment numbers (W-1, C-1…).")}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {countries.map((c) => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid var(--border-default)", borderRadius: "var(--radius-m)" }}>
                      <Flag country={c.name} size={16} />
                      <b style={{ flex: 1, fontSize: 14, color: "var(--text-strong)" }}>{t(c.name)}</b>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                        {c.shipments} {t("shipments")}
                      </span>
                      {c.shipments ? (
                        <span title={t("Has shipments — cannot remove")}>
                          <Icon name="Lock" size={15} color="var(--text-muted)" />
                        </span>
                      ) : (
                        canWrite && <IconButton size="s" variant="ghost" label={t("Remove")} icon={<Icon name="Trash2" size={15} />} onClick={() => act(removeCountryAction(c.id), "Country removed", c.name)} />
                      )}
                    </div>
                  ))}
                </div>
                {canWrite && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (nc.trim()) act(addCountryAction(nc), "Country added", nc, () => setNc(""));
                    }}
                    style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 16, padding: 14, background: "var(--surface-sunken)", borderRadius: "var(--radius-m)", flexWrap: "wrap" }}
                  >
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <Input label={t("Add country")} value={nc} onChange={(e) => setNc(e.target.value)} placeholder="China, UAE, Kenya…" leadingIcon={<Flag country={nc} size={13} />} />
                    </div>
                    <Button type="submit" leadingIcon={<Icon name="Plus" size={16} />} disabled={busy}>
                      {t("Add")}
                    </Button>
                  </form>
                )}
              </>
            )}
            {sec === "notifications" && (
              <>
                {(
                  [
                    ["email", "Email Notifications"],
                    ["shipment", "Shipment Notifications"],
                    ["payment", "Payment Notifications"],
                    ["document", "Document Notifications"],
                    ["announcements", "Customer Announcements"],
                  ] as const
                ).map(([k, l]) => (
                  <Row key={k} label={l}>
                    <Switch checked={notif[k]} disabled={!canWrite} onChange={(x) => setNotif((o) => ({ ...o, [k]: x }))} />
                  </Row>
                ))}
                {save("notifications", notif)}
              </>
            )}
            {sec === "security" && (
              <>
                <div style={{ font: "600 14px var(--font-body)", color: "var(--text-strong)", margin: "18px 0 12px" }}>{t("Change password")}</div>
                <div style={grid}>
                  <Input type="password" autoComplete="current-password" label={t("Current Password")} value={pw.current} onChange={(e) => setPw((o) => ({ ...o, current: e.target.value }))} />
                  <Input type="password" autoComplete="new-password" label={t("New Password")} value={pw.next} onChange={(e) => setPw((o) => ({ ...o, next: e.target.value }))} />
                  <Input type="password" autoComplete="new-password" label={t("Confirm Password")} value={pw.confirm} onChange={(e) => setPw((o) => ({ ...o, confirm: e.target.value }))} />
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>{t("At least 8 characters. You will be asked to log in again.")}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
                  <Button disabled={busy || !pw.current || !pw.next} onClick={() => act(changePasswordAction(pw.current, pw.next, pw.confirm), "Password changed", undefined, () => setPw({ current: "", next: "", confirm: "" }))}>
                    {t("Save")}
                  </Button>
                </div>
              </>
            )}
            {sec === "appearance" && (
              <>
                <div style={{ font: "600 14px var(--font-body)", color: "var(--text-strong)", marginBottom: 10 }}>{t("Theme")}</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ width: 180, padding: 10, border: "2px solid var(--orange-500)", borderRadius: "var(--radius-l)", background: "#fff" }}>
                    <div style={{ height: 70, borderRadius: 6, background: "var(--gray-100)", display: "flex", gap: 6, padding: 6 }}>
                      <span style={{ width: 30, borderRadius: 3, background: "var(--navy-700)" }} />
                      <span style={{ flex: 1, borderRadius: 3, background: "#fff" }} />
                    </div>
                    <div style={{ font: "600 13px var(--font-body)", marginTop: 8 }}>{t("Light")}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>{t("Dark theme and compact layout are not available yet.")}</div>
              </>
            )}
            {sec === "system" && (
              <>
                <KV label="Application" value="Orbit Cargo ERP" />
                <KV label="Version" value={system.version} />
                <KV label="Environment" value={system.environment} />
                <KV label="Database" value="PostgreSQL" />
                <KV label="Roles" value={String(system.roles)} />
                <KV label="Permissions" value={String(system.permissions)} />
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>{t("Every change is saved on the server when you press Save.")}</div>
              </>
            )}
          </FinBox>
        </div>
      </div>
    </div>
  );
}
