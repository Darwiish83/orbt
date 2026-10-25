import type { OutCategory, ReceiptKind } from "@prisma/client";
import { prisma } from "@/db/client";
import { can } from "@/modules/authz/core";
import { requireUser } from "@/modules/authz/session";
import { hasPin } from "@/modules/accounting/pin";
import {
  countryBalances,
  incomeAndOut,
  listCommissions,
  listDebts,
  listOpening,
  listReceipts,
  listShipmentCosts,
  outFormOptions,
  overview,
  partnersProfit,
  profitAndExpenses,
} from "@/modules/accounting/service";
import { getAdminScope } from "../scope";
import { isUnlocked } from "./gate";
import { AccountingView, type AccountingData, type AccTab } from "./AccountingView";
import { PinGate } from "./PinGate";

export const metadata = { title: "Accounting" };

const TABS: AccTab[] = ["costs", "income", "debts", "partners", "profit", "commissions", "receipts", "overview"];
const OUTS: OutCategory[] = ["SHIPMENT_COST", "EXPENSE", "COMMISSION", "TRANSFER", "DEBT", "PROFIT_PAYOUT"];
const KINDS: ReceiptKind[] = ["PAYMENT", "EXPENSE", "SHIPMENT_COST", "COMMISSION", "TRANSFER", "DEBT", "DEBT_RETURN", "OTHER"];

/** Accounting (spec B10 / §11): special access + PIN, per country and year. */
export default async function AccountingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  if (!can(user, "accounting:read")) return <PinGate mode="denied" />;
  if (!(await hasPin(prisma, user))) return <PinGate mode="set" />;
  if (!(await isUnlocked(user))) return <PinGate mode="enter" />;

  const sp = await searchParams;
  const scope = await getAdminScope(user);
  const tab: AccTab = TABS.includes(sp.tab as AccTab) ? (sp.tab as AccTab) : "costs";
  const mode = sp.mode === "SEA" ? "SEA" : "AIR";
  const data: AccountingData = {
    tab,
    mode,
    scope: { year: scope.year, country: scope.country },
    perms: {
      write: can(user, "accounting:write"),
      manage: can(user, "accounting:manage"),
      origin: can(user, "costorigin:write"),
      mgq: can(user, "costmgq:write"),
    },
  };
  if (tab === "costs") data.costs = await listShipmentCosts(prisma, user, scope, mode);
  if (tab === "income") {
    const filter = OUTS.includes(sp.out as OutCategory) ? (sp.out as OutCategory) : undefined;
    const [io, balances, options] = await Promise.all([
      // All outs: the tab filters them by category (with counts per category).
      incomeAndOut(prisma, user, scope),
      countryBalances(prisma, user, scope.year, scope.countries.map((c) => c.name)),
      outFormOptions(prisma, user, scope),
    ]);
    data.income = io;
    data.balances = balances;
    data.options = options;
    data.outFilter = filter ?? "";
  }
  if (tab === "debts") {
    data.debts = await listDebts(prisma, user, scope);
    data.options = await outFormOptions(prisma, user, scope);
  }
  if (tab === "partners") data.partners = await partnersProfit(prisma, user, scope);
  if (tab === "profit") data.profit = await profitAndExpenses(prisma, user, scope);
  if (tab === "commissions") data.commissions = await listCommissions(prisma, user, scope);
  if (tab === "receipts") {
    const kind = KINDS.includes(sp.kind as ReceiptKind) ? (sp.kind as ReceiptKind) : undefined;
    data.receipts = await listReceipts(prisma, user, scope, { kind, q: sp.q });
    data.receiptFilter = { kind: kind ?? "", q: sp.q ?? "" };
  }
  if (tab === "overview") [data.overview, data.opening] = await Promise.all([overview(prisma, user, scope), listOpening(prisma, user, scope)]);
  return <AccountingView data={data} />;
}
