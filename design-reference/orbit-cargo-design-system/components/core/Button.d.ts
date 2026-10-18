import { ReactNode, CSSProperties, ButtonHTMLAttributes } from 'react';
/**
 * Orbit action button. Orange primary for the single main action, navy secondary for supporting actions.
 * @startingPoint section="Core" subtitle="Primary, secondary, outline, ghost buttons" viewport="700x260"
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'inverse';
  size?: 's' | 'm' | 'l';
  leadingIcon?: ReactNode; trailingIcon?: ReactNode;
  fullWidth?: boolean; disabled?: boolean; children?: ReactNode; style?: CSSProperties;
}
export declare function Button(props: ButtonProps): JSX.Element;
