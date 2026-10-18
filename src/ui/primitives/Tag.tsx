"use client";

import type { CSSProperties, ReactNode } from "react";

export interface TagProps {
  icon?: ReactNode;
  onRemove?: () => void;
  selected?: boolean;
  children?: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}

export function Tag({ icon, onRemove, selected, children, onClick, style }: TagProps) {
  return (
    <span
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 28,
        padding: "0 10px",
        background: selected ? "var(--navy-700)" : "#fff",
        color: selected ? "#fff" : "var(--text-body)",
        border: `1px solid ${selected ? "var(--navy-700)" : "var(--border-strong)"}`,
        borderRadius: "var(--radius-pill)",
        font: "500 13px/1 var(--font-body)",
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
    >
      {icon}
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label="Remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            border: 0,
            background: "none",
            color: "inherit",
            padding: 0,
            marginLeft: 2,
            cursor: "pointer",
            font: "600 14px/1 var(--font-body)",
            opacity: 0.7,
          }}
        >
          ×
        </button>
      )}
    </span>
  );
}
