import { withUserDb } from "@/db/scoped";
import { listInvoices } from "@/modules/finance/invoices";
import { myPaymentReceipts } from "@/modules/finance/shipmentFinance";
import { requireUser } from "@/modules/authz/session";
import { InvoiceList, type MyInvoice } from "./InvoiceList";

export const metadata = { title: "My invoices" };

/** The customer's invoices, each with its PDF and the receipts of its payments. */
export default async function AccountInvoicesPage() {
  const user = await requireUser();
  const [{ items }, receipts] = await withUserDb(user, async (db) => [await listInvoices(db, user, { pageSize: 50 }), await myPaymentReceipts(db, user)] as const);
  const invoices: MyInvoice[] = items
    .filter((i) => i.status !== "VOID")
    .map((i) => ({
      id: i.id,
      number: i.number,
      currency: i.currency,
      status: i.status,
      total: i.total.toString(),
      paid: i.amountAllocated.toString(),
      balance: i.total.minus(i.amountAllocated).toString(),
      receipts: receipts.filter((r) => r.invoiceId === i.id),
    }));
  return <InvoiceList invoices={invoices} />;
}
