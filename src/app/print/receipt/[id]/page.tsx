import { notFound } from "next/navigation";
import { withUserDb } from "@/db/scoped";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { getPaymentReceipt } from "@/modules/finance/shipmentFinance";
import { ReceiptPaper } from "@/ui/kit";
import { PrintBar } from "../../PrintBar";

export const metadata = { title: "Receipt" };

export default async function PrintReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  // A customer reads through their own connection (Row-Level Security, ADR-029).
  const r = await withUserDb(user, (db) => getPaymentReceipt(db, user, id)).catch((e) => {
    if (e instanceof AuthorizationError || e instanceof ValidationError) return null;
    throw e;
  });
  if (!r) notFound();
  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <PrintBar title={r.receiptNo} />
      <ReceiptPaper r={r} />
    </div>
  );
}
