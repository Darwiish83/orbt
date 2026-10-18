import { CSSProperties } from 'react';
/**
 * Vertical shipment event timeline: done (navy), current (orange, haloed), upcoming (gray).
 * @startingPoint section="Logistics" subtitle="Shipment tracking timeline" viewport="700x340"
 */
export interface TrackingEvent { title: string; location?: string; time?: string; state: 'done' | 'current' | 'upcoming'; }
export interface TrackingTimelineProps { events: TrackingEvent[]; style?: CSSProperties; }
export declare function TrackingTimeline(props: TrackingTimelineProps): JSX.Element;
