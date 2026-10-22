"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}

/** Modal dialog with navy scrim and orange top rule. Escape closes it. */
export function Dialog({ open, onClose, title, children, footer, width = 480 }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay-scrim)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 24,
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: "100%",
          background: "#fff",
          borderRadius: "var(--radius-l)",
          boxShadow: "var(--shadow-3)",
          overflow: "hidden",
          borderTop: "4px solid var(--orange-500)",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          outline: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "20px 24px 0",
            flex: "none",
          }}
        >
          <div id={titleId} style={{ font: "700 19px/1.25 var(--font-display)", color: "var(--text-strong)" }}>
            {title}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{
              border: 0,
              background: "none",
              cursor: "pointer",
              font: "400 22px/1 var(--font-body)",
              color: "var(--text-muted)",
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            padding: "12px 24px 24px",
            color: "var(--text-body)",
            overflowY: "auto",
            flex: "1 1 auto",
            minHeight: 0,
          }}
        >
          {children}
        </div>
        {footer && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              padding: "16px 24px",
              background: "var(--surface-sunken)",
              borderTop: "1px solid var(--border-default)",
              flex: "none",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
