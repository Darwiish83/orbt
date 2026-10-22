import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

/**
 * Customer level (ADR-014 / ADR-018): from the customer's yearly volume.
 * Air tier from total KG (incl. MIX), Sea tier from total CBM; the level is
 * the higher of the two. Never chosen manually. Thresholds live here only.
 */
export const LEVEL_THRESHOLDS = {
  airKg: [100, 300, 1000], // ≥100 → tier 2, ≥300 → tier 3, ≥1000 → tier 4
  seaCbm: [1, 4, 10],
} as const;

export type CustomerLevel = "A" | "B" | "C" | "D";

export const LEVEL_NAME: Record<CustomerLevel, string> = {
  A: "A · PRO",
  B: "B · VIP",
  C: "C · STANDARD",
  D: "D · BASIC",
};

function tier(value: Prisma.Decimal, steps: readonly number[]): number {
  let t = 1;
  for (const s of steps) if (value.greaterThanOrEqualTo(s)) t++;
  return t;
}

/** Pure level calculation from yearly totals. */
export function levelFromVolume(airKg: Prisma.Decimal.Value, seaCbm: Prisma.Decimal.Value): CustomerLevel {
  const t = Math.max(
    tier(new Prisma.Decimal(airKg), LEVEL_THRESHOLDS.airKg),
    tier(new Prisma.Decimal(seaCbm), LEVEL_THRESHOLDS.seaCbm),
  );
  return (["D", "C", "B", "A"] as const)[t - 1]!;
}

export interface CustomerVolume {
  airKg: Prisma.Decimal;
  seaCbm: Prisma.Decimal;
  level: CustomerLevel;
}

/** Yearly volume + level for one customer, computed from their shipment lines. */
export async function customerVolume(db: PrismaClient, customerId: string, year: number): Promise<CustomerVolume> {
  const lines = await db.shipmentLine.findMany({
    where: { customerId, shipment: { businessYear: year } },
    select: { chargeableWeightKg: true, mixKg: true, volumeCbm: true, shipment: { select: { mode: true } } },
  });
  let airKg = new Prisma.Decimal(0);
  let seaCbm = new Prisma.Decimal(0);
  for (const l of lines) {
    if (l.shipment.mode === "AIR") airKg = airKg.add(l.chargeableWeightKg ?? 0).add(l.mixKg ?? 0);
    else if (l.shipment.mode === "SEA") seaCbm = seaCbm.add(l.volumeCbm ?? 0);
  }
  return { airKg, seaCbm, level: levelFromVolume(airKg, seaCbm) };
}
