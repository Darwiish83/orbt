import type { Payment, PaymentMethod, Prisma, PrismaClient } from "@prisma/client";
import { ValidationError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import { isYearClosed } from "@/modules/accounting/periods";
import { requirePermission, type AuthzUser } from "@/modules/authz/core";
import { recomputeInvoice } from "./invoices";
import { issueReceipt } from "./receipts";
import { dec, gt, round2, sum } from "./money";

type TxClient = Prisma.TransactionClient;

/** A closed business year cannot change: its shipments' invoices take no new
 * or reversed payments (owner 2026-10-25). Unpaid invoices were carried to
 * next year as debts, paid back in Accounting → Debts. */
async function assertInvoiceYearOpen(tx: TxClient, invoiceId: string) {
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { shipment: { select: { originCountry: true, businessYear: true } } } });
  if (inv?.shipment && (await isYearClosed(tx, inv.shipment.originCountry, inv.shipment.businessYear))) {
    throw new ValidationError("This year is closed. Record the payment in Accounting → Debts.");
  }
}

export interface AllocationInput {
  invoiceId: string;
  amount: number | string;
}

export interface RecordPaymentInput {
  customerId: string;
  amount: number | string;
  currency?: string;
  method: PaymentMethod;
  /** Bank the money arrived in (Salaam / Dahabshiil / Premier / Cash). */
  bankId?: string;
  reference?: string;
  idempotencyKey?: string;
  receivedAt?: Date;
  allocations?: AllocationInput[];
  /** Send the customer a "Payment received ✓" notification (spec B9). */
  notifyCustomer?: boolean;
}

/**
 * Record a payment and allocate it to invoices. Server-authoritative:
 * - amounts are decimal, currency explicit and must match each invoice;
 * - allocations cannot exceed the payment amount, nor an invoice's balance;
 * - the payment + allocations + invoice recompute happen in one transaction;
 * - idempotent on idempotencyKey (a replay returns the original payment);
 * - a numbered receipt (RCP-<year>-<n>) is issued in the same transaction.
 */
export async function recordPayment(
  db: PrismaClient,
  actor: AuthzUser,
  input: RecordPaymentInput,
): Promise<Payment> {
  requirePermission(actor, "payments:write");

  // Idempotency replay.
  if (input.idempotencyKey) {
    const existing = await db.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
  }

  return db.$transaction((tx) => recordPaymentTx(tx, actor, input));
}

/** recordPayment's body, for callers that already hold a transaction. The
 * caller has checked the permission. */
export async function recordPaymentTx(tx: TxClient, actor: AuthzUser, input: RecordPaymentInput): Promise<Payment> {
  const currency = input.currency ?? "USD";
  const amount = round2(dec(input.amount));
  if (!gt(amount, 0)) throw new ValidationError("Payment amount must be positive");

  const allocations = input.allocations ?? [];
  const allocTotal = round2(sum(allocations.map((a) => dec(a.amount))));
  if (gt(allocTotal, amount)) {
    throw new ValidationError("Allocations exceed the payment amount");
  }

  if (input.bankId) {
    const bank = await tx.bank.findUnique({ where: { id: input.bankId } });
    if (!bank || !bank.active) throw new ValidationError("Unknown or inactive bank");
  }

  // Lock each target invoice row so two concurrent payments can't both pass the
  // balance check, then validate ownership, currency, not void, balance.
  const invoiceNumbers: string[] = [];
  for (const a of allocations) {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${a.invoiceId} FOR UPDATE`;
    const invoice = await tx.invoice.findUnique({ where: { id: a.invoiceId } });
    if (!invoice) throw new ValidationError(`Invoice not found: ${a.invoiceId}`);
    if (invoice.customerId !== input.customerId) {
      throw new ValidationError("Invoice belongs to a different customer");
    }
    if (invoice.currency !== currency) {
      throw new ValidationError("Payment currency does not match the invoice currency");
    }
    if (invoice.status === "VOID") throw new ValidationError("Cannot allocate to a void invoice");
    await assertInvoiceYearOpen(tx, invoice.id);
    const balance = round2(invoice.total.minus(invoice.amountAllocated));
    if (gt(dec(a.amount), balance)) {
      throw new ValidationError("Allocation exceeds the invoice balance");
    }
    invoiceNumbers.push(invoice.number);
  }

  const payment = await tx.payment.create({
    data: {
      customerId: input.customerId,
      amount,
      currency,
      method: input.method,
      bankId: input.bankId,
      reference: input.reference,
      idempotencyKey: input.idempotencyKey,
      receivedAt: input.receivedAt,
      actorUserId: actor.id,
    },
  });

  const receipt = await issueReceipt(tx, {
    direction: "IN",
    kind: "PAYMENT",
    amount,
    currency,
    bankId: input.bankId,
    customerId: input.customerId,
    paymentId: payment.id,
    actorUserId: actor.id,
    issuedAt: payment.receivedAt,
  });

  for (const a of allocations) {
    await tx.paymentAllocation.create({
      data: { paymentId: payment.id, invoiceId: a.invoiceId, amount: round2(dec(a.amount)) },
    });
    await recomputeInvoice(tx, a.invoiceId);
  }

  if (input.notifyCustomer) {
    await tx.notification.create({
      data: {
        audience: "CUSTOMER",
        type: "payment",
        customerId: input.customerId,
        title: "Payment received ✓",
        message: `${amount.toFixed(2)} ${currency} · ${receipt.number}${invoiceNumbers.length ? " · " + invoiceNumbers.join(", ") : ""}`,
        status: "SENT",
        sentAt: new Date(),
        createdByUserId: actor.id,
      },
    });
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
      receipt: receipt.number,
    },
  });

  return payment;
}

/**
 * Reverse a payment. The payment and its allocation rows are KEPT (financial
 * history is never hard-deleted); the payment and its receipt are marked
 * reversed and the affected invoices are recomputed excluding it.
 */
export async function reversePayment(
  db: PrismaClient,
  actor: AuthzUser,
  paymentId: string,
  reason: string,
): Promise<Payment> {
  requirePermission(actor, "payments:manage");
  return db.$transaction((tx) => reversePaymentTx(tx, actor, paymentId, reason));
}

/** reversePayment's body, for callers that already hold a transaction. */
export async function reversePaymentTx(
  tx: TxClient,
  actor: AuthzUser,
  paymentId: string,
  reason: string,
): Promise<Payment> {
  await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { allocations: true },
  });
  if (payment.reversedAt) return payment;
  for (const a of payment.allocations) await assertInvoiceYearOpen(tx, a.invoiceId);

  const now = new Date();
  const updated = await tx.payment.update({
    where: { id: paymentId },
    data: { reversedAt: now, reversalReason: reason },
  });
  await tx.receipt.updateMany({ where: { paymentId }, data: { reversedAt: now } });

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
}
