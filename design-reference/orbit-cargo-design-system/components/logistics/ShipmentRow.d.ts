import { CSSProperties } from 'react';
/** One shipment in a list: ID, lane, mode, ETA, status badge. */
export interface ShipmentRowProps { id: string; origin: string; destination: string; mode?: string; eta?: string; status?: 'transit' | 'delivered' | 'delayed' | 'exception' | 'booked'; selected?: boolean; onClick?: () => void; style?: CSSProperties; }
export declare function ShipmentRow(props: ShipmentRowProps): JSX.Element;
