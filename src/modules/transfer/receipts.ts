import type { Prisma, PrismaClient, TransferReceipt } from "@prisma/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import { requirePermission, type AuthzUser } from "@/modules/authz/core";
import { dec, round2 } from "@/modules/finance/money";
import { amountInWords } from "@/modules/finance/words";
import { transferAccess } from "./money";

/**
 * Receipt Voucher for money a customer hands over to be transferred (owner
 * 2026-10-25). Made from a Money Receive row with "Create receipt"; numbered
 * 5000, 5001, … per year. With a customer reference it is shown in that
 * customer's Documents. It is a paper only: it does not change Income.
 */

const s2 = (v: Prisma.Decimal) => round2(v).toString();

/** Receipt numbers start at 5000 every year (owner 2026-10-25): 5000, 5001, … */
export const FIRST_NUMBER = 5000;

/** Next number for the year (row-locked upsert, inside the creating transaction). */
async function nextNumber(tx: Prisma.TransactionClient, year: number): Promise<number> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    INSERT INTO "TransferReceiptSequence" ("year", "next") VALUES (${year}, ${FIRST_NUMBER + 1})
    ON CONFLICT ("year") DO UPDATE SET "next" = "TransferReceiptSequence"."next" + 1
    RETURNING "next" - 1 AS n
  `;
  const n = Number(rows[0]?.n);
  if (!Number.isInteger(n) || n < FIRST_NUMBER) throw new Error("Transfer receipt sequence did not return a number");
  return n;
}

/** The row, in one of the user's Money Transfer countries. */
async function rowFor(db: PrismaClient, actor: AuthzUser, id: string) {
  const row = await db.moneyTransferRow.findUnique({ where: { id } });
  if (!row || row.deletedAt) throw new ValidationError("Not found");
  const a = await transferAccess(db, actor);
  if (!a.countries.includes(row.country)) throw new AuthorizationError("Outside your Money Transfer countries");
  return row;
}

function amount2(v: string | undefined, required: boolean) {
  const raw = (v ?? "").trim().replace(/[\s,]/g, "");
  if (!raw) {
    if (required) throw new ValidationError("Enter the amount");
    return null;
  }
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(raw)) throw new ValidationError("Enter the amount");
  return round2(dec(raw));
}

export interface TransferReceiptInput {
  receivedFrom: string;
  /** Customer reference (OR-…): the receipt then shows in their Documents. */
  reference?: string;
  /** Money to send, after the fee. */
  amount: string;
  /** Optional: when typed, the customer sees it. */
  fee?: string;
  description: string;
}

/** "Create receipt" on a Money Receive row (Receiver). */
export async function createTransferReceipt(db: PrismaClient, actor: AuthzUser, rowId: string, input: TransferReceiptInput) {
  requirePermission(actor, "transfer:receive");
  const row = await rowFor(db, actor, rowId);
  if (row.kind !== "CUSTOMER") throw new ValidationError("Only a customer transfer has a receipt");
  const receivedFrom = input.receivedFrom.trim().toUpperCase().slice(0, 120);
  const description = input.description.trim().toUpperCase().slice(0, 160);
  if (!receivedFrom || !description) throw new ValidationError("Fill all required fields");
  const amount = amount2(input.amount, true)!;
  if (!amount.greaterThan(0)) throw new ValidationError("Enter the amount");
  const fee = amount2(input.fee, false);
  const ref = input.reference?.trim().toUpperCase();
  const customer = ref ? await db.customer.findUnique({ where: { ref } }) : null;
  if (ref && !customer) throw new ValidationError("No customer with this reference");

  const r = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "MoneyTransferRow" WHERE id = ${row.id} FOR UPDATE`;
    const live = await tx.transferReceipt.findFirst({ where: { transferRowId: row.id, voidedAt: null } });
    if (live) throw new ValidationError("This transfer already has a receipt");
    const number = await nextNumber(tx, row.year);
    const created = await tx.transferReceipt.create({
      data: { year: row.year, number, country: row.country, transferRowId: row.id, customerId: customer?.id ?? null, receivedFrom, receivedAt: row.receivedAt, amount, fee, currency: row.currency, description, actorUserId: actor.id },
    });
    await logAudit(tx, { actorUserId: actor.id, action: "transfer.receipt", entityType: "TransferReceipt", entityId: created.id, metadata: { number, year: row.year, amount: amount.toString(), fee: fee?.toString() ?? null, customer: customer?.ref ?? null } });
    return created;
  });
  return { id: r.id, number: r.number };
}

/** A wrong receipt is voided (kept); then a new one can be made for the row. */
export async function voidTransferReceipt(db: PrismaClient, actor: AuthzUser, id: string) {
  requirePermission(actor, "transfer:receive");
  const r = await db.transferReceipt.findUnique({ where: { id } });
  if (!r) throw new ValidationError("Receipt not found");
  if (r.transferRowId) await rowFor(db, actor, r.transferRowId);
  if (r.voidedAt) return;
  await db.transferReceipt.update({ where: { id }, data: { voidedAt: new Date(), voidedBy: actor.id } });
  await logAudit(db, { actorUserId: actor.id, action: "transfer.receipt_void", entityType: "TransferReceipt", entityId: id });
}

export interface TransferReceiptDoc {
  id: string;
  number: number;
  year: number;
  date: string;
  receivedFrom: string;
  customerRef: string | null;
  /** Total: amount + fee (or the amount when no fee is typed). */
  received: string;
  fee: string | null;
  amount: string;
  currency: string;
  inWords: string;
  description: string;
  voided: boolean;
}

function doc(r: TransferReceipt & { customer: { ref: string } | null }): TransferReceiptDoc {
  const received = r.fee ? r.amount.add(r.fee) : r.amount;
  return {
    id: r.id,
    number: r.number,
    year: r.year,
    date: r.receivedAt.toISOString().slice(0, 10),
    receivedFrom: r.receivedFrom,
    customerRef: r.customer?.ref ?? null,
    received: s2(received),
    fee: r.fee ? s2(r.fee) : null,
    amount: s2(r.amount),
    currency: r.currency,
    // "In Word" reads the "Amount of" line: the money sent.
    inWords: amountInWords(s2(r.amount), r.currency),
    description: r.description,
    voided: !!r.voidedAt,
  };
}

/** Staff (Money Transfer country) or the customer it belongs to. */
export async function getTransferReceipt(db: PrismaClient, actor: AuthzUser, id: string): Promise<TransferReceiptDoc> {
  const r = await db.transferReceipt.findUnique({ where: { id }, include: { customer: { select: { ref: true } } } });
  if (!r) throw new ValidationError("Receipt not found");
  if (actor.customerId) {
    if (r.customerId !== actor.customerId || r.voidedAt) throw new ValidationError("Receipt not found");
  } else {
    requirePermission(actor, "transfer:read");
    const a = await transferAccess(db, actor);
    if (!a.countries.includes(r.country)) throw new AuthorizationError("Outside your Money Transfer countries");
  }
  return doc(r);
}

/** The signed-in customer's transfer receipts (Documents → Transfer). */
export async function myTransferReceipts(db: PrismaClient, actor: AuthzUser): Promise<TransferReceiptDoc[]> {
  if (!actor.customerId) throw new AuthorizationError("Customers only");
  const rows = await db.transferReceipt.findMany({ where: { customerId: actor.customerId, voidedAt: null }, include: { customer: { select: { ref: true } } }, orderBy: [{ receivedAt: "desc" }, { number: "desc" }] });
  return rows.map(doc);
}
