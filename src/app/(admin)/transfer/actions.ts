"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/db/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { createTransfer, receiveTransfer, sendTransfer } from "@/modules/transfer/service";

export type ActionState = { error: string | null; ok?: boolean };

const schema = z.object({
  amount: z.string().min(1),
  fromCountry: z.string().min(1),
  toCountry: z.string().min(1),
  businessYear: z.coerce.number().int().min(2000).max(2100),
  note: z.string().optional(),
});

export async function createTransferAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the transfer details" };
  try {
    await createTransfer(prisma, user, parsed.data);
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: e.message };
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  revalidatePath("/transfer");
  return { error: null, ok: true };
}

export async function sendTransferAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  try {
    await sendTransfer(prisma, user, String(formData.get("id") ?? ""));
  } catch {
    return;
  }
  revalidatePath("/transfer");
}

export async function receiveTransferAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  try {
    await receiveTransfer(prisma, user, String(formData.get("id") ?? ""));
  } catch {
    return;
  }
  revalidatePath("/transfer");
}
