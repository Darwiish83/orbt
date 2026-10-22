"use client";

import type { CSSProperties, ReactNode } from "react";

export type TabItem = string | { value: string; label: ReactNode; count?: number };

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange?: (value: string) => void;
  style?: CSSProperties;
}

/** Underline tabs with orange active indicator and optional counts. */
export function Tabs({ tabs, value, onChange, style }: TabsProps) {
  return (
    <div
      role="tablist"
      style={{ display: "flex", gap: 24, borderBottom: "1px solid var(--border-default)", ...style }}
    >
      {tabs.map((t) => {
        const id = typeof t === "string" ? t : t.value;
        const lab = typeof t === "string" ? t : t.label;
        const count = typeof t === "string" ? undefined : t.count;
        const on = id === value;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange?.(id)}
            style={{
              position: "relative",
              padding: "12px 0",
              marginBottom: -1,
              border: 0,
              background: "none",
              cursor: "pointer",
              font: `${on ? 700 : 500} 14px/1 var(--font-body)`,
              color: on ? "var(--navy-700)" : "var(--text-muted)",
              borderBottom: `3px solid ${on ? "var(--orange-500)" : "transparent"}`,
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            {lab}
            {count != null && (
              <span
                style={{
                  font: "600 11px/1 var(--font-body)",
                  padding: "3px 6px",
                  borderRadius: "var(--radius-xs)",
                  background: on ? "var(--navy-700)" : "var(--gray-200)",
                  color: on ? "#fff" : "var(--gray-700)",
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
