import { ReactNode } from 'react';
/** Hover/focus tooltip, dark navy. */
export interface TooltipProps { content: ReactNode; children: ReactNode; placement?: 'top' | 'bottom'; }
export declare function Tooltip(props: TooltipProps): JSX.Element;
