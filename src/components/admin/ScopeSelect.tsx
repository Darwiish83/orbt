"use client";

import { useTransition } from "react";
import { useT } from "@/i18n/I18nProvider";
import { Flag } from "@/ui/kit";
import { Icon } from "@/ui/primitives";
import { setAdminScopeAction } from "@/app/(admin)/scopeActions";

export interface ScopeOptions {
  year: number;
  country: string;
  years: number[];
  countries: { name: string; iso2: string }[];
}

const box = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  height: 40,
  padding: "0 8px 0 10px",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-m)",
  background: "#fff",
  flex: "none",
} as const;

const select = {
  border: 0,
  background: "transparent",
  font: "700 14px var(--font-body)",
  color: "var(--text-strong)",
  cursor: "pointer",
  outline: 0,
} as const;

/** Top bar Year + Country selectors (spec §1). The server validates the choice. */
export function ScopeSelect({ scope }: { scope: ScopeOptions }) {
  const t = useT();
  const [pending, start] = useTransition();
  return (
    <div className="admin-scope" style={{ display: "flex", gap: 8, opacity: pending ? 0.6 : 1 }}>
      <label style={box} title={t("Year")}>
        <Icon name="Calendar" size={16} color="var(--navy-700)" />
        <select
          aria-label={t("Year")}
          data-testid="scope-year"
          value={scope.year}
          disabled={pending}
          onChange={(e) => start(() => setAdminScopeAction({ year: Number(e.target.value) }))}
          style={select}
        >
          {scope.years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <label style={box} title={t("Country")}>
        <Flag country={scope.country} size={18} />
        <select
          aria-label={t("Country")}
          data-testid="scope-country"
          value={scope.country}
          disabled={pending}
          onChange={(e) => start(() => setAdminScopeAction({ country: e.target.value }))}
          style={select}
        >
          {scope.countries.map((c) => (
            <option key={c.iso2} value={c.name}>
              {t(c.name)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
