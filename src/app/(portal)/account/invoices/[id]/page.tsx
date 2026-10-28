import { notFound } from "next/navigation";
import { withUserDb } from "@/db/scoped";
import { ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { myInvoiceDocument } from "@/modules/portal/customerApp";
import { InvoiceView } from "./InvoiceView";

export const metadata = { title: "Invoice" };

/** Customer App → Invoice paper (spec A6): only the customer's own invoice. */
export default async function MyInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const inv = await withUserDb(user, (db) => myInvoiceDocument(db, user, id)).catch((e) => {
    if (e instanceof ValidationError) return null;
    throw e;
  });
  if (!inv) notFound();
  return <InvoiceView inv={inv} />;
}
