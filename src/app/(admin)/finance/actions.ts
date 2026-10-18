"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/db/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { createInvoice } from "@/modules/finance/invoices";
import { recordPayment } from "@/modules/finance/payments";

export type ActionState = { error: string | null; ok?: boolean };

const invoiceSchema = z.object({
  customerRef: z.string().min(1),
  category: z.enum(["FREIGHT", "LOCAL_DELIVERY", "CUSTOMS_TAX", "SERVICE", "OTHER"]),
  description: z.string().optional(),
  quantity: z.string().min(1),
  unitPrice: z.string().min(1),
});

export async function createInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = invoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the invoice details" };

  const customer = await prisma.customer.findUnique({ where: { ref: parsed.data.customerRef } });
  if (!customer) return { error: `No customer with reference ${parsed.data.customerRef}` };

  try {
    await createInvoice(prisma, user, {
      customerId: customer.id,
      lines: [
        {
          category: parsed.data.category,
          description: parsed.data.description,
          quantity: parsed.data.quantity,
          unitPrice: parsed.data.unitPrice,
        },
      ],
    });
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "You cannot create invoices." };
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  revalidatePath("/finance");
  return { error: null, ok: true };
}

const paymentSchema = z.object({
  invoiceNumber: z.string().min(1),
  amount: z.string().min(1),
  method: z.enum(["CASH", "BANK_TRANSFER", "MOBILE_MONEY", "OTHER"]),
});

export async function recordPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the payment details" };

  const invoice = await prisma.invoice.findUnique({ where: { number: parsed.data.invoiceNumber } });
  if (!invoice) return { error: `No invoice ${parsed.data.invoiceNumber}` };

  try {
    await recordPayment(prisma, user, {
      customerId: invoice.customerId,
      amount: parsed.data.amount,
      currency: invoice.currency,
      method: parsed.data.method,
      allocations: [{ invoiceId: invoice.id, amount: parsed.data.amount }],
    });
  } catch (e) {
    if (e instanceof AuthorizationError) return { error: "You cannot record payments." };
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  revalidatePath("/finance");
  return { error: null, ok: true };
}
