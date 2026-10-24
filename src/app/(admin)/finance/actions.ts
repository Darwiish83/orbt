"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/db/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { captureError } from "@/lib/logger";
import { requireUser } from "@/modules/authz/session";
import {
  addShipmentPayment,
  createShipmentInvoice,
  deleteShipmentInvoice,
  deleteShipmentPayment,
  editShipmentPayment,
  getInvoiceDocument,
  getPaymentReceipt,
  updateShipmentInvoice,
  type InvoiceDocument,
  type PaymentReceiptDoc,
} from "@/modules/finance/shipmentFinance";
import {
  approveDemurrage,
  markCargoCollected,
  sendDemurrageWarning,
  sendPaymentReminders,
  setExtraFreeDays,
} from "@/modules/finance/ledger";
import { getAdminScope } from "../scope";

export type FinanceResult<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

/** Map service errors to safe, fixed messages (translated in the UI). */
async function run<T>(fn: () => Promise<T>, message?: (r: T) => string): Promise<FinanceResult<T>> {
  try {
    const r = await fn();
    revalidatePath("/finance");
    return { ok: true, data: r, message: message?.(r) };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, error: "You don't have permission to do this." };
    if (e instanceof ValidationError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Check the highlighted fields." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "This customer already has an invoice for this shipment" };
    }
    captureError(e, { area: "finance" });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const id = z.string().min(1).max(64);
const amount = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,3})?$/, "Enter a number");
const optAmount = amount.optional().or(z.literal("").transform(() => undefined));

const invoiceForm = z.object({
  billedMeasure: amount,
  baseRate: amount,
  qualityRate: optAmount,
  brandPcs: z.coerce.number().int().min(0).max(1_000_000).optional(),
  brandRate: optAmount,
  fatura: optAmount,
  localDelivery: optAmount,
  others: optAmount,
  othersDescription: z.string().trim().max(120).optional(),
  discount: optAmount,
  agentName: z.string().trim().max(120).optional(),
  agentRate: optAmount,
});
export type InvoiceFormValues = z.input<typeof invoiceForm>;

export async function createInvoiceAction(shipmentId: string, customerId: string, values: InvoiceFormValues) {
  return run(
    async () => {
      const user = await requireUser();
      const v = invoiceForm.parse(values);
      const inv = await createShipmentInvoice(prisma, user, { shipmentId: id.parse(shipmentId), customerId: id.parse(customerId), ...v });
      return { id: inv.id, number: inv.number };
    },
    (r) => r.number,
  );
}

export async function updateInvoiceAction(invoiceId: string, values: InvoiceFormValues) {
  return run(
    async () => {
      const user = await requireUser();
      const inv = await updateShipmentInvoice(prisma, user, id.parse(invoiceId), invoiceForm.parse(values));
      return { id: inv.id, number: inv.number };
    },
    (r) => r.number,
  );
}

export async function deleteInvoiceAction(invoiceId: string) {
  return run(async () => {
    const user = await requireUser();
    const inv = await deleteShipmentInvoice(prisma, user, id.parse(invoiceId));
    return { number: inv.number };
  });
}

export async function loadInvoiceAction(invoiceId: string): Promise<FinanceResult<InvoiceDocument>> {
  try {
    const user = await requireUser();
    return { ok: true, data: await getInvoiceDocument(prisma, user, id.parse(invoiceId)) };
  } catch (e) {
    if (e instanceof AuthorizationError || e instanceof ValidationError) return { ok: false, error: "Invoice not found" };
    throw e;
  }
}

const paymentForm = z.object({
  amount,
  bankId: id,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type PaymentFormValues = z.input<typeof paymentForm>;
const atNoonUtc = (d: string) => new Date(`${d}T12:00:00Z`);

export async function addPaymentAction(invoiceId: string, values: PaymentFormValues, idempotencyKey: string) {
  return run(
    async () => {
      const user = await requireUser();
      const v = paymentForm.parse(values);
      const p = await addShipmentPayment(prisma, user, {
        invoiceId: id.parse(invoiceId),
        amount: v.amount,
        bankId: v.bankId,
        receivedAt: atNoonUtc(v.date),
        idempotencyKey: z.string().uuid().parse(idempotencyKey),
      });
      return { id: p.id };
    },
  );
}

export async function editPaymentAction(paymentId: string, values: PaymentFormValues) {
  return run(async () => {
    const user = await requireUser();
    const v = paymentForm.parse(values);
    const p = await editShipmentPayment(prisma, user, id.parse(paymentId), { amount: v.amount, bankId: v.bankId, receivedAt: atNoonUtc(v.date) });
    return { id: p.id };
  });
}

export async function deletePaymentAction(paymentId: string) {
  return run(async () => {
    const user = await requireUser();
    await deleteShipmentPayment(prisma, user, id.parse(paymentId));
  });
}

export async function loadReceiptAction(paymentId: string): Promise<FinanceResult<PaymentReceiptDoc>> {
  try {
    const user = await requireUser();
    return { ok: true, data: await getPaymentReceipt(prisma, user, id.parse(paymentId)) };
  } catch (e) {
    if (e instanceof AuthorizationError || e instanceof ValidationError) return { ok: false, error: "Receipt not found" };
    throw e;
  }
}

// ------------------------------------------------------------------ reminders

export async function sendRemindersAction(invoiceIds: string[]) {
  return run(async () => {
    const user = await requireUser();
    const scope = await getAdminScope(user);
    return sendPaymentReminders(prisma, user, scope, z.array(id).min(1).max(500).parse(invoiceIds));
  });
}

const demurrageInput = z.object({
  shipmentId: id,
  customerId: id,
  freeDays: z.coerce.number().int().min(0).max(365),
  ratePerDay: amount,
});
export type DemurrageInput = z.input<typeof demurrageInput>;

export async function warnDemurrageAction(input: DemurrageInput) {
  return run(async () => {
    const user = await requireUser();
    await sendDemurrageWarning(prisma, user, demurrageInput.parse(input));
  });
}

export async function approveDemurrageAction(input: DemurrageInput) {
  return run(
    async () => {
      const user = await requireUser();
      return approveDemurrage(prisma, user, demurrageInput.parse(input));
    },
    (r) => `${r.invoiceNo} · +$${r.added}`,
  );
}

export async function extraDaysAction(shipmentId: string, customerId: string, days: number) {
  return run(async () => {
    const user = await requireUser();
    await setExtraFreeDays(prisma, user, { shipmentId: id.parse(shipmentId), customerId: id.parse(customerId), days: z.number().int().min(0).max(365).parse(days) });
  });
}

export async function collectedAction(shipmentId: string, customerId: string) {
  return run(async () => {
    const user = await requireUser();
    await markCargoCollected(prisma, user, { shipmentId: id.parse(shipmentId), customerId: id.parse(customerId) });
  });
}
