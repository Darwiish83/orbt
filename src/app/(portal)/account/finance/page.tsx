import { withUserDb } from "@/db/scoped";
import { requireUser } from "@/modules/authz/session";
import { myFinance, myProfile, myShipments, myYears } from "@/modules/portal/customerApp";
import { FinanceView } from "./FinanceView";

export const metadata = { title: "Finance" };

/** Customer App → Finance (spec A5): invoices, payments and statement for one year. */
export default async function MyFinancePage({ searchParams }: { searchParams: Promise<{ year?: string; tab?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const years = await withUserDb(user, (db) => myYears(db, user));
  const year = years.includes(Number(sp.year)) ? Number(sp.year) : years[0]!;
  const [fin, me, ships] = await withUserDb(user, async (db) => [await myFinance(db, user, year), await myProfile(db, user, year), await myShipments(db, user, year)] as const);
  return <FinanceView fin={fin} me={me} year={year} years={years} shipments={ships.length} tab={sp.tab === "statement" ? "statement" : "invoices"} />;
}
