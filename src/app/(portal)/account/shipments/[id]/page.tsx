import { notFound } from "next/navigation";
import { withUserDb } from "@/db/scoped";
import { ValidationError } from "@/lib/errors";
import { requireUser } from "@/modules/authz/session";
import { myProfile, myShipment } from "@/modules/portal/customerApp";
import { ShipmentDetailView } from "./ShipmentDetailView";

export const metadata = { title: "Shipment details" };

/** Customer App → Shipment detail (spec A4): only the customer's own shipment. */
export default async function MyShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const d = await withUserDb(user, (db) => myShipment(db, user, id)).catch((e) => {
    if (e instanceof ValidationError) return null;
    throw e;
  });
  if (!d) notFound();
  const me = await withUserDb(user, (db) => myProfile(db, user));
  return <ShipmentDetailView d={d} ref_={me.ref} />;
}
