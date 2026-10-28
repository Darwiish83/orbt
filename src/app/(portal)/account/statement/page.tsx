import { withUserDb } from "@/db/scoped";
import { requireUser } from "@/modules/authz/session";
import { myFinance, myProfile, myYears } from "@/modules/portal/customerApp";
import { StatementView } from "./StatementView";

export const metadata = { title: "Statement" };

/** Customer App → Statement PDF: the year's invoices and payments. */
export default async function MyStatementPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await requireUser();
  const years = await withUserDb(user, (db) => myYears(db, user));
  const asked = Number((await searchParams).year);
  const year = years.includes(asked) ? asked : years[0]!;
  const [fin, me] = await withUserDb(user, async (db) => [await myFinance(db, user, year), await myProfile(db, user, year)] as const);
  return <StatementView fin={fin} me={me} year={year} />;
}
