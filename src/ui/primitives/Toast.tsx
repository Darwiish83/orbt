"use client";

import type { CSSProperties, ReactNode } from "react";

export type ToastTone = "success" | "info" | "warning" | "danger";

const DOT: Record<ToastTone, string> = {
  success: "#3DDC97",
  info: "#6FB0FF",
  warning: "#FFC24D",
  danger: "#FF6B63",
};

export interface ToastProps {
  tone?: ToastTone;
  title: ReactNode;
  message?: ReactNode;
  onClose?: () => void;
  style?: CSSProperties;
}

/** Dark navy notification with status dot. */
export function Toast({ tone = "success", title, message, onClose, style }: ToastProps) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        width: 360,
        maxWidth: "100%",
        padding: "14px 16px",
        background: "var(--navy-900)",
        color: "#fff",
        borderRadius: "var(--radius-m)",
        boxShadow: "var(--shadow-3)",
        ...style,
      }}
    >
      <span
        style={{ flex: "none", width: 8, height: 8, borderRadius: 4, marginTop: 6, background: DOT[tone] }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ font: "700 14px/1.3 var(--font-body)" }}>{title}</div>
        {message && (
          <div style={{ font: "400 13px/1.4 var(--font-body)", color: "var(--navy-300)", marginTop: 2 }}>
            {message}
          </div>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onClose}
          style={{
            border: 0,
            background: "none",
            color: "var(--navy-300)",
            cursor: "pointer",
            font: "400 18px/1 var(--font-body)",
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
