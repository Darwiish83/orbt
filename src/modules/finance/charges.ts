import type { ShipmentMode } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { ValidationError } from "@/lib/errors";
import type { ChargeLineInput } from "./invoices";
import { dec, round2, sum, type DecimalInput } from "./money";

/**
 * Charge arithmetic from the owner spec (ADR-013), all in Decimal and always
 * computed on the server. Inputs are the raw entered values; nothing the
 * browser calculates is ever trusted.
 */

type Num = DecimalInput | null | undefined;
const d = (v: Num) => (v === null || v === undefined || v === "" ? new Prisma.Decimal(0) : dec(v));

function nonNegative(label: string, v: Prisma.Decimal): Prisma.Decimal {
  if (v.isNegative()) throw new ValidationError(`${label} cannot be negative`);
  return v;
}

export interface LineCharges {
  chargeableWeightKg?: Num;
  volumeCbm?: Num;
  mixKg?: Num;
  rate?: Num;
  qualityRate?: Num;
  brandPcs?: number | null;
  brandRate?: Num;
  fatura?: Num;
  delivery?: Num;
  other?: Num;
  discount?: Num;
}

/** Measure: Air = KG + MIX KG; Sea = CBM. */
export function lineMeasure(mode: ShipmentMode, l: LineCharges): Prisma.Decimal {
  const m = mode === "AIR" ? d(l.chargeableWeightKg).add(d(l.mixKg)) : d(l.volumeCbm);
  return nonNegative("Measure", m).toDecimalPlaces(3);
}

/**
 * Line total = measure × rate + measure × quality + brand pcs × brand rate
 *            + fatura + delivery + other − discount   (rounded HALF_UP, 2dp).
 */
export function lineTotal(mode: ShipmentMode, l: LineCharges): Prisma.Decimal {
  const measure = lineMeasure(mode, l);
  const parts = [
    measure.mul(nonNegative("Rate", d(l.rate))),
    measure.mul(nonNegative("Quality", d(l.qualityRate))),
    d(l.brandPcs ?? 0).mul(nonNegative("Brand rate", d(l.brandRate))),
    nonNegative("Fatura", d(l.fatura)),
    nonNegative("Delivery", d(l.delivery)),
    nonNegative("Other", d(l.other)),
  ];
  const total = round2(sum(parts).minus(nonNegative("Discount", d(l.discount))));
  if (total.isNegative()) throw new ValidationError("Discount is larger than the line charges");
  return total;
}

export interface SpecInvoiceInput {
  /** Measure recorded on the shipment (KG + MIX for Air, CBM for Sea). */
  actualMeasure: Num;
  /** Measure billed to the customer (may differ from actual). */
  billedMeasure: Num;
  baseRate: Num;
  qualityRate?: Num;
  agentName?: string | null;
  agentRate?: Num;
  brandPcs?: number | null;
  brandRate?: Num;
  fatura?: Num;
  localDelivery?: Num;
  /** "Others": a description and an amount (spec B9). */
  others?: Num;
  othersDescription?: string | null;
  discount?: Num;
}

export interface SpecInvoice {
  lines: ChargeLineInput[];
  discount: Prisma.Decimal;
  /** Freight rate the customer sees: base + agent commission (never shown apart). */
  combinedRate: Prisma.Decimal;
  /** billed × agent rate — not shipment income; counts once the invoice is fully paid. */
  commissionAmount: Prisma.Decimal;
  /** billed − actual when billed is higher (logged in Invoice History). */
  extraMeasure: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  total: Prisma.Decimal;
}

/**
 * Build an invoice the way spec §A6/§B9 and the design's CreateInvoiceDialog
 * describe it. The customer sees one freight line at the combined rate (base +
 * agent commission); Quality Control is its own line (billed × quality rate);
 * Brand / Fatura / Local Delivery / Others appear only when entered; Discount
 * is subtracted above the Total.
 */
export function buildSpecInvoice(i: SpecInvoiceInput): SpecInvoice {
  const billed = nonNegative("Billed measure", d(i.billedMeasure));
  const actual = nonNegative("Actual measure", d(i.actualMeasure));
  if (billed.isZero()) throw new ValidationError("Billed measure must be greater than zero");

  const combinedRate = nonNegative("Rate", d(i.baseRate)).add(nonNegative("Agent commission", d(i.agentRate)));
  if (combinedRate.isZero()) throw new ValidationError("Rate must be greater than zero");

  const lines: ChargeLineInput[] = [
    { category: "FREIGHT", description: "Freight", quantity: billed.toString(), unitPrice: combinedRate.toString() },
  ];
  const quality = nonNegative("Quality", d(i.qualityRate));
  if (quality.greaterThan(0)) {
    lines.push({ category: "QUALITY", description: "Quality Control", quantity: billed.toString(), unitPrice: quality.toString() });
  }
  const brandPcs = i.brandPcs ?? 0;
  if (!Number.isInteger(brandPcs) || brandPcs < 0) throw new ValidationError("Brand PCS must be a whole number");
  const brandRate = nonNegative("Brand rate", d(i.brandRate));
  if (brandPcs > 0 && brandRate.greaterThan(0)) {
    lines.push({ category: "BRAND", description: "Brand", quantity: String(brandPcs), unitPrice: brandRate.toString() });
  }
  const othersDescription = i.othersDescription?.trim().slice(0, 120) || "Others";
  const flat: [ChargeLineInput["category"], string, Num][] = [
    ["FATURA", "Fatura", i.fatura],
    ["LOCAL_DELIVERY", "Local Delivery", i.localDelivery],
    ["OTHER", othersDescription, i.others],
  ];
  for (const [category, description, v] of flat) {
    const amount = nonNegative(description, d(v));
    if (amount.greaterThan(0)) lines.push({ category, description, quantity: "1", unitPrice: amount.toString() });
  }

  const subtotal = round2(sum(lines.map((l) => round2(dec(l.quantity).mul(dec(l.unitPrice))))));
  const discount = round2(nonNegative("Discount", d(i.discount)));
  if (discount.greaterThan(subtotal)) throw new ValidationError("Discount is larger than the invoice");

  const extra = billed.minus(actual);
  return {
    lines,
    discount,
    combinedRate,
    commissionAmount: round2(billed.mul(nonNegative("Agent commission", d(i.agentRate)))),
    extraMeasure: extra.isPositive() ? extra : new Prisma.Decimal(0),
    subtotal,
    total: round2(subtotal.minus(discount)),
  };
}
