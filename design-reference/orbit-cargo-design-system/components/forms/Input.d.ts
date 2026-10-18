import { ReactNode, CSSProperties, InputHTMLAttributes } from 'react';
/** Text field with label, hint, error and leading icon. Orange focus ring. */
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> { label?: string; hint?: string; error?: string; leadingIcon?: ReactNode; size?: 's' | 'm' | 'l'; style?: CSSProperties; inputStyle?: CSSProperties; }
export declare function Input(props: InputProps): JSX.Element;
