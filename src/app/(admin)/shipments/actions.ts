"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/db/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { captureError } from "@/lib/logger";
import { can } from "@/modules/authz/core";
import { requireUser } from "@/modules/authz/session";
import { addShipmentLine, createShipment } from "@/modules/shipments/service";
import {
  deleteShipment,
  deleteShipmentLine,
  notifyShipmentLine,
  searchCustomers,
  setAwbKg,
  setShipmentLinePricing,
  updateShipment,
  updateShipmentLine,
} from "@/modules/shipments/manage";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>, paths: string[] = ["/shipments"]): Promise<Result<T>> {
  try {
    const data = await fn();
    for (const p of paths) revalidatePath(p);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to do this." };
    if (e instanceof ValidationError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Check the highlighted fields." };
    captureError(e, { area: "shipments" });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const id = z.string().min(1).max(64);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((d) => new Date(`${d}T00:00:00Z`));
const optDay = day.optional().or(z.literal("").transform(() => null));
const text = z.string().trim().max(120).optional();
const qty = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, "Enter a number")
  .optional()
  .or(z.literal("").transform(() => undefined));
const count = z.coerce.number().int().min(0).max(1_000_000).optional();

const shipmentForm = z.object({
  mode: z.enum(["AIR", "SEA"]),
  originCountry: z.string().trim().min(1).max(60),
  originCity: text,
  destCity: text,
  destCode: text,
  shipDate: optDay,
  arrivalDate: optDay,
  awb: text,
  businessYear: z.coerce.number().int().min(2000).max(2100),
});
export type ShipmentFormValues = z.input<typeof shipmentForm>;

export async function createShipmentAction(values: ShipmentFormValues) {
  return run(async () => {
    const user = await requireUser();
    const v = shipmentForm.parse(values);
    const sh = await createShipment(prisma, user, {
      mode: v.mode,
      originCountry: v.originCountry,
      originCity: v.originCity || undefined,
      destCity: v.destCity || undefined,
      destCode: v.destCode || undefined,
      shipDate: v.shipDate ?? undefined,
      arrivalDate: v.arrivalDate ?? undefined,
      awbNumber: v.mode === "AIR" ? v.awb || undefined : undefined,
      businessYear: v.businessYear,
    });
    if (v.mode === "SEA" && v.awb) await updateShipment(prisma, user, sh.id, { awb: v.awb });
    return { id: sh.id };
  });
}

export async function updateShipmentAction(shipmentId: string, values: ShipmentFormValues) {
  return run(async () => {
    const user = await requireUser();
    const v = shipmentForm.parse(values);
    await updateShipment(prisma, user, id.parse(shipmentId), {
      shipDate: v.shipDate ?? null,
      arrivalDate: v.arrivalDate ?? null,
      originCity: v.originCity ?? null,
      destCity: v.destCity ?? null,
      destCode: v.destCode ?? null,
      awb: v.awb ?? null,
    });
  }, ["/shipments", `/shipments/${shipmentId}`]);
}

export async function deleteShipmentAction(shipmentId: string) {
  return run(async () => {
    const user = await requireUser();
    await deleteShipment(prisma, user, id.parse(shipmentId));
  });
}

export async function setAwbKgAction(shipmentId: string, awbKg: string) {
  return run(async () => {
    const user = await requireUser();
    await setAwbKg(prisma, user, id.parse(shipmentId), qty.parse(awbKg) ?? null);
  }, [`/shipments/${shipmentId}`]);
}

const lineForm = z.object({
  packages: count,
  box: qty,
  // Numbered MIX boxes (Air): the server checks each KG and derives count + KG.
  mixParts: z.array(z.object({ box: z.number().int().min(1).max(999), kg: z.string().trim().max(20) })).max(60),
  rate: qty,
  qualityRate: qty,
  brandPcs: count,
  brandRate: qty,
  fatura: qty,
  delivery: qty,
});
export type LineFormValues = z.input<typeof lineForm>;

function toLine(mode: "AIR" | "SEA", v: z.output<typeof lineForm>) {
  return {
    packages: v.packages,
    chargeableWeightKg: mode === "AIR" ? v.box : undefined,
    volumeCbm: mode === "SEA" ? v.box : undefined,
    mixParts: mode === "AIR" ? v.mixParts : undefined,
    rate: v.rate,
    qualityRate: v.qualityRate,
    brandPcs: v.brandPcs,
    brandRate: v.brandRate,
    fatura: v.fatura,
    delivery: v.delivery,
  };
}

export async function addLineAction(shipmentId: string, mode: "AIR" | "SEA", customerId: string, values: LineFormValues) {
  return run(async () => {
    const user = await requireUser();
    await addShipmentLine(prisma, user, id.parse(shipmentId), { customerId: id.parse(customerId), ...toLine(mode, lineForm.parse(values)) });
  }, ["/shipments", `/shipments/${shipmentId}`, "/finance"]);
}

export async function updateLineAction(shipmentId: string, lineId: string, mode: "AIR" | "SEA", values: LineFormValues) {
  return run(async () => {
    const user = await requireUser();
    const v = lineForm.parse(values);
    // Pricing staff without Shipments edit set only the rates (ADR-036).
    if (!can(user, "shipments:write") && can(user, "pricing:write")) {
      await setShipmentLinePricing(prisma, user, id.parse(lineId), { rate: v.rate, qualityRate: v.qualityRate, brandRate: v.brandRate });
      return;
    }
    await updateShipmentLine(prisma, user, id.parse(lineId), toLine(mode, v));
  }, ["/shipments", `/shipments/${shipmentId}`, "/finance"]);
}

export async function deleteLineAction(shipmentId: string, lineId: string) {
  return run(async () => {
    const user = await requireUser();
    await deleteShipmentLine(prisma, user, id.parse(lineId));
  }, ["/shipments", `/shipments/${shipmentId}`, "/finance"]);
}

export async function notifyLineAction(shipmentId: string, lineId: string) {
  return run(async () => {
    const user = await requireUser();
    await notifyShipmentLine(prisma, user, id.parse(lineId));
  }, [`/shipments/${shipmentId}`]);
}

export async function searchCustomersAction(q: string) {
  return run(async () => {
    const user = await requireUser();
    return searchCustomers(prisma, user, z.string().max(60).parse(q));
  }, []);
}
