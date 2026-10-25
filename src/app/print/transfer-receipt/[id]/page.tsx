import { notFound } from "next/navigation";
import { prisma } from "@/db/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { getTransferReceipt } from "@/modules/transfer/receipts";
import { TransferReceiptPaper } from "@/ui/kit";
import { PrintBar } from "../../PrintBar";

export const metadata = { title: "Receipt Voucher" };

/** Printable Receipt Voucher of a money transfer (staff). */
export default async function TransferReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const r = await getTransferReceipt(prisma, user, id).catch((e) => {
    if (e instanceof AuthorizationError || e instanceof ValidationError) return null;
    throw e;
  });
  if (!r) notFound();
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <PrintBar title={`Receipt ${r.number} · ${r.year}`} />
      <TransferReceiptPaper r={r} />
    </div>
  );
}
