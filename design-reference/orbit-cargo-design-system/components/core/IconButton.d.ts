import { ReactNode, CSSProperties, ButtonHTMLAttributes } from 'react';
/** Square icon-only button. Always pass an accessible label. */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { icon: ReactNode; label: string; variant?: 'ghost' | 'outline' | 'primary' | 'secondary'; size?: 's' | 'm' | 'l'; style?: CSSProperties; }
export declare function IconButton(props: IconButtonProps): JSX.Element;
