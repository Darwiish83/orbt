"use client";

import { icons } from "lucide-react";
import type { CSSProperties } from "react";

/** Valid icon names (PascalCase), type-checked against the lucide registry. */
export type IconName = keyof typeof icons;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
}

/**
 * Icon wrapper over lucide-react. Replaces the design system's runtime CDN
 * fetch + dangerouslySetInnerHTML: no network dependency, no raw HTML injection.
 * Default 2px stroke matches the DS.
 *
 * NOTE: this indexes the full `icons` registry, so all icons are bundled.
 * A later performance pass can switch to per-icon code-split imports (tracked
 * in the Phase 1 progress report).
 */
export function Icon({
  name,
  size = 18,
  color = "currentColor",
  strokeWidth = 2,
  style,
  className,
}: IconProps) {
  const Glyph = icons[name];
  return (
    <Glyph
      size={size}
      color={color}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      className={className}
      style={{ flex: "none", ...style }}
    />
  );
}
