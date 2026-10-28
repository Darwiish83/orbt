"use client";

/* eslint-disable @next/next/no-img-element -- brand logos */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/i18n/I18nProvider";
import { LangToggle } from "@/i18n/LangToggle";
import { DeveloperCredit } from "@/components/DeveloperCredit";
import { Icon, type IconName } from "@/ui/primitives";

/**
 * Customer App shell (Phase 13, design customer-app/App.jsx): on a phone an
 * app bar and a bottom navigation; on a computer a navy sidebar and a top
 * bar. Detail screens show a Back button and their own title.
 */
const TABS: [string, string, IconName][] = [
  ["/account", "Home", "House"],
  ["/account/shipments", "Shipments", "Package"],
  ["/account/finance", "Finance", "Wallet"],
  ["/account/profile", "Profile", "UserRound"],
];
const EXTRA: [string, string, IconName][] = [
  ["/account/documents", "Documents", "FolderOpen"],
  ["/account/notifications", "Notifications", "Bell"],
];

/** Title and parent of a screen; a parent means the screen has a Back button. */
function screenOf(path: string): { title: string; back: string | null } {
  if (/^\/account\/shipments\/[^/]+/.test(path)) return { title: "Shipment details", back: "/account/shipments" };
  if (/^\/account\/invoices\/[^/]+/.test(path)) return { title: "Invoice information", back: "/account/finance" };
  if (/^\/account\/records\/[^/]+/.test(path)) return { title: "Record details", back: "/account/documents?tab=records" };
  if (/^\/account\/receipts\/[^/]+/.test(path)) return { title: "My payment", back: "/account/finance?tab=statement" };
  if (path.startsWith("/account/documents/transfer/")) return { title: "Receipt Voucher", back: "/account/documents?tab=transfer" };
  if (path.startsWith("/account/notifications")) return { title: "Notifications", back: "/account" };
  if (path.startsWith("/account/documents")) return { title: "Documents", back: "/account" };
  if (path.startsWith("/account/support")) return { title: "Support", back: "/account" };
  const tab = [...TABS].reverse().find(([href]) => path === href || path.startsWith(href + "/"));
  return { title: tab?.[1] ?? "Home", back: null };
}

export function CustomerShell({ children, me, onLogout }: { children: React.ReactNode; me: { name: string; ref: string; levelName: string }; onLogout: () => void | Promise<void> }) {
  const t = useT();
  const path = usePathname();
  const router = useRouter();
  const { title, back } = screenOf(path);
  const home = path === "/account";
  const active = (href: string) => (href === "/account" ? path === "/account" : path === href || path.startsWith(href + "/") || path.startsWith(href + "?"));
  const bell = (
    <Link href="/account/notifications" aria-label={t("Notifications")} className="cust-bell" data-testid="cust-bell">
      <Icon name="Bell" size={20} />
    </Link>
  );
  return (
    <div className="cust-shell">
      {/* Computer: sidebar */}
      <aside className="cust-side no-print">
        <Link href="/account" style={{ display: "block", margin: "0 0 18px 6px" }}>
          <img src="/brand/orbit-logo-reversed.png" alt="Orbit Cargo & Logistics" style={{ height: 46 }} />
        </Link>
        {TABS.map(([href, l, i]) => (
          <Link key={href} href={href} className="cust-side-item" data-on={active(href) && !back ? "true" : undefined}>
            <Icon name={i} size={18} />
            {t(l)}
          </Link>
        ))}
        <div style={{ height: 1, background: "rgba(255,255,255,.12)", margin: "10px 4px" }} />
        {EXTRA.map(([href, l, i]) => (
          <Link key={href} href={href} className="cust-side-item" data-on={path.startsWith(href) ? "true" : undefined}>
            <Icon name={i} size={18} />
            {t(l)}
          </Link>
        ))}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ padding: 12, borderRadius: "var(--radius-m)", background: "rgba(255,255,255,.06)", color: "#fff" }}>
            <div style={{ font: "600 13px var(--font-body)" }}>{me.name}</div>
            <div style={{ font: "500 11px var(--font-mono)", color: "var(--navy-300)" }}>
              {me.ref} · {me.levelName}
            </div>
          </div>
          <form action={onLogout}>
            <button type="submit" className="cust-side-item" style={{ width: "100%", border: 0, background: "transparent", cursor: "pointer" }} data-testid="portal-logout">
              <Icon name="LogOut" size={18} color="var(--orange-400)" />
              {t("Logout")}
            </button>
          </form>
        </div>
      </aside>

      <div className="cust-main">
        {/* Phone: app bar (navy on Home) — Computer: white top bar */}
        <header className="cust-bar no-print" data-dark={home ? "true" : undefined}>
          {back && (
            <button type="button" aria-label={t("Back")} onClick={() => router.push(back)} className="cust-icon-btn">
              <Icon name="ChevronLeft" size={22} />
            </button>
          )}
          {/* Phone: the main tabs show the logo (white on Home), detail screens their title. */}
          {!back && (
            <span className="cust-bar-logo" style={{ flex: 1, minWidth: 0 }}>
              <img src={home ? "/brand/orbit-logo-reversed.png" : "/brand/orbit-logo.png"} alt="Orbit Cargo & Logistics" style={{ height: 52, display: "block" }} />
            </span>
          )}
          <div className="cust-bar-title" data-tab={!back ? "true" : undefined}>
            {t(title)}
          </div>
          <span className="cust-bar-lang">
            {home ? (
              <>
                <span className="cust-phone-only">
                  <LangToggle dark />
                </span>
                <span className="cust-desk-only">
                  <LangToggle />
                </span>
              </>
            ) : (
              <LangToggle />
            )}
          </span>
          {!path.startsWith("/account/notifications") && bell}
        </header>
        <main className="cust-content">
          <div className="cust-content-inner">{children}</div>
          <footer className="no-print" style={{ padding: "28px 0 8px" }}>
            <DeveloperCredit />
          </footer>
        </main>
        {/* Phone: bottom navigation */}
        <nav className="cust-tabs no-print" aria-label={t("Menu")}>
          {TABS.map(([href, l, i]) => {
            const on = active(href);
            return (
              <Link key={href} href={href} className="cust-tab" data-on={on ? "true" : undefined}>
                <span className="cust-tab-icon">
                  <Icon name={i} size={21} />
                </span>
                {t(l)}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
