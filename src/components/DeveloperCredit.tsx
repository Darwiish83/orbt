"use client";

import { useT } from "@/i18n/I18nProvider";

/**
 * Footer credit (owner request 2026-10-28): the company's copyright line and
 * the developer's signature, "Designed & developed by Darwiish.dev". Quiet by
 * design — small type in the page's muted colour, with the signature as the
 * one accent. Shown on the sign-in page, the customer portal, the public pages
 * and the admin sidebar; never on printed invoices or receipts (those are the
 * company's own papers).
 *
 * `tone="dark"` is for navy backgrounds, `tone="light"` for page backgrounds;
 * `compact` drops the copyright line (narrow sidebar).
 */
export function DeveloperCredit({ tone = "light", compact = false }: { tone?: "light" | "dark"; compact?: boolean }) {
  const t = useT();
  const muted = tone === "dark" ? "var(--navy-300)" : "var(--text-muted)";
  const strong = tone === "dark" ? "#fff" : "var(--text-strong)";
  const year = new Date().getFullYear();

  return (
    <div
      data-testid="developer-credit"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        textAlign: "center",
        font: "500 12px/1.5 var(--font-body)",
        color: muted,
      }}
    >
      {!compact && (
        <div>
          © {year} Orbit Cargo &amp; Logistics. {t("All rights reserved.")}
        </div>
      )}
      <div style={{ display: "inline-flex", alignItems: "baseline", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
        <span>{t("Designed & developed by")}</span>{" "}
        {/* The signature reads left-to-right in Arabic too. */}
        <bdi dir="ltr" style={{ font: "700 12px var(--font-body)", letterSpacing: ".02em", color: strong }}>
          Darwiish<span style={{ color: "var(--orange-500)" }}>.dev</span>
        </bdi>
      </div>
    </div>
  );
}
