"use client";

import { ReceiptPaper, type ReceiptData } from "@/ui/kit";
import { PrintButton } from "../../ui";

export function ReceiptView({ r }: { r: ReceiptData }) {
  return (
    <div style={{ maxWidth: 480, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <ReceiptPaper r={r} side="customer" />
      <PrintButton title={r.receiptNo} />
    </div>
  );
}
