"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/db/client";
import { AuthorizationError } from "@/lib/errors";
import { createCustomer } from "@/modules/customers/service";
import { requireUser } from "@/modules/authz/session";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  country: z.string().optional(),
});

export type CreateCustomerState = { error: string | null; ok?: boolean };

export async function createCustomerAction(
  _prev: CreateCustomerState,
  formData: FormData,
): Promise<CreateCustomerState> {
  const user = await requireUser();

  const parsed = schema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") || undefined,
    email: formData.get("email") || undefined,
    country: formData.get("country") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await createCustomer(prisma, user, {
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || undefined,
      country: parsed.data.country,
    });
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "You do not have permission to add customers." };
    throw e;
  }

  revalidatePath("/customers");
  return { error: null, ok: true };
}
