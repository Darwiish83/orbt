import { randomInt } from "node:crypto";
import type { PrismaClient, ShipmentMode } from "@prisma/client";

/** 2-letter country code for shipment-code suffixes. */
const ISO: Record<string, string> = {
  turkey: "TR",
  india: "IN",
  china: "CN",
  uae: "AE",
  somalia: "SO",
  kenya: "KE",
  ethiopia: "ET",
};

function isoOf(country: string): string {
  return ISO[country.trim().toLowerCase()] ?? (country.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "XX");
}

function prefixFor(mode: ShipmentMode): string {
  return mode === "AIR" ? "W-" : mode === "SEA" ? "C-" : "R-";
}

/**
 * Next shipment code within (businessYear, mode, originCountry): W-<n> for air,
 * C-<n> for sea, R-<n> for road. The code is globally unique: on a cross-
 * country/year collision of the bare code, a `@<ISO><year>` suffix is appended
 * (mirrors the design system). The caller retries on the rare concurrent clash.
 */
export async function nextShipmentCode(
  db: PrismaClient,
  mode: ShipmentMode,
  originCountry: string,
  businessYear: number,
): Promise<string> {
  const prefix = prefixFor(mode);
  const existing = await db.shipment.findMany({
    where: { businessYear, mode, originCountry },
    select: { code: true },
  });
  const seqs = existing
    .map((s) => parseInt(s.code.slice(prefix.length).split("@")[0] ?? "", 10))
    .filter((n) => !Number.isNaN(n));
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1;

  const base = `${prefix}${next}`;
  const clash = await db.shipment.findUnique({ where: { code: base } });
  return clash ? `${base}@${isoOf(originCountry)}${businessYear}` : base;
}

// Crockford base32 (no I, L, O, U — avoids ambiguity).
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomToken(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * Secure, collision-resistant public tracking number: ORB-<year>-<6 random
 * Crockford chars> (~1 in 10^9). Verified unique against the DB with a bounded
 * retry.
 */
export async function generateTrackingNumber(
  db: PrismaClient,
  businessYear: number,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `ORB-${businessYear}-${randomToken(6)}`;
    const existing = await db.shipment.findUnique({ where: { trackingNumber: candidate } });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique tracking number");
}
