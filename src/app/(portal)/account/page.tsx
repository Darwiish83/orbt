import { withUserDb } from "@/db/scoped";
import { requireUser } from "@/modules/authz/session";
import { myProfile, myShipments } from "@/modules/portal/customerApp";
import { HomeView } from "./HomeView";

export const metadata = { title: "Home" };

/** Customer App → Home (spec A2). */
export default async function AccountHomePage() {
  const user = await requireUser();
  const year = new Date().getUTCFullYear();
  const [me, ships] = await withUserDb(user, async (db) => [await myProfile(db, user, year), await myShipments(db, user, year)] as const);
  return <HomeView me={me} ships={ships} year={year} />;
}
