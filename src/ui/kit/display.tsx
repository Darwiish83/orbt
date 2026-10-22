"use client";

import type { CSSProperties, ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";
import { Badge, Icon, type IconName } from "@/ui/primitives";
import { isoOf } from "./countries";
import { STATUS_TONE } from "./status";

/** Translate plain strings; pass other nodes through untouched. */
function useTx() {
  const t = useT();
  return (v: ReactNode) => (typeof v === "string" ? t(v) : v);
}

/** Country flag image (bundled locally under /flags). Renders nothing if unknown. */
export function Flag({ country, size = 16 }: { country: string | null | undefined; size?: number }) {
  const iso = isoOf(country);
  if (!iso) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG, no optimisation needed
    <img
      src={`/flags/${iso}.svg`}
      alt=""
      style={{
        width: Math.round(size * 1.4),
        height: size,
        objectFit: "cover",
        borderRadius: 2,
        boxShadow: "0 0 0 1px rgba(0,0,0,.12)",
        display: "inline-block",
        verticalAlign: "middle",
        flex: "none",
      }}
    />
  );
}

/** Status pill; `status` is the English display label (see status.ts). */
export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  return (
    <Badge tone={STATUS_TONE[status] ?? "neutral"} dot>
      {t(status)}
    </Badge>
  );
}

/** Small uppercase eyebrow with the orange rule. */
export function Overline({ children, color = "var(--orange-600)" }: { children: ReactNode; color?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        font: "700 10px var(--font-body)",
        letterSpacing: ".14em",
        textTransform: "uppercase",
        color,
      }}
    >
      <span style={{ width: 18, height: 2, background: "var(--orange-500)", flex: "none" }} />
      {children}
    </div>
  );
}

export type StatTone = "navy" | "orange" | "green" | "red" | "amber";

const STAT_TONE: Record<StatTone, [string, string]> = {
  navy: ["var(--navy-50)", "var(--navy-700)"],
  orange: ["var(--orange-50)", "var(--orange-600)"],
  green: ["var(--status-success-bg)", "var(--status-success)"],
  red: ["var(--status-danger-bg)", "var(--status-danger)"],
  amber: ["var(--status-warning-bg)", "var(--status-warning)"],
};

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  icon?: IconName;
  tone?: StatTone;
  sub?: ReactNode;
  compact?: boolean;
}

/** KPI tile. */
export function Stat({ label, value, icon, tone = "navy", sub, compact }: StatProps) {
  const tx = useTx();
  const c = STAT_TONE[tone];
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-l)",
        boxShadow: "var(--shadow-1)",
        padding: compact ? 12 : 16,
        display: "flex",
        flexDirection: "column",
        gap: compact ? 6 : 10,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon && (
          <span
            style={{
              width: compact ? 26 : 32,
              height: compact ? 26 : 32,
              borderRadius: "var(--radius-s)",
              background: c[0],
              color: c[1],
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "none",
            }}
          >
            <Icon name={icon} size={compact ? 14 : 16} />
          </span>
        )}
        <span style={{ font: `500 ${compact ? 11 : 13}px/1.25 var(--font-body)`, color: "var(--text-muted)" }}>
          {tx(label)}
        </span>
      </div>
      <div
        style={{
          font: `800 ${compact ? 20 : 26}px/1.1 var(--font-display)`,
          color: "var(--text-strong)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

/** Label / value row with a hairline divider. */
export function KV({ label, value, mono, strong }: { label: ReactNode; value: ReactNode; mono?: boolean; strong?: boolean }) {
  const tx = useTx();
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "9px 0",
        borderBottom: "1px solid var(--border-default)",
        fontSize: 13,
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>{tx(label)}</span>
      <span
        style={{
          color: "var(--text-strong)",
          fontWeight: strong ? 700 : 600,
          fontFamily: mono ? "var(--font-mono)" : undefined,
          textAlign: "end",
        }}
      >
        {value}
      </span>
    </div>
  );
}

export interface PanelProps {
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  pad?: number;
  style?: CSSProperties;
}

/** White bordered section with optional header row. */
export function Panel({ title, actions, children, pad = 20, style }: PanelProps) {
  const tx = useTx();
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-l)",
        boxShadow: "var(--shadow-1)",
        ...style,
      }}
    >
      {(title || actions) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: `14px ${pad}px`,
            borderBottom: "1px solid var(--border-default)",
          }}
        >
          <div style={{ font: "700 15px var(--font-display)", color: "var(--text-strong)" }}>{tx(title)}</div>
          {actions}
        </div>
      )}
      <div style={{ padding: pad }}>{children}</div>
    </div>
  );
}

export interface BarDatum {
  /** Category label under the bar (e.g. month). */
  m: string;
  [series: string]: number | string;
}

/** Stacked vertical bar chart (display values only). */
export function Bars({ data, h = 160, keys, colors }: { data: BarDatum[]; h?: number; keys: string[]; colors: string[] }) {
  const val = (d: BarDatum, k: string) => (typeof d[k] === "number" ? (d[k] as number) : 0);
  const max = Math.max(1, ...data.map((d) => keys.reduce((a, k) => a + val(d, k), 0)));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: h + 22 }}>
      {data.map((d) => (
        <div key={d.m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <div style={{ width: "100%", maxWidth: 34, height: h, display: "flex", flexDirection: "column-reverse" }}>
            {keys.map((k, i) => (
              <div
                key={k}
                title={`${k}: ${val(d, k)}`}
                style={{
                  height: `${(val(d, k) / max) * h}px`,
                  background: colors[i],
                  borderRadius: i === keys.length - 1 ? "3px 3px 0 0" : 0,
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{d.m}</span>
        </div>
      ))}
    </div>
  );
}

/** Colour key for Bars. */
export function Legend({ items }: { items: [label: string, color: string][] }) {
  const t = useT();
  return (
    <div style={{ display: "flex", gap: 16 }}>
      {items.map(([l, c]) => (
        <span key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
          {t(l)}
        </span>
      ))}
    </div>
  );
}
