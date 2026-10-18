import { ReactNode, CSSProperties } from 'react';
/** White surface container with 1px border, 10px radius and low navy shadow. */
export interface CardProps { title?: ReactNode; eyebrow?: string; actions?: ReactNode; padding?: number | string; elevated?: boolean; interactive?: boolean; children?: ReactNode; style?: CSSProperties; }
export declare function Card(props: CardProps): JSX.Element;
