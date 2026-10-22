"use client";

import { useId, type CSSProperties } from "react";
import { useT } from "@/i18n/I18nProvider";
import { Icon, type IconName } from "@/ui/primitives";

export type SegOption = string | [value: string, label: string, icon?: IconName];

export interface SegProps {
  options: SegOption[];
  value: string;
  onChange: (value: string) => void;
  size?: "s" | "m";
  /** Stretch to the container width with equal segments. */
  full?: boolean;
  "aria-label"?: string;
}

/** Segmented control (pill group). */
export function Seg({ options, value, onChange, size = "m", full, "aria-label": ariaLabel }: SegProps) {
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        display: full ? "flex" : "inline-flex",
        padding: 3,
        background: "var(--gray-100)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-m)",
        gap: 2,
      }}
    >
      {options.map((o) => {
        const [v, l, ic] = Array.isArray(o) ? o : [o, o];
        const on = v === value;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(v)}
            style={{
              flex: full ? 1 : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              border: 0,
              cursor: "pointer",
              padding: size === "s" ? "6px 10px" : "8px 14px",
              borderRadius: "var(--radius-s)",
              font: `${on ? 700 : 500} ${size === "s" ? "12px" : "13px"} var(--font-body)`,
              background: on ? "#fff" : "transparent",
              color: on ? "var(--navy-700)" : "var(--text-muted)",
              boxShadow: on ? "var(--shadow-1)" : "none",
              whiteSpace: "nowrap",
            }}
          >
            {ic && <Icon name={ic} size={14} />}
            {t(l)}
          </button>
        );
      })}
    </div>
  );
}

export interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  name?: string;
  style?: CSSProperties;
}

/** Search input with a leading magnifier. */
export function SearchBox({ value, onChange, placeholder = "Search", name, style }: SearchBoxProps) {
  const t = useT();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 40,
        padding: "0 12px",
        background: "#fff",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-s)",
        color: "var(--text-muted)",
        ...style,
      }}
    >
      <Icon name="Search" size={16} />
      <input
        type="search"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t(placeholder)}
        aria-label={t(placeholder)}
        style={{
          flex: 1,
          minWidth: 0,
          border: 0,
          outline: 0,
          font: "400 14px var(--font-body)",
          color: "var(--text-strong)",
          background: "transparent",
        }}
      />
    </div>
  );
}

export interface DateFieldProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  name?: string;
  min?: string;
  max?: string;
}

/** Labelled native date input (`YYYY-MM-DD`). */
export function DateField({ label, value, onChange, name, min, max }: DateFieldProps) {
  const t = useT();
  const id = useId();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <label htmlFor={id} style={{ font: "600 13px var(--font-body)", color: "var(--text-strong)" }}>
        {t(label)}
      </label>
      <input
        id={id}
        type="date"
        name={name}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        style={{
          height: 40,
          padding: "0 10px",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-s)",
          font: "400 14px var(--font-body)",
          color: "var(--text-strong)",
          background: "#fff",
          minWidth: 0,
        }}
      />
    </div>
  );
}
