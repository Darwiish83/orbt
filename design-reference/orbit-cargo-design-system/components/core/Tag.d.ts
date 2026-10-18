import { ReactNode, CSSProperties } from 'react';
/** Pill filter chip / removable tag. */
export interface TagProps { icon?: ReactNode; onRemove?: () => void; selected?: boolean; onClick?: () => void; children?: ReactNode; style?: CSSProperties; }
export declare function Tag(props: TagProps): JSX.Element;
