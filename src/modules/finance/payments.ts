import type { Payment, PaymentMethod, PrismaClient } from "@prisma/client";
import { ValidationError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import { requirePermission, type AuthzUser } from "@/modules/authz/core";
import { recomputeInvoice } from "./invoices";
import { dec, gt, round2, sum } from "./money";

export interface AllocationInput {
  invoiceId: string;
  amount: number | string;
}

export interface RecordPaymentInput {
  customerId: string;
  amount: number | string;
  currency?: string;
  method: PaymentMethod;
  reference?: string;
  idempotencyKey?: string;
  allocations?: AllocationInput[];
}

/**
 * Record a payment and allocate it to invoices. Server-authoritative:
 * - amounts are decimal, currency explicit and must match each invoice;
 * - allocations cannot exceed the payment amount, nor an invoice's balance;
 * - the payment + allocations + invoice recompute happen in one transaction;
 * - idempotent on idempotencyKey (a replay returns the original payment).
 */
export async function recordPayment(
  db: PrismaClient,
  actor: AuthzUser,
  input: RecordPaymentInput,
): Promise<Payment> {
  requirePermission(actor, "payments:write");

  const currency = input.currency ?? "USD";
  const amount = round2(dec(input.amount));
  if (!gt(amount, 0)) throw new ValidationError("Payment amount must be positive");

  const allocations = input.allocations ?? [];
  const allocTotal = round2(sum(allocations.map((a) => dec(a.amount))));
  if (gt(allocTotal, amount)) {
    throw new ValidationError("Allocations exceed the payment amount");
  }

  // Idempotency replay.
  if (input.idempotencyKey) {
    const existing = await db.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
  }

  return db.$transaction(async (tx) => {
    // Validate each target invoice: ownership, currency, not void, sufficient balance.
    for (const a of allocations) {
      const invoice = await tx.invoice.findUnique({ where: { id: a.invoiceId } });
      if (!invoice) throw new ValidationError(`Invoice not found: ${a.invoiceId}`);
      if (invoice.customerId !== input.customerId) {
        throw new ValidationError("Invoice belongs to a different customer");
      }
      if (invoice.currency !== currency) {
        throw new ValidationError("Payment currency does not match the invoice currency");
      }
      if (invoice.status === "VOID") throw new ValidationError("Cannot allocate to a void invoice");
      const balance = round2(invoice.total.minus(invoice.amountAllocated));
      if (gt(dec(a.amount), balance)) {
        throw new ValidationError("Allocation exceeds the invoice balance");
      }
    }

    const payment = await tx.payment.create({
      data: {
        customerId: input.customerId,
        amount,
        currency,
        method: input.method,
        reference: input.reference,
        idempotencyKey: input.idempotencyKey,
        actorUserId: actor.id,
      },
    });

    for (const a of allocations) {
      await tx.paymentAllocation.create({
        data: { paymentId: payment.id, invoiceId: a.invoiceId, amount: round2(dec(a.amount)) },
      });
      await recomputeInvoice(tx, a.invoiceId);
    }

    await logAudit(tx, {
      actorUserId: actor.id,
      action: "payment.record",
      entityType: "Payment",
      entityId: payment.id,
      metadata: {
        amount: amount.toString(),
        currency,
        allocated: allocTotal.toString(),
        invoices: allocations.map((a) => a.invoiceId),
      },
    });

    return payment;
  });
}

/**
 * Reverse a payment. The payment and its allocation rows are KEPT (financial
 * history is never hard-deleted); the payment is marked reversed and the
 * affected invoices are recomputed excluding it.
 */
export async function reversePayment(
  db: PrismaClient,
  actor: AuthzUser,
  paymentId: string,
  reason: string,
): Promise<Payment> {
  requirePermission(actor, "payments:manage");

  return db.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { allocations: true },
    });
    if (payment.reversedAt) return payment;

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: { reversedAt: new Date(), reversalReason: reason },
    });

    const invoiceIds = [...new Set(payment.allocations.map((a) => a.invoiceId))];
    for (const invoiceId of invoiceIds) await recomputeInvoice(tx, invoiceId);

    await logAudit(tx, {
      actorUserId: actor.id,
      action: "payment.reverse",
      entityType: "Payment",
      entityId: paymentId,
      metadata: { reason, amount: payment.amount.toString(), currency: payment.currency },
    });

    return updated;
  });
}
