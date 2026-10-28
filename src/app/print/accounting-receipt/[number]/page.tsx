import { notFound } from "next/navigation";
import { prisma } from "@/db/client";
import { AuthorizationError } from "@/lib/errors";
import { listReceipts } from "@/modules/accounting/service";
import { getAdminScope } from "@/app/(admin)/scope";
import { requireUnlocked } from "@/app/(admin)/accounting/gate";
import { PrintBar } from "../../PrintBar";
import { MoneyReceipt } from "./MoneyReceipt";

export const metadata = { title: "Receipt" };

/** Printable receipt for any money movement in Accounting (in or out). */
export default async function AccountingReceiptPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requireUnlocked().catch((e) => {
    if (e instanceof AuthorizationError) return null;
    throw e;
  });
  if (!user) notFound();
  const { number } = await params;
  const scope = await getAdminScope(user);
  const r = (await listReceipts(prisma, user, scope, { q: decodeURIComponent(number) })).find((x) => x.number === decodeURIComponent(number));
  if (!r) notFound();
  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      <PrintBar title={r.number} />
      <MoneyReceipt r={r} scope={scope} />
    </div>
  );
}
