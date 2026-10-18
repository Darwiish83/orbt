import { prisma } from "@/db/client";
import { requireUser } from "@/modules/authz/session";
import { LangToggle } from "@/i18n/LangToggle";

export const metadata = { title: "Settings" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border-default)" }}>
      <span style={{ color: "var(--text-muted)", fontSize: 14 }}>{label}</span>
      <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const [roleCount, permissionCount] = await Promise.all([prisma.role.count(), prisma.permission.count()]);

  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 24 }}>
      <section
        style={{
          background: "var(--surface-card)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-l)",
          boxShadow: "var(--shadow-1)",
          padding: 20,
        }}
      >
        <div style={{ font: "700 15px var(--font-display)", color: "var(--text-strong)", marginBottom: 8 }}>General</div>
        <Row label="Signed in as" value={user.email} />
        <Row label="Business year" value={new Date().getFullYear()} />
        <Row label="Roles configured" value={roleCount} />
        <Row label="Permissions" value={permissionCount} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
          <span style={{ color: "var(--text-muted)", fontSize: 14 }}>Language</span>
          <LangToggle />
        </div>
      </section>
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
        Business rules for customs, taxes and exchange rates are configurable and await business-owner input (see the
        decisions log). Role permissions are managed under Users &amp; Team.
      </p>
    </div>
  );
}
