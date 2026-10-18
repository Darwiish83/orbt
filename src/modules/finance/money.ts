import { Prisma } from "@prisma/client";

/**
 * Decimal money arithmetic (ADR-004). All authoritative amounts use
 * Prisma.Decimal (decimal.js) — never JavaScript floating point. Amounts are
 * rounded HALF_UP to 2 decimal places.
 */
export type DecimalInput = Prisma.Decimal | number | string;

export function dec(v: DecimalInput): Prisma.Decimal {
  return new Prisma.Decimal(v);
}

export function round2(v: Prisma.Decimal): Prisma.Decimal {
  return v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Line amount = quantity × unitPrice, rounded to 2dp. Computed server-side. */
export function lineAmount(quantity: DecimalInput, unitPrice: DecimalInput): Prisma.Decimal {
  return round2(dec(quantity).mul(dec(unitPrice)));
}

export function sum(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, v) => acc.add(v), new Prisma.Decimal(0));
}

export function eq(a: DecimalInput, b: DecimalInput): boolean {
  return dec(a).equals(dec(b));
}

export function gt(a: DecimalInput, b: DecimalInput): boolean {
  return dec(a).greaterThan(dec(b));
}
