"use client";

import { TransferReceiptPaper } from "@/ui/kit";
import type { TransferReceiptDoc } from "@/modules/transfer/receipts";
import { PrintButton } from "../../../ui";

export function TransferReceiptView({ r }: { r: TransferReceiptDoc }) {
  return (
    <>
      <TransferReceiptPaper r={r} />
      <PrintButton title={`Receipt ${r.number} · ${r.year}`} />
    </>
  );
}
