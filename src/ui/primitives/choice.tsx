import type { CSSProperties, ReactNode } from "react";

/** Shared pieces for Checkbox and Radio (internal). */
export const visuallyHidden: CSSProperties = { position: "absolute", opacity: 0, width: 0, height: 0 };

export function ChoiceText({ label, description }: { label?: ReactNode; description?: ReactNode }) {
  return (
    <span>
      {label && (
        <span style={{ display: "block", font: "500 14px/1.3 var(--font-body)", color: "var(--text-strong)" }}>
          {label}
        </span>
      )}
      {description && (
        <span
          style={{
            display: "block",
            font: "400 13px/1.4 var(--font-body)",
            color: "var(--text-muted)",
            marginTop: 2,
          }}
        >
          {description}
        </span>
      )}
    </span>
  );
}
