"use client";

import type { CSSProperties, ReactNode } from "react";
import { ChoiceText, visuallyHidden } from "./choice";

export interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  name?: string;
  value?: string;
  style?: CSSProperties;
}

/** Square checkbox with label and optional description. */
export function Checkbox({ checked, onChange, label, description, disabled, name, value, style }: CheckboxProps) {
  return (
    <label
      style={{
        position: "relative",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        style={visuallyHidden}
      />
      <span
        aria-hidden="true"
        style={{
          flex: "none",
          width: 18,
          height: 18,
          marginTop: 1,
          borderRadius: "var(--radius-xs)",
          border: `1.5px solid ${checked ? "var(--navy-700)" : "var(--gray-400)"}`,
          background: checked ? "var(--navy-700)" : "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all var(--dur-fast)",
        }}
      >
        {checked && (
          <span
            style={{
              width: 5,
              height: 9,
              borderRight: "2px solid #fff",
              borderBottom: "2px solid #fff",
              transform: "translateY(-1px) rotate(45deg)",
            }}
          />
        )}
      </span>
      <ChoiceText label={label} description={description} />
    </label>
  );
}

