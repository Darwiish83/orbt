import { CSSProperties } from 'react';
/** Underline tabs with orange active indicator and optional counts. */
export interface TabsProps { tabs: (string | { value: string; label: string; count?: number })[]; value: string; onChange?: (value: string) => void; style?: CSSProperties; }
export declare function Tabs(props: TabsProps): JSX.Element;
