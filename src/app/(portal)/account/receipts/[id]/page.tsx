import { notFound } from "next/navigation";
import { withUserDb } from "@/db/scoped";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { getPaymentReceipt } from "@/modules/finance/shipmentFinance";
import { ReceiptPaper } from "@/ui/kit";
import { PrintBar } from "@/app/print/PrintBar";

export const metadata = { title: "Receipt" };

/** The receipt of one of the customer's own payments, to print or save as PDF. */
export default async function MyReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const r = await withUserDb(user, (db) => getPaymentReceipt(db, user, id)).catch((e) => {
    if (e instanceof AuthorizationError || e instanceof ValidationError) return null;
    throw e;
  });
  if (!r) notFound();
  return (
    <div className="print-page" style={{ maxWidth: 480, margin: "0 auto" }}>
      <PrintBar title={r.receiptNo} />
      <ReceiptPaper r={r} />
    </div>
  );
}
