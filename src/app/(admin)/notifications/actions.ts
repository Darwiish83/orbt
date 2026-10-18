"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/db/client";
import { AuthorizationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { createNotification, sendNotification } from "@/modules/notifications/service";

export type ActionState = { error: string | null; ok?: boolean };

const schema = z.object({
  title: z.string().min(1),
  message: z.string().min(1),
  audience: z.enum(["ALL", "CUSTOMER", "ROLE"]).default("ALL"),
});

export async function createAnnouncementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a title and message" };
  try {
    await createNotification(prisma, user, {
      audience: parsed.data.audience,
      title: parsed.data.title,
      message: parsed.data.message,
    });
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "You cannot create announcements." };
    throw e;
  }
  revalidatePath("/notifications");
  return { error: null, ok: true };
}

export async function sendAnnouncementAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  try {
    await sendNotification(prisma, user, String(formData.get("id") ?? ""));
  } catch {
    return;
  }
  revalidatePath("/notifications");
}
