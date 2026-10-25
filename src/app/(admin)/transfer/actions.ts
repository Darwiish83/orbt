"use server";

import { z } from "zod";
import { prisma } from "@/db/client";
import { requireUser } from "@/modules/authz/session";
import { addReceive, deleteReceive, deleteSend, editReceive, recordSend, setHanded, startNewMonth } from "@/modules/transfer/money";
import { createTransferReceipt, voidTransferReceipt } from "@/modules/transfer/receipts";
import { getAdminScope } from "../scope";
import { runAction } from "../runAction";

const id = z.string().min(1).max(64);
const receive = z.object({
  country: z.string().min(1).max(60),
  kind: z.enum(["CUSTOMER", "OPERATION"]),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.string().max(20),
  feePct: z.string().max(10).optional(),
  currency: z.string().max(5),
  description: z.string().max(160),
  tag: z.enum(["CLOTHES", "MEDICINE", "OTHER"]).nullable().optional(),
});
export type ReceiveValues = z.input<typeof receive>;
const send = z.object({
  sentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.string().max(20),
  currency: z.string().max(5),
  status: z.enum(["PAID", "PENDING"]),
});
export type SendValues = z.input<typeof send>;
const paths = ["/transfer", "/accounting"];

export async function saveReceiveAction(rowId: string | null, values: ReceiveValues) {
  return runAction(
    "transfer",
    async () => {
      const user = await requireUser();
      const scope = await getAdminScope(user).catch(() => null);
      const v = receive.parse(values);
      const input = { ...v, year: scope?.year ?? Number(v.receivedAt.slice(0, 4)) };
      if (rowId) await editReceive(prisma, user, id.parse(rowId), input);
      else await addReceive(prisma, user, input);
    },
    paths,
  );
}

export async function handedAction(rowId: string, handed: boolean) {
  return runAction(
    "transfer",
    async () => {
      const user = await requireUser();
      await setHanded(prisma, user, id.parse(rowId), z.boolean().parse(handed));
    },
    paths,
  );
}

export async function saveSendAction(rowId: string, values: SendValues) {
  return runAction(
    "transfer",
    async () => {
      const user = await requireUser();
      await recordSend(prisma, user, id.parse(rowId), send.parse(values));
    },
    paths,
  );
}

export async function deleteAction(rowId: string, part: "receive" | "send") {
  return runAction(
    "transfer",
    async () => {
      const user = await requireUser();
      if (z.enum(["receive", "send"]).parse(part) === "send") await deleteSend(prisma, user, id.parse(rowId));
      else await deleteReceive(prisma, user, id.parse(rowId));
    },
    paths,
  );
}

const receipt = z.object({
  receivedFrom: z.string().max(120),
  reference: z.string().max(20).optional(),
  amount: z.string().max(20),
  fee: z.string().max(20).optional(),
  description: z.string().max(160),
});
export type TransferReceiptValues = z.input<typeof receipt>;

export async function createReceiptAction(rowId: string, values: TransferReceiptValues) {
  return runAction(
    "transfer",
    async () => {
      const user = await requireUser();
      return createTransferReceipt(prisma, user, id.parse(rowId), receipt.parse(values));
    },
    [...paths, "/account/documents"],
  );
}

export async function voidReceiptAction(receiptId: string) {
  return runAction(
    "transfer",
    async () => {
      const user = await requireUser();
      await voidTransferReceipt(prisma, user, id.parse(receiptId));
    },
    [...paths, "/account/documents"],
  );
}

export async function newMonthAction(country: string) {
  return runAction(
    "transfer",
    async () => {
      const user = await requireUser();
      const scope = await getAdminScope(user).catch(() => null);
      return startNewMonth(prisma, user, { country: z.string().max(60).parse(country), year: scope?.year ?? new Date().getUTCFullYear() });
    },
    paths,
  );
}
