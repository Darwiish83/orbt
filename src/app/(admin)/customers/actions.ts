"use server";

import { z } from "zod";
import { prisma } from "@/db/client";
import { requireUser } from "@/modules/authz/session";
import { deleteCustomer, getCustomerDetails, setCustomerStatus } from "@/modules/customers/admin";
import { createCustomer, updateCustomer } from "@/modules/customers/service";
import { getAdminScope } from "../scope";
import { runAction } from "../runAction";

const form = z.object({
  name: z.string().trim().min(1, "Full name is required").max(120),
  company: z.string().trim().min(1, "Company is required").max(120),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  location: z.string().trim().max(160).optional(),
  cargoCategory: z.string().trim().max(160).optional(),
});
export type CustomerFormValues = z.input<typeof form>;
const id = z.string().min(1).max(64);

/** Add Customer: the OR- reference is assigned on the server (never typed). */
export async function createCustomerAction(values: CustomerFormValues) {
  return runAction(
    "customers",
    async () => {
      const user = await requireUser();
      const v = form.parse(values);
      const c = await createCustomer(prisma, user, { ...v, email: v.email || undefined });
      return { id: c.id, ref: c.ref };
    },
    ["/customers"],
  );
}

export async function updateCustomerAction(customerId: string, values: CustomerFormValues) {
  return runAction(
    "customers",
    async () => {
      const user = await requireUser();
      const v = form.parse(values);
      await updateCustomer(prisma, user, id.parse(customerId), { ...v, email: v.email ?? "", phone: v.phone ?? "" });
    },
    ["/customers"],
  );
}

export async function setCustomerStatusAction(customerId: string, status: "ACTIVE" | "INACTIVE") {
  return runAction(
    "customers",
    async () => {
      const user = await requireUser();
      await setCustomerStatus(prisma, user, id.parse(customerId), z.enum(["ACTIVE", "INACTIVE"]).parse(status));
    },
    ["/customers"],
  );
}

export async function deleteCustomerAction(customerId: string) {
  return runAction(
    "customers",
    async () => {
      const user = await requireUser();
      await deleteCustomer(prisma, user, id.parse(customerId));
    },
    ["/customers"],
  );
}

export async function customerDetailsAction(customerId: string) {
  return runAction("customers", async () => {
    const user = await requireUser();
    const scope = await getAdminScope(user);
    return getCustomerDetails(prisma, user, id.parse(customerId), scope.year);
  });
}
