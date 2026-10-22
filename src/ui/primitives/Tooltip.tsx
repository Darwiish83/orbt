"use client";

import { useId, useState, type ReactNode } from "react";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  placement?: "top" | "bottom";
}

/** Hover/focus tooltip, dark navy. */
export function Tooltip({ content, children, placement = "top" }: TooltipProps) {
  const [o, setO] = useState(false);
  const id = useId();
  const pos = placement === "bottom" ? { top: "100%", marginTop: 8 } : { bottom: "100%", marginBottom: 8 };
  return (
    <span
      aria-describedby={o ? id : undefined}
      onMouseEnter={() => setO(true)}
      onMouseLeave={() => setO(false)}
      onFocus={() => setO(true)}
      onBlur={() => setO(false)}
      style={{ position: "relative", display: "inline-flex" }}
    >
      {children}
      {o && (
        <span
          id={id}
          role="tooltip"
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            ...pos,
            padding: "6px 10px",
            background: "var(--navy-900)",
            color: "#fff",
            font: "500 12px/1.3 var(--font-body)",
            borderRadius: "var(--radius-s)",
            whiteSpace: "nowrap",
            boxShadow: "var(--shadow-2)",
            zIndex: 50,
            pointerEvents: "none",
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
