"use client";

import {
  useId,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export type InputSize = "s" | "m" | "l";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  leadingIcon?: ReactNode;
  size?: InputSize;
  /** Style for the outer wrapper. */
  style?: CSSProperties;
  /** Style applied to the inner <input>. */
  inputStyle?: CSSProperties;
}

const HEIGHTS: Record<InputSize, string> = {
  s: "var(--control-h-s)",
  m: "var(--control-h-m)",
  l: "var(--control-h-l)",
};

function Label({ children, htmlFor }: { children: ReactNode; htmlFor: string }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block",
        font: "600 13px/1.2 var(--font-body)",
        color: "var(--text-strong)",
        marginBottom: 6,
      }}
    >
      {children}
    </label>
  );
}

function Help({ error, children }: { error: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 6,
        font: "400 12px/1.4 var(--font-body)",
        color: error ? "var(--status-danger)" : "var(--text-muted)",
      }}
    >
      {children}
    </div>
  );
}

export function Input({
  label,
  hint,
  error,
  leadingIcon,
  id,
  size = "m",
  style,
  inputStyle,
  onFocus,
  onBlur,
  disabled,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const reactId = useId();
  const iid = id || reactId;
  const h = HEIGHTS[size];

  return (
    <div style={style}>
      {label && <Label htmlFor={iid}>{label}</Label>}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: h,
          padding: "0 12px",
          background: disabled ? "var(--gray-100)" : "#fff",
          border: `1px solid ${
            error
              ? "var(--status-danger)"
              : focused
                ? "var(--border-focus)"
                : "var(--border-strong)"
          }`,
          borderRadius: "var(--radius-s)",
          boxShadow: focused ? "var(--focus-ring)" : "none",
          color: "var(--text-muted)",
          transition: "box-shadow var(--dur-fast)",
        }}
      >
        {leadingIcon}
        <input
          id={iid}
          disabled={disabled}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            border: 0,
            outline: 0,
            background: "transparent",
            font: "400 15px var(--font-body)",
            color: "var(--text-strong)",
            ...inputStyle,
          }}
        />
      </div>
      {(hint || error) && <Help error={!!error}>{error || hint}</Help>}
    </div>
  );
}
