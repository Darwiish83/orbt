import type { CSSProperties, ReactNode } from "react";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

const T: Record<BadgeTone, [string, string]> = {
  neutral: ["var(--gray-100)", "var(--gray-700)"],
  brand: ["var(--navy-50)", "var(--navy-700)"],
  accent: ["var(--orange-50)", "var(--orange-700)"],
  success: ["var(--status-success-bg)", "var(--status-success)"],
  warning: ["var(--status-warning-bg)", "var(--status-warning)"],
  danger: ["var(--status-danger-bg)", "var(--status-danger)"],
  info: ["var(--status-info-bg)", "var(--status-info)"],
};

export interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Badge({ tone = "neutral", dot, children, style }: BadgeProps) {
  const [bg, fg] = T[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        padding: "0 8px",
        background: bg,
        color: fg,
        borderRadius: "var(--radius-xs)",
        font: "700 11px/1 var(--font-body)",
        letterSpacing: ".06em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: 3, background: fg }} />}
      {children}
    </span>
  );
}
