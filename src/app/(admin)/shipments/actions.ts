"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ShipmentStatus } from "@prisma/client";
import { prisma } from "@/db/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { changeShipmentStatus, createShipment } from "@/modules/shipments/service";

export type ActionState = { error: string | null; ok?: boolean };

const createSchema = z.object({
  mode: z.enum(["AIR", "SEA"]),
  originCountry: z.string().min(1),
  originCity: z.string().optional(),
  destCountry: z.string().optional(),
  destCity: z.string().optional(),
  businessYear: z.coerce.number().int().min(2000).max(2100),
});

export async function createShipmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the shipment details" };
  try {
    await createShipment(prisma, user, parsed.data);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "Not authorized for this country/year" };
    throw e;
  }
  revalidatePath("/shipments");
  return { error: null, ok: true };
}

export async function changeStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const to = String(formData.get("to") ?? "") as ShipmentStatus;
  try {
    await changeShipmentStatus(prisma, user, id, to);
  } catch (e) {
    if (e instanceof AuthorizationError || e instanceof ValidationError) {
      // Surfaced on reload; swallow to avoid leaking internals in a GET-style action.
      return;
    }
    throw e;
  }
  revalidatePath(`/shipments/${id}`);
  revalidatePath("/operations");
}
