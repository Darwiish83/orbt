import { CSSProperties, SelectHTMLAttributes } from 'react';
/** Native select styled to match Input. */
export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> { label?: string; hint?: string; error?: string; options: (string | { value: string; label: string })[]; style?: CSSProperties; }
export declare function Select(props: SelectProps): JSX.Element;
