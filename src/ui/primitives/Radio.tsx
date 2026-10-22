"use client";

import type { CSSProperties, ReactNode } from "react";
import { ChoiceText, visuallyHidden } from "./choice";

export interface RadioProps {
  checked?: boolean;
  onChange?: (value: string) => void;
  label?: ReactNode;
  description?: ReactNode;
  name?: string;
  value: string;
  disabled?: boolean;
  style?: CSSProperties;
}

/** Round radio; navy ring with orange dot when selected. */
export function Radio({ checked, onChange, label, description, name, value, disabled, style }: RadioProps) {
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
        type="radio"
        name={name}
        value={value}
        checked={!!checked}
        disabled={disabled}
        onChange={() => onChange?.(value)}
        style={visuallyHidden}
      />
      <span
        aria-hidden="true"
        style={{
          flex: "none",
          width: 18,
          height: 18,
          marginTop: 1,
          borderRadius: 9,
          border: `1.5px solid ${checked ? "var(--navy-700)" : "var(--gray-400)"}`,
          background: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--orange-500)" }} />}
      </span>
      <ChoiceText label={label} description={description} />
    </label>
  );
}
