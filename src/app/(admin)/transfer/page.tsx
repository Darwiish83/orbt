import { prisma } from "@/db/client";
import { can } from "@/modules/authz/core";
import { requireUser } from "@/modules/authz/session";
import { monthReport, transferAccess } from "@/modules/transfer/money";
import { getAdminScope } from "../scope";
import { MoneyTransferView } from "./MoneyTransferView";

export const metadata = { title: "Money Transfer" };

/** Money Transfer (spec B11 / §12): Receiver and Sender sides, by month. */
export default async function TransferPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (!can(user, "transfer:read")) return <MoneyTransferView data={null} />;
  const sp = await searchParams;
  const scope = await getAdminScope(user).catch(() => null);
  const year = scope?.year ?? new Date().getUTCFullYear();
  const access = await transferAccess(prisma, user);
  // Super admin follows the top bar's country; Receiver/Sender pick among their own countries.
  const country = access.countries.includes(sp.country ?? "") ? sp.country! : access.role === "SUPER" && scope && access.countries.includes(scope.country) ? scope.country : access.countries[0]!;
  const kind = sp.kind === "OPERATION" ? "OPERATION" : "CUSTOMER";
  const report = await monthReport(prisma, user, { country, year, kind, month: Number(sp.month) || undefined });
  return <MoneyTransferView data={{ report, country, year, kind }} />;
}
