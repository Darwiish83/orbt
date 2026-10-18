"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/db/client";
import { AuthorizationError } from "@/lib/errors";
import { assignRole } from "@/modules/auth/accounts";
import { requireUser } from "@/modules/authz/session";
import { createEmployeeUser, removeRole, setUserStatus } from "@/modules/users/service";

export type ActionState = { error: string | null; ok?: boolean };

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  department: z.enum(["MANAGEMENT", "OPERATIONS", "FINANCE", "CUSTOMER_SERVICE", "DOCUMENTS", "REPORTS"]),
});

function toMessage(e: unknown): string {
  if (e instanceof AuthorizationError) return e.message;
  throw e;
}

export async function inviteUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name"),
    department: formData.get("department"),
  });
  if (!parsed.success) return { error: "Enter a name, valid email and department" };
  try {
    await createEmployeeUser(prisma, user, parsed.data);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/users");
  return { error: null, ok: true };
}

export async function assignRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const targetUserId = String(formData.get("userId") ?? "");
  const roleKey = String(formData.get("roleKey") ?? "");
  try {
    await assignRole(prisma, user, targetUserId, roleKey);
  } catch (e) {
    return { error: toMessage(e) };
  }
  revalidatePath("/users");
  return { error: null, ok: true };
}

export async function removeRoleAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await removeRole(prisma, user, String(formData.get("userId") ?? ""), String(formData.get("roleKey") ?? ""));
  revalidatePath("/users");
}

export async function setStatusAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const status = formData.get("status") === "SUSPENDED" ? "SUSPENDED" : "ACTIVE";
  await setUserStatus(prisma, user, String(formData.get("userId") ?? ""), status);
  revalidatePath("/users");
}
