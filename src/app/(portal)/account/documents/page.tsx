import { withUserDb } from "@/db/scoped";
import { listDocuments } from "@/modules/documents/service";
import { requireUser } from "@/modules/authz/session";
import { myRecords, myYears } from "@/modules/portal/customerApp";
import { myTransferReceipts } from "@/modules/transfer/receipts";
import { DocumentsView } from "./DocumentsView";

export const metadata = { title: "Documents" };

/** Customer App → Documents & Records (spec A8–A9), only the customer's own. */
export default async function AccountDocumentsPage({ searchParams }: { searchParams: Promise<{ tab?: string; year?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const years = await withUserDb(user, (db) => myYears(db, user));
  const year = years.includes(Number(sp.year)) ? Number(sp.year) : years[0]!;
  const [{ items }, records, transfers] = await withUserDb(user, async (db) => [await listDocuments(db, user, { pageSize: 100 }), await myRecords(db, user, year), await myTransferReceipts(db, user)] as const);
  const docs = items.map((d) => ({ id: d.id, filename: d.filename ?? "document", size: d.size, date: d.createdAt.toISOString(), reference: d.reference }));
  const tab = sp.tab === "records" || sp.tab === "transfer" ? sp.tab : "packing";
  return <DocumentsView docs={docs} records={records} transfers={transfers} year={year} years={years} tab={tab} />;
}
