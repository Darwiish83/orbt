import { notFound } from "next/navigation";
import { withUserDb } from "@/db/scoped";
import { ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { myPaymentReceipt } from "@/modules/portal/customerApp";
import { ReceiptView } from "./ReceiptView";

export const metadata = { title: "My payment" };

/** Customer App → a payment receipt (stamp and signature), only the customer's own. */
export default async function MyReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const r = await withUserDb(user, (db) => myPaymentReceipt(db, user, id)).catch((e) => {
    if (e instanceof ValidationError) return null;
    throw e;
  });
  if (!r) notFound();
  return <ReceiptView r={r} />;
}
