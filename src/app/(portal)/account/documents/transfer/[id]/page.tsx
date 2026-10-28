import { notFound } from "next/navigation";
import { withUserDb } from "@/db/scoped";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { getTransferReceipt } from "@/modules/transfer/receipts";
import { TransferReceiptView } from "./TransferReceiptView";

export const metadata = { title: "Receipt Voucher" };

/** A customer's own transfer receipt (Documents → Transfer receipts). */
export default async function MyTransferReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const r = await withUserDb(user, (db) => getTransferReceipt(db, user, id)).catch((e) => {
    if (e instanceof AuthorizationError || e instanceof ValidationError) return null;
    throw e;
  });
  if (!r) notFound();
  return <TransferReceiptView r={r} />;
}
