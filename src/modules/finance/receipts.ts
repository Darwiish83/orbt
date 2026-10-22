import type { Prisma, Receipt, ReceiptDirection, ReceiptKind } from "@prisma/client";
import { ValidationError } from "@/lib/errors";
import { dec, gt, round2, type DecimalInput } from "./money";

/** RCP-<year>-<n>, n starting at 1001 per year (spec §0). */
export function formatReceiptNumber(year: number, n: number): string {
  return `RCP-${year}-${n}`;
}

/**
 * Allocate the next receipt number for a year. The single-statement upsert
 * takes a row lock on the year's counter, so concurrent transactions get
 * distinct numbers and a rolled-back transaction leaves no gap-causing row.
 */
export async function nextReceiptNumber(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    INSERT INTO "ReceiptSequence" ("year", "next") VALUES (${year}, 1002)
    ON CONFLICT ("year") DO UPDATE SET "next" = "ReceiptSequence"."next" + 1
    RETURNING "next" - 1 AS n
  `;
  const n = Number(rows[0]?.n);
  if (!Number.isInteger(n)) throw new Error("Receipt sequence did not return a number");
  return formatReceiptNumber(year, n);
}

export interface IssueReceiptInput {
  direction: ReceiptDirection;
  kind: ReceiptKind;
  amount: DecimalInput;
  currency?: string;
  bankId?: string | null;
  customerId?: string | null;
  paymentId?: string | null;
  counterparty?: string | null;
  note?: string | null;
  actorUserId?: string | null;
  issuedAt?: Date;
}

/** Issue a numbered receipt. Must run inside the transaction that moves the money. */
export async function issueReceipt(tx: Prisma.TransactionClient, input: IssueReceiptInput): Promise<Receipt> {
  const amount = round2(dec(input.amount));
  if (!gt(amount, 0)) throw new ValidationError("Receipt amount must be positive");
  const issuedAt = input.issuedAt ?? new Date();
  const year = issuedAt.getUTCFullYear();
  const number = await nextReceiptNumber(tx, year);
  return tx.receipt.create({
    data: {
      number,
      year,
      direction: input.direction,
      kind: input.kind,
      amount,
      currency: input.currency ?? "USD",
      bankId: input.bankId ?? null,
      customerId: input.customerId ?? null,
      paymentId: input.paymentId ?? null,
      counterparty: input.counterparty ?? null,
      note: input.note ?? null,
      actorUserId: input.actorUserId ?? null,
      issuedAt,
    },
  });
}
