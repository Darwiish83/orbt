"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/db/client";
import { ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { PIN_COOKIE, setPin, unlockWithPin } from "@/modules/accounting/pin";
import { addOpeningDebt, addOut, closePeriod, removeOpeningYear, reopenPeriod, returnDebt, reverseOpening, reverseOut, saveCashCount, saveCostSheet, saveOpeningYear } from "@/modules/accounting/service";
import { getAdminScope } from "../scope";
import { runAction } from "../runAction";
import { requireUnlocked } from "./gate";

const id = z.string().min(1).max(64);
const amount = z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter a number");
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((d) => new Date(`${d}T12:00:00Z`));
const paths = ["/accounting", "/shipment-cost"];

async function unlockCookie(token: string) {
  (await cookies()).set(PIN_COOKIE, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 3600 });
}

export async function setPinAction(pin: string, confirm: string) {
  return runAction(
    "accounting",
    async () => {
      const user = await requireUser();
      await setPin(prisma, user, z.string().max(8).parse(pin), z.string().max(8).parse(confirm));
      await unlockCookie(await unlockWithPin(prisma, user, pin));
    },
    paths,
  );
}

export async function unlockAction(pin: string) {
  return runAction(
    "accounting",
    async () => {
      const user = await requireUser();
      await unlockCookie(await unlockWithPin(prisma, user, z.string().max(8).parse(pin)));
    },
    paths,
  );
}

/** Lock: forget the unlock for this browser. */
export async function lockAction() {
  (await cookies()).delete(PIN_COOKIE);
  return { ok: true as const };
}

export async function saveSheetAction(shipmentId: string, sheet: "origin" | "mgq", values: Record<string, string>) {
  return runAction(
    "accounting",
    async () => {
      const user = await requireUnlocked();
      await saveCostSheet(prisma, user, id.parse(shipmentId), z.enum(["origin", "mgq"]).parse(sheet), z.record(z.string().max(40), z.string().max(60)).parse(values));
    },
    paths,
  );
}

const outForm = z.object({
  category: z.enum(["SHIPMENT_COST", "EXPENSE", "COMMISSION", "TRANSFER", "DEBT", "PROFIT_PAYOUT"]),
  amount,
  bankId: id,
  paidAt: day,
  sentTo: z.string().trim().max(160).optional(),
  sentVia: z.string().trim().max(60).optional(),
  sentAccount: z.string().trim().max(60).optional(),
  note: z.string().trim().max(300).optional(),
  shipmentId: id.optional().or(z.literal("").transform(() => undefined)),
  stage: z.enum(["ORIGIN", "TRANSIT", "ARRIVED"]).optional().or(z.literal("").transform(() => undefined)),
  partner: z.enum(["SOMALI_TRANSPORT", "MAHAD"]).optional().or(z.literal("").transform(() => undefined)),
  commissions: z.array(z.object({ invoiceId: id, amount })).max(200).optional(),
  forYear: z.literal("").transform(() => undefined).or(z.coerce.number().int()).optional(),
  reference: z.string().trim().max(120).optional(),
});
export type OutFormValues = z.input<typeof outForm>;

export async function addOutAction(values: OutFormValues) {
  return runAction(
    "accounting",
    async () => {
      const user = await requireUnlocked();
      const scope = await getAdminScope(user);
      const v = outForm.parse(values);
      // Every out says who it went to and how (owner 2026-10-25).
      if (!v.sentTo) throw new ValidationError(v.category === "DEBT" ? "Enter who took the money" : "Enter who it was sent to");
      if (!v.sentVia) throw new ValidationError("Choose how it was sent");
      return addOut(prisma, user, scope, v);
    },
    paths,
  );
}

export async function reverseOutAction(outId: string) {
  return runAction(
    "accounting",
    async () => {
      const user = await requireUnlocked();
      await reverseOut(prisma, user, id.parse(outId));
    },
    paths,
  );
}

export async function returnDebtAction(debtId: string, value: string, bankId: string, date: string) {
  return runAction(
    "accounting",
    async () => {
      const user = await requireUnlocked();
      return returnDebt(prisma, user, { debtId: id.parse(debtId), amount: amount.parse(value), bankId: id.parse(bankId), returnedAt: day.parse(date) });
    },
    paths,
  );
}

export async function saveCountAction(counts: { bankId: string; amount: string }[]) {
  return runAction(
    "accounting",
    async () => {
      const user = await requireUnlocked();
      const scope = await getAdminScope(user);
      await saveCashCount(prisma, user, scope, z.array(z.object({ bankId: id, amount })).max(20).parse(counts));
    },
    paths,
  );
}

export async function closePeriodAction(period: string) {
  return runAction(
    "accounting",
    async () => {
      const user = await requireUnlocked();
      const scope = await getAdminScope(user);
      await closePeriod(prisma, user, scope, z.enum(["H1", "H2", "YEAR"]).parse(period));
    },
    paths,
  );
}

/** Super Admin only (checked in the service): reopen a closed period of 2026 onward. */
export async function reopenPeriodAction(period: string) {
  return runAction(
    "accounting",
    async () => {
      const user = await requireUnlocked();
      const scope = await getAdminScope(user);
      await reopenPeriod(prisma, user, scope, z.enum(["H1", "YEAR"]).parse(period));
    },
    paths,
  );
}

const money = z.string().trim().max(20);
const openingYear = z.object({
  fromYear: z.coerce.number().int(),
  total: money,
  banks: z.array(z.object({ bankId: id, amount: money })).max(30),
  note: z.string().trim().max(300).optional(),
});
export type OpeningYearValues = z.input<typeof openingYear>;

export async function saveOpeningYearAction(values: OpeningYearValues) {
  return runAction(
    "accounting",
    async () => {
      const user = await requireUnlocked();
      const scope = await getAdminScope(user);
      await saveOpeningYear(prisma, user, scope, openingYear.parse(values));
    },
    paths,
  );
}

export async function removeOpeningYearAction(fromYear: number) {
  return runAction(
    "accounting",
    async () => {
      const user = await requireUnlocked();
      const scope = await getAdminScope(user);
      await removeOpeningYear(prisma, user, scope, z.coerce.number().int().parse(fromYear));
    },
    paths,
  );
}

const openingDebt = z.object({ fromYear: z.coerce.number().int(), amount: money, person: z.string().trim().max(160), note: z.string().trim().max(300).optional() });

export async function addOpeningDebtAction(values: z.input<typeof openingDebt>) {
  return runAction(
    "accounting",
    async () => {
      const user = await requireUnlocked();
      const scope = await getAdminScope(user);
      await addOpeningDebt(prisma, user, scope, openingDebt.parse(values));
    },
    paths,
  );
}

export async function reverseOpeningAction(entryId: string) {
  return runAction(
    "accounting",
    async () => {
      const user = await requireUnlocked();
      await reverseOpening(prisma, user, id.parse(entryId));
    },
    paths,
  );
}
