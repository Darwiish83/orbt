import { ReactNode, CSSProperties } from 'react';
/** Square checkbox with label and optional description. */
export interface CheckboxProps { checked?: boolean; onChange?: (checked: boolean) => void; label?: ReactNode; description?: ReactNode; disabled?: boolean; style?: CSSProperties; }
export declare function Checkbox(props: CheckboxProps): JSX.Element;
