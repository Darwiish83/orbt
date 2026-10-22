"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/db/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { createCustomer } from "@/modules/customers/service";
import { requireUser } from "@/modules/authz/session";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  company: z.string().trim().min(1, "Company is required").max(120),
  phone: z.string().max(40).optional(),
  location: z.string().max(160).optional(),
  cargoCategory: z.string().max(160).optional(),
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
    company: formData.get("company"),
    phone: formData.get("phone") || undefined,
    location: formData.get("location") || undefined,
    cargoCategory: formData.get("cargoCategory") || undefined,
    email: formData.get("email") || undefined,
    country: formData.get("country") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await createCustomer(prisma, user, {
      name: parsed.data.name,
      company: parsed.data.company,
      phone: parsed.data.phone,
      location: parsed.data.location,
      cargoCategory: parsed.data.cargoCategory,
      email: parsed.data.email || undefined,
      country: parsed.data.country,
    });
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "You do not have permission to add customers." };
    // Duplicate email/phone and required-field errors are safe to show as-is.
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }

  revalidatePath("/customers");
  return { error: null, ok: true };
}
