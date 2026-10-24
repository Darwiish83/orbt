"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/db/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { captureError } from "@/lib/logger";
import { requireUser } from "@/modules/authz/session";
import { changeShipmentStatus } from "@/modules/shipments/service";

/** Change Shipment Status (spec §8): the whole shipment at once; customers are
 * notified. Only the state machine's next statuses are accepted. */
export async function changeStatusAction(shipmentId: string, to: string, notify: boolean, idempotencyKey: string) {
  try {
    const user = await requireUser();
    await changeShipmentStatus(prisma, user, z.string().min(1).max(64).parse(shipmentId), z.enum(["DEPARTED", "IN_TRANSIT", "ARRIVED"]).parse(to), {
      notifyCustomers: notify,
      idempotencyKey: z.string().uuid().parse(idempotencyKey),
    });
    revalidatePath("/operations");
    revalidatePath("/shipments", "layout");
    return { ok: true as const };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false as const, error: "You don't have permission to do this." };
    if (e instanceof ValidationError) return { ok: false as const, error: "This status change is not allowed." };
    if (e instanceof z.ZodError) return { ok: false as const, error: "Check the highlighted fields." };
    captureError(e, { area: "operations" });
    return { ok: false as const, error: "Something went wrong. Please try again." };
  }
}
