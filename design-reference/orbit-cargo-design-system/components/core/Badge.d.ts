import { ReactNode, CSSProperties } from 'react';
/** Compact uppercase status label. Use for shipment status. */
export interface BadgeProps { tone?: 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info'; dot?: boolean; children?: ReactNode; style?: CSSProperties; }
export declare function Badge(props: BadgeProps): JSX.Element;
