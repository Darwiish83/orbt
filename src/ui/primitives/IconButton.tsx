"use client";

import { useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";

export type IconButtonVariant = "ghost" | "outline" | "primary" | "secondary";
export type IconButtonSize = "s" | "m" | "l";

const D: Record<IconButtonSize, number> = { s: 32, m: 40, l: 48 };

// [background, hover background, foreground, border]
const V: Record<IconButtonVariant, [string, string, string, string]> = {
  ghost: ["transparent", "var(--gray-100)", "var(--navy-700)", "transparent"],
  outline: ["#fff", "var(--navy-50)", "var(--navy-700)", "var(--border-strong)"],
  primary: ["var(--action-primary)", "var(--action-primary-hover)", "#fff", "transparent"],
  secondary: ["var(--action-secondary)", "var(--action-secondary-hover)", "#fff", "transparent"],
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  /** Accessible name (also used as the native tooltip). Required. */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  style?: CSSProperties;
}

/** Square icon-only button. */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "m",
  type = "button",
  style,
  ...rest
}: IconButtonProps) {
  const [h, setH] = useState(false);
  const d = D[size];
  const [bg, hb, fg, bd] = V[variant];
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      {...rest}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        width: d,
        height: d,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: h ? hb : bg,
        color: fg,
        border: `1px solid ${bd}`,
        borderRadius: "var(--radius-s)",
        cursor: "pointer",
        padding: 0,
        transition: "background var(--dur-fast)",
        ...style,
      }}
    >
      {icon}
    </button>
  );
}
