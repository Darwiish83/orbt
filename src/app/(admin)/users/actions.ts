"use server";

import { z } from "zod";
import { prisma } from "@/db/client";
import { requireUser } from "@/modules/authz/session";
import { createEmployee, getEmployee, setEmployeeActive, setRoleModule, updateEmployee } from "@/modules/users/admin";
import { resetPin } from "@/modules/accounting/pin";
import { runAction } from "../runAction";

const level = z.enum(["NONE", "VIEW", "EDIT"]);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((d) => new Date(`${d}T00:00:00Z`));
const form = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(40).optional(),
  department: z.enum(["MANAGEMENT", "OPERATIONS", "FINANCE", "CUSTOMER_SERVICE", "DOCUMENTS", "REPORTS"]),
  roleKeys: z.array(z.string().max(60)).max(20),
  countries: z.array(z.string().max(60)).max(50),
  access: z.record(z.string().max(30), level.nullable()),
  accountingAccess: z.boolean(),
  transferRole: z.enum(["NONE", "SEND", "RECEIVE"]),
  transferCountries: z.array(z.string().max(60)).max(50),
  accessFrom: day.optional().or(z.literal("").transform(() => null)),
  accessUntil: day.optional().or(z.literal("").transform(() => null)),
});
export type EmployeeFormValues = z.input<typeof form>;
const id = z.string().min(1).max(64);

export async function saveEmployeeAction(userId: string | null, values: EmployeeFormValues) {
  return runAction(
    "users",
    async () => {
      const user = await requireUser();
      const v = form.parse(values);
      // The window ends at the end of its last day.
      const input = { ...v, accessUntil: v.accessUntil ? new Date(v.accessUntil.getTime() + 86_399_000) : null };
      if (userId) {
        await updateEmployee(prisma, user, id.parse(userId), input);
        return { code: null };
      }
      return createEmployee(prisma, user, input);
    },
    ["/users"],
  );
}

export async function loadEmployeeAction(userId: string) {
  return runAction("users", async () => {
    const user = await requireUser();
    return getEmployee(prisma, user, id.parse(userId));
  });
}

export async function setEmployeeActiveAction(userId: string, active: boolean) {
  return runAction(
    "users",
    async () => {
      const user = await requireUser();
      await setEmployeeActive(prisma, user, id.parse(userId), z.boolean().parse(active));
    },
    ["/users"],
  );
}

export async function setRoleModuleAction(roleKey: string, moduleKey: string, value: string) {
  return runAction(
    "users",
    async () => {
      const user = await requireUser();
      await setRoleModule(prisma, user, z.string().max(60).parse(roleKey), z.string().max(30).parse(moduleKey), level.parse(value));
    },
    ["/users"],
  );
}

/** Super admin: clear someone's Accounting PIN (they choose a new one next time). */
export async function resetPinAction(userId: string) {
  return runAction(
    "users",
    async () => {
      const user = await requireUser();
      await resetPin(prisma, user, id.parse(userId));
    },
    ["/users"],
  );
}
