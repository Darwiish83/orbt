"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

export interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  style?: CSSProperties;
}

/** On/off toggle for settings (orange when on). */
export function Switch({ checked, onChange, label, disabled, style }: SwitchProps) {
  const labelId = useId();
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        aria-labelledby={label ? labelId : undefined}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        style={{
          width: 36,
          height: 20,
          padding: 2,
          border: 0,
          borderRadius: 10,
          background: checked ? "var(--orange-500)" : "var(--gray-300)",
          cursor: "inherit",
          transition: "background var(--dur-base) var(--ease-out)",
        }}
      >
        <span
          style={{
            display: "block",
            width: 16,
            height: 16,
            borderRadius: 8,
            background: "#fff",
            boxShadow: "var(--shadow-1)",
            transform: checked ? "translateX(16px)" : "none",
            transition: "transform var(--dur-base) var(--ease-out)",
          }}
        />
      </button>
      {label && (
        <span
          id={labelId}
          onClick={() => !disabled && onChange?.(!checked)}
          style={{ font: "500 14px var(--font-body)", color: "var(--text-strong)" }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
