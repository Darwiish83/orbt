import { CSSProperties } from 'react';
/** Lucide icon (CDN, 2px stroke) rendered via CSS mask so it inherits currentColor. */
export interface IconProps { /** Lucide icon name, kebab-case e.g. "truck", "package-check" */ name: string; size?: number; color?: string; style?: CSSProperties; }
export declare function Icon(props: IconProps): JSX.Element;
