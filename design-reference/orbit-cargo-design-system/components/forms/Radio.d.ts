import { ReactNode, CSSProperties } from 'react';
/** Round radio; navy ring with orange dot when selected. */
export interface RadioProps { checked?: boolean; onChange?: (value: string) => void; label?: ReactNode; description?: ReactNode; name?: string; value: string; disabled?: boolean; style?: CSSProperties; }
export declare function Radio(props: RadioProps): JSX.Element;
