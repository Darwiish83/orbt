import type { ShipmentMode, ShipmentStatus } from "@prisma/client";

/**
 * Shipment state machine — four statuses (ADR-017, owner spec §0):
 *
 *   Air:  AT_ORIGIN_STORE → DEPARTED → IN_TRANSIT ("Transit") → ARRIVED
 *   Sea:  AT_ORIGIN_STORE → DEPARTED → ARRIVED
 *
 * AT_ORIGIN_STORE is the automatic starting status. ARRIVED (reached
 * Mogadishu) is terminal. Status changes happen per shipment, so one change
 * applies to every customer on it. Only the transitions listed here are
 * allowed; everything else is rejected server-side.
 */
const AIR: Record<ShipmentStatus, ShipmentStatus[]> = {
  AT_ORIGIN_STORE: ["DEPARTED"],
  DEPARTED: ["IN_TRANSIT"],
  IN_TRANSIT: ["ARRIVED"],
  ARRIVED: [],
};

const SEA: Record<ShipmentStatus, ShipmentStatus[]> = {
  AT_ORIGIN_STORE: ["DEPARTED"],
  DEPARTED: ["ARRIVED"],
  IN_TRANSIT: [], // not a Sea status
  ARRIVED: [],
};

export function transitionsFor(mode: ShipmentMode): Record<ShipmentStatus, ShipmentStatus[]> {
  return mode === "AIR" ? AIR : SEA;
}

export function canTransition(mode: ShipmentMode, from: ShipmentStatus, to: ShipmentStatus): boolean {
  return transitionsFor(mode)[from].includes(to);
}

/** The ordered statuses a shipment of this mode goes through (for timelines). */
export function statusSteps(mode: ShipmentMode): ShipmentStatus[] {
  return mode === "AIR"
    ? ["AT_ORIGIN_STORE", "DEPARTED", "IN_TRANSIT", "ARRIVED"]
    : ["AT_ORIGIN_STORE", "DEPARTED", "ARRIVED"];
}

/** Display label (the same English keys the EN/SO/AR dictionaries translate). */
export function publicStatusLabel(status: ShipmentStatus): string {
  const map: Record<ShipmentStatus, string> = {
    AT_ORIGIN_STORE: "At Origin Store",
    DEPARTED: "Departed",
    IN_TRANSIT: "Transit",
    ARRIVED: "Arrived",
  };
  return map[status];
}
