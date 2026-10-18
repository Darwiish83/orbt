import type { ShipmentStatus } from "@prisma/client";

/**
 * Shipment state machine (operational status set, from the design system).
 *
 * Status-vocabulary reconciliation (previously OPEN, resolved here):
 * the DATABASE uses the operational set below. The customer-facing vocabulary
 * from readme.md (Booked / Picked up / In transit / Delayed / Exception /
 * Out for delivery / Delivered) is a PRESENTATION mapping applied for public
 * tracking (see publicStatusLabel). Internal operations use the operational set.
 *
 * Only transitions listed here are allowed; everything else is rejected
 * server-side. DELIVERED is terminal.
 */
export const TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  AT_ORIGIN_STORE: ["DEPARTED", "ON_HOLD"],
  DEPARTED: ["IN_TRANSIT", "ON_HOLD"],
  IN_TRANSIT: ["ARRIVED", "ON_HOLD"],
  ARRIVED: ["DELIVERED", "ON_HOLD"],
  ON_HOLD: ["AT_ORIGIN_STORE", "DEPARTED", "IN_TRANSIT", "ARRIVED"],
  DELIVERED: [], // terminal
};

export function canTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Customer-facing label for a public/operational status. */
export function publicStatusLabel(status: ShipmentStatus): string {
  const map: Record<ShipmentStatus, string> = {
    AT_ORIGIN_STORE: "Booked",
    DEPARTED: "Departed",
    IN_TRANSIT: "In transit",
    ARRIVED: "Arrived",
    ON_HOLD: "Delayed",
    DELIVERED: "Delivered",
  };
  return map[status];
}
