"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/ui/primitives";
import { useT } from "@/i18n/I18nProvider";
import { LangToggle } from "@/i18n/LangToggle";
import { DeveloperCredit } from "@/components/DeveloperCredit";
import type { AdminNavItem } from "./adminNav";
import { ScopeSelect, type ScopeOptions } from "./ScopeSelect";

/**
 * Navy admin shell: 248px sidebar + 68px topbar. On phones the sidebar becomes
 * an off-canvas drawer opened by the topbar menu button (see globals.css
 * .admin-* rules). Responsive behaviour is CSS-driven (SSR-safe).
 */
export function AdminShell({
  children,
  items,
  userEmail,
  onLogout,
  scope,
}: {
  children: React.ReactNode;
  items: AdminNavItem[];
  userEmail?: string;
  onLogout?: () => void | Promise<void>;
  /** Year + Country selector; omitted when the user has no assigned scope. */
  scope?: ScopeOptions;
}) {
  const t = useT();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const activeKey =
    items.find((i) => pathname === i.href || pathname.startsWith(i.href + "/"))?.key ?? "dashboard";
  const title = items.find((i) => i.key === activeKey)?.label ?? "Dashboard";

  return (
    <div className="admin-shell">
      {/* Scrim (mobile, when the drawer is open) */}
      <div className="admin-scrim" data-open={navOpen} onClick={() => setNavOpen(false)} aria-hidden="true" />

      {/* Sidebar / drawer */}
      <aside className="admin-sidebar" data-open={navOpen}>
        <div style={{ padding: "6px 12px 16px" }}>
          <Image
            src="/brand/orbit-logo-reversed.png"
            alt="OrbitCargo"
            width={210}
            height={54}
            style={{ height: 54, width: "auto", maxWidth: "100%" }}
            priority
          />
        </div>
        <div
          style={{
            font: "700 10px var(--font-body)",
            letterSpacing: ".14em",
            color: "var(--navy-300)",
            margin: "8px 12px 8px",
          }}
        >
          {t("ADMIN PANEL")}
        </div>
        {items.map((item) => {
          const on = item.key === activeKey;
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={() => setNavOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                height: 40,
                padding: "0 12px",
                borderRadius: "var(--radius-s)",
                background: on ? "rgba(255,255,255,.1)" : "transparent",
                color: on ? "#fff" : "var(--navy-100)",
                font: `${on ? 700 : 500} 14px var(--font-body)`,
                boxShadow: on ? "inset 3px 0 0 var(--orange-500)" : "none",
                textDecoration: "none",
                flex: "none",
              }}
            >
              <Icon name={item.icon} size={18} color={on ? "var(--orange-400)" : "currentColor"} />
              {t(item.label)}
            </Link>
          );
        })}

        {/* Account footer */}
        <div style={{ marginTop: "auto", paddingTop: 12 }}>
          {userEmail && (
            <div
              style={{
                font: "500 12px var(--font-mono)",
                color: "var(--navy-300)",
                padding: "0 12px 8px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={userEmail}
            >
              {userEmail}
            </div>
          )}
          {onLogout && (
            <form action={onLogout}>
              <button
                type="submit"
                data-testid="logout-button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  height: 40,
                  padding: "0 12px",
                  border: "1px solid rgba(255,255,255,.18)",
                  borderRadius: "var(--radius-s)",
                  background: "transparent",
                  color: "#fff",
                  font: "600 14px var(--font-body)",
                  cursor: "pointer",
                }}
              >
                <Icon name="LogOut" size={18} color="var(--orange-400)" />
                {t("Logout")}
              </button>
            </form>
          )}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.08)" }}>
            <DeveloperCredit tone="dark" compact />
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="admin-main">
        <header className="admin-topbar">
          <button
            type="button"
            className="admin-menu-btn"
            onClick={() => setNavOpen(true)}
            aria-label={t("Menu")}
            style={{
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-s)",
              background: "#fff",
              cursor: "pointer",
              flex: "none",
            }}
          >
            <Icon name="Menu" size={20} color="var(--navy-700)" />
          </button>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              font: "700 19px var(--font-display)",
              color: "var(--text-strong)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {t(title)}
          </div>
          {scope && <ScopeSelect scope={scope} />}
          <LangToggle />
        </header>
        <main className="admin-content">
          <div style={{ maxWidth: "var(--container-max)", margin: "0 auto" }}>{children}</div>
        </main>
      </div>
    </div>
  );
}
