"use client";

/* eslint-disable @next/next/no-img-element -- brand logo */
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { useI18n, useT } from "@/i18n/I18nProvider";
import { Seg, StatusBadge, CUSTOMER_STATUS_LABEL } from "@/ui/kit";
import { Badge, Button, Dialog, Icon, Input, type IconName } from "@/ui/primitives";
import type { myProfile } from "@/modules/portal/customerApp";
import { Card, Row, SectionTitle } from "../ui";
import { updateProfileAction } from "./actions";

type Me = Awaited<ReturnType<typeof myProfile>>;

/** Profile (design customer-app/Profile.jsx). */
export function ProfileView({ me, onLogout }: { me: Me; onLogout: () => void | Promise<void> }) {
  const t = useT();
  const { lang, setLang } = useI18n();
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [out, setOut] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [v, setV] = useState({ name: me.name, company: me.company ?? "", location: me.location ?? "", cargoCategory: me.cargoCategory ?? "" });
  const initials = me.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const line = ({ icon, label, right, onClick, danger }: { icon: IconName; label: string; right?: ReactNode; onClick?: () => void; danger?: boolean }) => (
    <div
      key={label}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border-default)", cursor: onClick ? "pointer" : "default", color: danger ? "var(--status-danger)" : "var(--text-strong)" }}
    >
      <span style={{ width: 32, height: 32, flex: "none", borderRadius: "var(--radius-s)", background: danger ? "var(--status-danger-bg)" : "var(--navy-50)", color: danger ? "var(--status-danger)" : "var(--navy-700)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={16} />
      </span>
      <span style={{ flex: 1, font: "600 14px var(--font-body)" }}>{t(label)}</span>
      {right !== undefined ? right : <Icon name="ChevronRight" size={16} color="var(--gray-400)" />}
    </div>
  );
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ width: 60, height: 60, flex: "none", borderRadius: 30, background: "var(--navy-700)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", font: "800 20px var(--font-display)", boxShadow: "0 0 0 3px #fff, 0 0 0 5px var(--orange-500)" }}>{initials}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: "700 18px/1.2 var(--font-display)", color: "var(--text-strong)" }}>{me.name}</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{me.company}</div>
        </div>
      </div>
      <SectionTitle
        action={
          <Button size="s" variant="outline" leadingIcon={<Icon name="Pencil" size={14} />} onClick={() => setEdit(true)} data-testid="edit-profile">
            {t("Edit Profile")}
          </Button>
        }
      >
        Customer Information
      </SectionTitle>
      <Card>
        <Row label="Full Name" value={me.name} />
        <Row label="Customer Reference" value={me.ref} mono />
        <Row label="Company" value={me.company ?? "—"} />
        <Row label="Phone Number" value={me.phone ?? "—"} />
        <Row label="Email" value={me.email ?? "—"} />
        <Row label="Location" value={me.location ?? "—"} />
        <Row label="Cargo Category" value={me.cargoCategory ?? "—"} />
        <Row label="Status" value={<StatusBadge status={CUSTOMER_STATUS_LABEL[me.status]} />} />
        <Row label="Customer Level" value={me.levelName} strong />
      </Card>
      <SectionTitle>Settings</SectionTitle>
      <Card pad={0}>
        <div style={{ padding: "0 14px" }}>
          {line({
            icon: "Languages",
            label: "Language",
            right: (
              <Seg
                size="s"
                options={[
                  ["so", "Somali"],
                  ["en", "English"],
                  ["ar", "Arabic"],
                ]}
                value={lang}
                onChange={(l) => setLang(l as typeof lang)}
              />
            ),
          })}
          {line({ icon: "UserPen", label: "Edit Profile", onClick: () => setEdit(true) })}
        </div>
      </Card>
      <SectionTitle>Account Security</SectionTitle>
      <Card pad={0}>
        <div style={{ padding: "0 14px" }}>
          {line({
            icon: "MailCheck",
            label: "Email Verification",
            right: (
              <Badge tone="success" dot>
                {t("Verified")}
              </Badge>
            ),
          })}
          {line({ icon: "LogOut", label: "Logout", danger: true, onClick: () => setOut(true), right: null })}
        </div>
      </Card>
      <div style={{ textAlign: "center", padding: "10px 0 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <img src="/brand/orbit-logo.png" alt="Orbit Cargo & Logistics" style={{ height: 30, opacity: 0.9 }} />
        <div style={{ font: "700 12px var(--font-body)", color: "var(--text-strong)" }}>Orbit Cargo &amp; Logistics</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Orbit Cargo ERP • Customer App</div>
      </div>

      {edit && (
        <Dialog
          open
          onClose={() => setEdit(false)}
          title={t("Edit Profile")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEdit(false)}>
                {t("Cancel")}
              </Button>
              <Button
                disabled={pending}
                data-testid="save-profile"
                onClick={() =>
                  start(async () => {
                    setError(null);
                    const r = await updateProfileAction(v);
                    if (!r.ok) return setError(r.error ?? "Error");
                    setEdit(false);
                    router.refresh();
                  })
                }
              >
                {t("Save")}
              </Button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Input label={t("Customer Reference")} value={me.ref} disabled hint={t("Customer Reference cannot be changed")} />
            <Input label={`${t("Full Name")} *`} value={v.name} onChange={(e) => setV((o) => ({ ...o, name: e.target.value }))} />
            <Input label={`${t("Company")} *`} value={v.company} onChange={(e) => setV((o) => ({ ...o, company: e.target.value }))} />
            <Input label={t("Location")} value={v.location} onChange={(e) => setV((o) => ({ ...o, location: e.target.value }))} />
            <Input label={t("Cargo Category")} value={v.cargoCategory} onChange={(e) => setV((o) => ({ ...o, cargoCategory: e.target.value }))} />
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("To change your phone number or Gmail, contact Orbit support.")}</div>
            {error && (
              <div role="alert" style={{ color: "var(--status-danger)", fontSize: 13 }}>
                {t(error)}
              </div>
            )}
          </div>
        </Dialog>
      )}
      {out && (
        <Dialog
          open
          onClose={() => setOut(false)}
          title={t("Logout")}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOut(false)}>
                {t("Cancel")}
              </Button>
              <form action={onLogout}>
                <Button type="submit" variant="secondary">
                  {t("Logout")}
                </Button>
              </form>
            </>
          }
        >
          <div style={{ fontSize: 14 }}>{t("Are you sure you want to log out?")}</div>
        </Dialog>
      )}
    </>
  );
}
