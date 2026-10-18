import { ReactNode, CSSProperties } from 'react';
/** On/off toggle for settings (orange when on). */
export interface SwitchProps { checked?: boolean; onChange?: (checked: boolean) => void; label?: ReactNode; disabled?: boolean; style?: CSSProperties; }
export declare function Switch(props: SwitchProps): JSX.Element;
