import { notFound } from "next/navigation";
import { prisma } from "@/db/client";
import { withUserDb } from "@/db/scoped";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { getInvoiceDocument } from "@/modules/finance/shipmentFinance";
import { getSettings } from "@/modules/settings/service";
import { InvoicePaper } from "@/ui/kit";
import { PrintBar } from "@/app/print/PrintBar";

export const metadata = { title: "Invoice" };

/** A customer's own invoice, to print or save as PDF (owner 2026-10-28). */
export default async function MyInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const inv = await withUserDb(user, (db) => getInvoiceDocument(db, user, id)).catch((e) => {
    if (e instanceof AuthorizationError || e instanceof ValidationError) return null;
    throw e;
  });
  if (!inv) notFound();
  const { company } = await getSettings(prisma);
  return (
    <div className="print-page" style={{ maxWidth: 720, margin: "0 auto" }}>
      <PrintBar title={inv.number} />
      <InvoicePaper inv={inv} print company={{ name: company.name, address: company.address, phone: company.phone }} />
    </div>
  );
}
