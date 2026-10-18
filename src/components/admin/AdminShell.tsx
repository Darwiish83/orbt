"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/ui/primitives";
import { useT } from "@/i18n/I18nProvider";
import { LangToggle } from "@/i18n/LangToggle";
import { ADMIN_NAV } from "./adminNav";

/**
 * Navy admin shell: 248px sidebar + 68px topbar, matching the design system.
 * Presentational in Phase 1 (no auth/role gating yet). The active item shows
 * the orange inset bar; mobile collapses the sidebar behind a menu button.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  const activeKey =
    ADMIN_NAV.find((i) => pathname === i.href || pathname.startsWith(i.href + "/"))?.key ?? "dashboard";

  const title = ADMIN_NAV.find((i) => i.key === activeKey)?.label ?? "Dashboard";

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--surface-page)" }}>
      {/* Sidebar */}
      <aside
        data-open={navOpen}
        style={{
          width: 248,
          flex: "none",
          background: "var(--navy-700)",
          display: "flex",
          flexDirection: "column",
          padding: "18px 12px",
          gap: 2,
          overflowY: "auto",
        }}
      >
        <div style={{ padding: "4px 12px 14px" }}>
          <Image
            src="/brand/orbit-logo-reversed.png"
            alt="OrbitCargo"
            width={132}
            height={34}
            style={{ height: 34, width: "auto" }}
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
        {ADMIN_NAV.map((item) => {
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
              }}
            >
              <Icon name={item.icon} size={18} color={on ? "var(--orange-400)" : "currentColor"} />
              {t(item.label)}
            </Link>
          );
        })}
      </aside>

      {/* Main column */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
          style={{
            height: 68,
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 24px",
            background: "#fff",
            borderBottom: "1px solid var(--border-default)",
          }}
        >
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
          <LangToggle />
        </header>
        <main style={{ flex: 1, minWidth: 0, padding: 32 }}>
          <div style={{ maxWidth: "var(--container-max)", margin: "0 auto" }}>{children}</div>
        </main>
      </div>
    </div>
  );
}
