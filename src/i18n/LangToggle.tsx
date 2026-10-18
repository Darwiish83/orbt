"use client";

import { LANGS, LANG_LABELS } from "./config";
import { useI18n } from "./I18nProvider";

/** Three-way SO / EN / ع toggle, matching the design system's top-bar control. */
export function LangToggle({ dark = false }: { dark?: boolean }) {
  const { lang, setLang } = useI18n();
  // DS order is SO, EN, AR.
  const order = ["so", "en", "ar"] as const;
  return (
    <div
      dir="ltr"
      style={{
        display: "inline-flex",
        padding: 2,
        gap: 1,
        borderRadius: 4,
        background: dark ? "rgba(255,255,255,.12)" : "var(--gray-100)",
        border: dark ? "0" : "1px solid var(--border-default)",
      }}
    >
      {order
        .filter((k) => (LANGS as readonly string[]).includes(k))
        .map((k) => {
          const active = lang === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setLang(k)}
              aria-pressed={active}
              style={{
                border: 0,
                cursor: "pointer",
                padding: "3px 7px",
                minWidth: 26,
                borderRadius: 3,
                font: "700 10px/14px var(--font-body)",
                letterSpacing: ".04em",
                background: active
                  ? dark
                    ? "#fff"
                    : "var(--navy-700)"
                  : "transparent",
                color: active
                  ? dark
                    ? "var(--navy-700)"
                    : "#fff"
                  : dark
                    ? "var(--navy-100)"
                    : "var(--text-muted)",
              }}
            >
              {LANG_LABELS[k]}
            </button>
          );
        })}
    </div>
  );
}
