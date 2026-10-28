"use client";

import { InvoicePaper } from "@/ui/kit";
import type { InvoiceDocument } from "@/modules/finance/shipmentFinance";
import { PrintButton } from "../../ui";

/** The invoice paper (combined rate, bank accounts, demurrage warning) and its PDF. */
export function InvoiceView({ inv }: { inv: InvoiceDocument }) {
  return (
    <>
      <InvoicePaper inv={inv} />
      <PrintButton title={inv.number} />
    </>
  );
}
