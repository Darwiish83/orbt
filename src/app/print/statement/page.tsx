import { prisma } from "@/db/client";
import { requireUser } from "@/modules/authz/session";
import { buildStatement } from "@/modules/finance/ledger";
import { getAdminScope } from "@/app/(admin)/scope";
import { PrintBar } from "../PrintBar";
import { StatementPaper } from "./StatementPaper";

export const metadata = { title: "Statement" };

export default async function PrintStatementPage({ searchParams }: { searchParams: Promise<{ cust?: string; sq?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const scope = await getAdminScope(user);
  const customer = sp.cust ? await prisma.customer.findUnique({ where: { id: sp.cust }, select: { id: true, ref: true, name: true } }) : null;
  const statement = await buildStatement(prisma, user, scope, { customerId: customer?.id, q: sp.sq });
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto" }}>
      <PrintBar title={`Statement ${customer?.ref ?? "all"} ${scope.year}`} />
      <StatementPaper statement={statement} scope={{ year: scope.year, country: scope.country }} customer={customer} />
    </div>
  );
}
