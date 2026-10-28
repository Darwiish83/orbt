import { withUserDb } from "@/db/scoped";
import { requireUser } from "@/modules/authz/session";
import { myProfile, myShipments, myYears } from "@/modules/portal/customerApp";
import { ShipmentsView } from "./ShipmentsView";

export const metadata = { title: "My Shipments" };

/** Customer App → Shipments (spec A3), one business year at a time. */
export default async function MyShipmentsPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await requireUser();
  const years = await withUserDb(user, (db) => myYears(db, user));
  const asked = Number((await searchParams).year);
  const year = years.includes(asked) ? asked : years[0]!;
  const [me, ships] = await withUserDb(user, async (db) => [await myProfile(db, user, year), await myShipments(db, user, year)] as const);
  return <ShipmentsView ref_={me.ref} ships={ships} year={year} years={years} />;
}
