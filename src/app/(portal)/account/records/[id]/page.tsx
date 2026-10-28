import { notFound } from "next/navigation";
import { withUserDb } from "@/db/scoped";
import { ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { myProfile, myShipment } from "@/modules/portal/customerApp";
import { RecordView } from "./RecordView";

export const metadata = { title: "Record details" };

/** Customer App → Record detail (spec A9): overview, documents and transactions of one shipment. */
export default async function MyRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const d = await withUserDb(user, (db) => myShipment(db, user, id)).catch((e) => {
    if (e instanceof ValidationError) return null;
    throw e;
  });
  if (!d) notFound();
  const me = await withUserDb(user, (db) => myProfile(db, user));
  return <RecordView d={d} me={me} />;
}
