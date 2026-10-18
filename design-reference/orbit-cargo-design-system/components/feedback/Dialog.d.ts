import { ReactNode } from 'react';
/** Modal dialog with navy scrim and orange top rule. */
export interface DialogProps { open: boolean; onClose?: () => void; title?: ReactNode; children?: ReactNode; footer?: ReactNode; width?: number; }
export declare function Dialog(props: DialogProps): JSX.Element | null;
