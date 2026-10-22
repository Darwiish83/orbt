"use client";

import { useId, useState, type CSSProperties, type ReactNode, type SelectHTMLAttributes } from "react";

export type SelectOption = string | { value: string; label: ReactNode };

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options: SelectOption[];
  /** Style for the outer wrapper. */
  style?: CSSProperties;
}

/** Native select styled to match Input. */
export function Select({ label, hint, error, options, id, style, onFocus, onBlur, ...rest }: SelectProps) {
  const [f, setF] = useState(false);
  const autoId = useId();
  const iid = id ?? autoId;
  const helpId = `${iid}-help`;
  return (
    <div style={style}>
      {label && (
        <label
          htmlFor={iid}
          style={{
            display: "block",
            font: "600 13px/1.2 var(--font-body)",
            color: "var(--text-strong)",
            marginBottom: 6,
          }}
        >
          {label}
        </label>
      )}
      <div style={{ position: "relative" }}>
        <select
          id={iid}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? helpId : undefined}
          {...rest}
          onFocus={(e) => {
            setF(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setF(false);
            onBlur?.(e);
          }}
          style={{
            width: "100%",
            appearance: "none",
            height: "var(--control-h-m)",
            padding: "0 36px 0 12px",
            background: "#fff",
            border: `1px solid ${error ? "var(--status-danger)" : f ? "var(--border-focus)" : "var(--border-strong)"}`,
            borderRadius: "var(--radius-s)",
            boxShadow: f ? "var(--focus-ring)" : "none",
            outline: 0,
            font: "400 15px var(--font-body)",
            color: "var(--text-strong)",
            cursor: "pointer",
          }}
        >
          {options.map((o) =>
            typeof o === "string" ? (
              <option key={o}>{o}</option>
            ) : (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ),
          )}
        </select>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            insetInlineEnd: 14,
            top: "50%",
            width: 8,
            height: 8,
            borderRight: "2px solid var(--navy-700)",
            borderBottom: "2px solid var(--navy-700)",
            transform: "translateY(-70%) rotate(45deg)",
            pointerEvents: "none",
          }}
        />
      </div>
      {(hint || error) && (
        <div
          id={helpId}
          style={{
            marginTop: 6,
            font: "400 12px/1.4 var(--font-body)",
            color: error ? "var(--status-danger)" : "var(--text-muted)",
          }}
        >
          {error || hint}
        </div>
      )}
    </div>
  );
}
