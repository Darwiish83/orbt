import { Prisma } from "@prisma/client";
import { z } from "zod";
import { dec, round2, sum } from "@/modules/finance/money";

/**
 * Shipment cost & profit (spec §11, formulas as in the approved design kit:
 * AccountingShipCost.jsx / AccountingArrival.jsx). Pure functions over Decimal
 * — every figure here is derived on the server from stored inputs.
 */

const num = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === "") return undefined;
    const s = String(v).trim();
    if (!/^\d{1,10}(\.\d{1,4})?$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "Enter a number" });
      return z.NEVER;
    }
    return s;
  });
const text = z.string().trim().max(60).optional();

/** Origin sheet, Air (spec: "Operation cost — Turkey"): entered by origin staff. */
export const airOriginSchema = z.object({
  rate: num, // origin rate per KG
  awbCost: num,
  custom: num,
  deliveryPackaging: num,
  brandedCharges: num,
  transferPercent: num, // % of the origin cost, added to it
  transferMoney: num, // deducted from Total Income, added to Somali Transport's share (owner confirmed 2026-10-24)
});
/** Origin sheet, Sea (design SeaProfitTable). */
export const seaOriginSchema = z.object({
  custom: num,
  freight: num,
  localTransport: num,
  storage: num,
  brand: num,
  transferMoney: num,
  incomeOrigin: num, // income collected at origin
  brandIncomeSomalia: num,
  brandIncomeOrigin: num,
});
/** MGQ sheet, Air: three per-KG rates, plain amounts, and the transit leg. */
export const airMgqSchema = z.object({
  qualityControlRate: num,
  airportHandlingRate: num, // "Airport handling (Arimas)"
  mgqCustomRate: num,
  trpr: num,
  loader: num,
  extra: num,
  transitCountry: text,
  transitCost: num,
});
/** MGQ sheet, Sea: port charges and import tax. */
export const seaMgqSchema = z.object({
  maersk: num,
  albayrak: num,
  inlandPickupTruck: num,
  scan: num,
  qualityControl: num,
  portPorters: num,
  truck: num,
  storeUnloading: num,
  customsDuty: num,
  clearance: num,
});

export type AirOrigin = z.output<typeof airOriginSchema>;
export type SeaOrigin = z.output<typeof seaOriginSchema>;
export type AirMgq = z.output<typeof airMgqSchema>;
export type SeaMgq = z.output<typeof seaMgqSchema>;

const d = (v: string | undefined | null) => (v ? dec(v) : new Prisma.Decimal(0));
const r2 = (v: Prisma.Decimal) => round2(v).toString();
const div = (a: Prisma.Decimal, b: Prisma.Decimal) => (b.isZero() ? new Prisma.Decimal(0) : a.div(b));

/** Profit split (percent) [Orbit, Somali Transport, Mahad]; India = 100% Orbit. */
export type Split = [number, number, number];
export const DEFAULT_SPLITS: Record<string, { AIR: Split; SEA: Split }> = {
  Turkey: { AIR: [43, 50, 7], SEA: [45, 50, 5] },
};
export function splitFor(splits: Record<string, { AIR: Split; SEA: Split }>, country: string, mode: "AIR" | "SEA"): Split {
  return splits[country]?.[mode] ?? [100, 0, 0];
}

export interface ShipmentFacts {
  mode: "AIR" | "SEA";
  /** Actual measure (KG incl. MIX / CBM) from the shipment lines. */
  quantity: Prisma.Decimal;
  localDelivery: Prisma.Decimal; // Σ line delivery
  invoiceCharge: Prisma.Decimal; // Σ line fatura
  /** Money collected for the shipment (live payments on its invoices). */
  collected: Prisma.Decimal;
  /** Agent commission on the shipment's invoices (not shipment income). */
  commission: Prisma.Decimal;
}

export interface CostRow {
  quantity: string;
  collected: string;
  commission: string;
  incomeSomalia: string; // collected − commission
  originCost: string; // Total Origin Cost (incl. transfer %)
  transferFee: string;
  costRate: string; // origin cost rate per unit (Air)
  mgqNet: string; // Air: Net MGQ; Sea: port charges
  importTax: string; // Sea only
  transitCost: string; // Air only
  transitCountry: string | null;
  mgqTotal: string; // Air: Net MGQ + transit; Sea: port + tax
  rateMgq: string;
  totalCostRate: string;
  totalCost: string;
  totalIncome: string;
  incomeRate: string;
  transferMoney: string;
  profit: string;
  split: Split;
  orbit: string;
  somaliTransport: string; // Profit × split + Transfer Money (owner confirmed 2026-10-24)
  mahad: string;
  localDelivery: string;
  invoiceCharge: string;
  /** Air: Rate × KG; Sea: the Freight typed on the origin sheet. */
  freight: string;
  /** Air MGQ per-KG rows as amounts (rate × KG). */
  mgqAmounts: { qualityControl: string; airportHandling: string; mgqCustom: string };
  /** Income Somalia after Transfer Money (Sea "Total Income Somali"). */
  incomeAfterTransfer: string;
  /** Cost due per stage (Shipment cost payment). */
  stages: { ORIGIN: string; TRANSIT: string; ARRIVED: string };
}

export function computeCost(f: ShipmentFacts, origin: AirOrigin | SeaOrigin, mgq: AirMgq | SeaMgq, split: Split): CostRow {
  const incomeSomalia = f.collected.minus(f.commission);
  let originCost: Prisma.Decimal, transferFee: Prisma.Decimal, costRate: Prisma.Decimal;
  let mgqNet: Prisma.Decimal, importTax = new Prisma.Decimal(0), transit = new Prisma.Decimal(0), transitCountry: string | null = null;
  let totalIncome: Prisma.Decimal, transferMoney: Prisma.Decimal, freight: Prisma.Decimal;
  const perKg = { qualityControl: new Prisma.Decimal(0), airportHandling: new Prisma.Decimal(0), mgqCustom: new Prisma.Decimal(0) };

  if (f.mode === "AIR") {
    const o = origin as AirOrigin;
    const m = mgq as AirMgq;
    freight = d(o.rate).mul(f.quantity);
    perKg.qualityControl = d(m.qualityControlRate).mul(f.quantity);
    perKg.airportHandling = d(m.airportHandlingRate).mul(f.quantity);
    perKg.mgqCustom = d(m.mgqCustomRate).mul(f.quantity);
    const base = d(o.rate).mul(f.quantity).add(d(o.awbCost)).add(d(o.custom)).add(d(o.deliveryPackaging)).add(f.invoiceCharge).add(d(o.brandedCharges));
    transferFee = round2(base.add(f.localDelivery).mul(d(o.transferPercent)).div(100));
    originCost = base.add(f.localDelivery).add(transferFee);
    costRate = div(base.add(transferFee), f.quantity);
    mgqNet = d(m.qualityControlRate).add(d(m.airportHandlingRate)).add(d(m.mgqCustomRate)).mul(f.quantity).add(d(m.trpr)).add(d(m.loader)).add(d(m.extra));
    transit = d(m.transitCost);
    transitCountry = m.transitCountry || null;
    transferMoney = d(o.transferMoney);
    totalIncome = incomeSomalia.minus(transferMoney);
  } else {
    const o = origin as SeaOrigin;
    const m = mgq as SeaMgq;
    transferFee = new Prisma.Decimal(0);
    freight = d(o.freight);
    originCost = d(o.custom).add(d(o.freight)).add(d(o.localTransport)).add(f.localDelivery).add(f.invoiceCharge).add(d(o.storage)).add(d(o.brand));
    costRate = div(originCost, f.quantity);
    importTax = d(m.customsDuty).add(d(m.clearance));
    mgqNet = sum([m.maersk, m.albayrak, m.inlandPickupTruck, m.scan, m.qualityControl, m.portPorters, m.truck, m.storeUnloading].map(d));
    transferMoney = d(o.transferMoney);
    totalIncome = incomeSomalia.minus(transferMoney).add(d(o.incomeOrigin)).add(d(o.brandIncomeSomalia)).add(d(o.brandIncomeOrigin));
  }

  const mgqTotal = mgqNet.add(transit).add(importTax);
  const rateMgq = div(mgqTotal, f.quantity);
  const totalCost = originCost.add(mgqTotal);
  const profit = totalIncome.minus(totalCost);
  const share = (p: number) => profit.mul(p).div(100);
  return {
    quantity: f.quantity.toString(),
    collected: r2(f.collected),
    commission: r2(f.commission),
    incomeSomalia: r2(incomeSomalia),
    originCost: r2(originCost),
    transferFee: r2(transferFee),
    costRate: r2(costRate),
    mgqNet: r2(mgqNet),
    importTax: r2(importTax),
    transitCost: r2(transit),
    transitCountry,
    mgqTotal: r2(mgqTotal),
    rateMgq: r2(rateMgq),
    totalCostRate: r2(costRate.add(rateMgq)),
    totalCost: r2(totalCost),
    totalIncome: r2(totalIncome),
    incomeRate: r2(div(totalIncome, f.quantity)),
    transferMoney: r2(transferMoney),
    profit: r2(profit),
    split,
    orbit: r2(share(split[0])),
    somaliTransport: r2(share(split[1]).add(split[1] ? transferMoney : 0)),
    localDelivery: r2(f.localDelivery),
    invoiceCharge: r2(f.invoiceCharge),
    freight: r2(freight),
    mgqAmounts: { qualityControl: r2(perKg.qualityControl), airportHandling: r2(perKg.airportHandling), mgqCustom: r2(perKg.mgqCustom) },
    incomeAfterTransfer: r2(incomeSomalia.minus(transferMoney)),
    mahad: r2(share(split[2])),
    stages: {
      ORIGIN: r2(originCost),
      TRANSIT: r2(f.mode === "AIR" ? transit : new Prisma.Decimal(0)),
      ARRIVED: r2(f.mode === "AIR" ? mgqNet : mgqNet.add(importTax)),
    },
  };
}
