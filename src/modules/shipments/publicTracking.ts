import type { PrismaClient } from "@prisma/client";
import { publicStatusLabel } from "./stateMachine";

/**
 * Public tracking result — the APPROVED SUBSET only. Deliberately excludes
 * customer PII, financial records, private documents, internal notes, staff
 * identities and raw internal status codes. This is returned to unauthenticated
 * callers, so it must never widen.
 */
export interface PublicTracking {
  trackingNumber: string;
  status: string; // customer-facing label
  mode: "AIR" | "SEA" | "ROAD";
  origin: string;
  destination: string;
  milestones: { status: string; occurredAt: string }[];
}

function place(city: string | null, country: string | null): string {
  return [city, country].filter(Boolean).join(", ");
}

/** Look up a shipment by its public tracking number. Returns null if unknown. */
export async function trackByNumber(
  db: PrismaClient,
  trackingNumber: string,
): Promise<PublicTracking | null> {
  const shipment = await db.shipment.findUnique({
    where: { trackingNumber },
    select: {
      trackingNumber: true,
      status: true,
      mode: true,
      originCity: true,
      originCountry: true,
      destCity: true,
      destCountry: true,
      // Only public-safe event fields — note/actor are intentionally omitted.
      events: {
        where: { type: { in: ["STATUS_CHANGE", "MILESTONE", "DELIVERY"] }, status: { not: null } },
        orderBy: { occurredAt: "asc" },
        select: { status: true, occurredAt: true },
      },
    },
  });

  if (!shipment || !shipment.trackingNumber) return null;

  return {
    trackingNumber: shipment.trackingNumber,
    status: publicStatusLabel(shipment.status),
    mode: shipment.mode,
    origin: place(shipment.originCity, shipment.originCountry),
    destination: place(shipment.destCity, shipment.destCountry),
    milestones: shipment.events
      .filter((e) => e.status !== null)
      .map((e) => ({ status: publicStatusLabel(e.status!), occurredAt: e.occurredAt.toISOString() })),
  };
}
