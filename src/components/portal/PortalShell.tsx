"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/ui/primitives";
import { useT } from "@/i18n/I18nProvider";
import { LangToggle } from "@/i18n/LangToggle";

const NAV = [
  { href: "/account", label: "Shipments", exact: true },
  { href: "/account/invoices", label: "Invoices", exact: false },
  { href: "/account/documents", label: "Documents", exact: false },
];

export function PortalShell({
  children,
  email,
  onLogout,
}: {
  children: React.ReactNode;
  email: string;
  onLogout: () => void | Promise<void>;
}) {
  const t = useT();
  const pathname = usePathname();
  const isActive = (href: string, exact: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "var(--navy-700)",
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "0 32px",
          height: 68,
        }}
      >
        <Link href="/account" style={{ display: "inline-flex", alignItems: "center" }}>
          <Image src="/brand/orbit-logo-reversed.png" alt="OrbitCargo" width={130} height={34} priority style={{ height: 34, width: "auto" }} />
        </Link>
        <nav style={{ display: "flex", gap: 4, flex: 1 }}>
          {NAV.map((item) => {
            const on = isActive(item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 68,
                  padding: "0 14px",
                  color: on ? "#fff" : "var(--navy-100)",
                  font: `${on ? 700 : 500} 14px var(--font-body)`,
                  textDecoration: "none",
                  boxShadow: on ? "inset 0 -3px 0 var(--orange-500)" : "none",
                }}
              >
                {t(item.label)}
              </Link>
            );
          })}
        </nav>
        <LangToggle dark />
        <form action={onLogout}>
          <button
            type="submit"
            data-testid="portal-logout"
            title={email}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              height: 36,
              padding: "0 12px",
              border: "1px solid rgba(255,255,255,.2)",
              borderRadius: "var(--radius-s)",
              background: "transparent",
              color: "#fff",
              font: "600 13px var(--font-body)",
              cursor: "pointer",
            }}
          >
            <Icon name="LogOut" size={16} color="var(--orange-400)" />
            {t("Logout")}
          </button>
        </form>
      </header>
      <main style={{ flex: 1, padding: "32px", background: "var(--surface-page)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>{children}</div>
      </main>
    </div>
  );
}
