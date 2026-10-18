import { ReactNode, CSSProperties } from 'react';
/** Dark navy notification with status dot. */
export interface ToastProps { tone?: 'success' | 'info' | 'warning' | 'danger'; title: ReactNode; message?: ReactNode; onClose?: () => void; style?: CSSProperties; }
export declare function Toast(props: ToastProps): JSX.Element;
