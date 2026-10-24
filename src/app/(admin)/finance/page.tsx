import { prisma } from "@/db/client";
import { AuthorizationError } from "@/lib/errors";
import { can } from "@/modules/authz/core";
import { requireUser } from "@/modules/authz/session";
import {
  buildStatement,
  DEMURRAGE_DEFAULTS,
  listDemurrage,
  listDueInvoices,
  listExtraMeasure,
  listInvoiceRevisions,
} from "@/modules/finance/ledger";
import {
  getInvoiceDocument,
  listFinanceShipments,
  shipmentCustomers,
  shipmentInvoices,
  shipmentPayments,
} from "@/modules/finance/shipmentFinance";
import { getSettings } from "@/modules/settings/service";
import { getAdminScope } from "../scope";
import { FinanceView, type FinanceData, type FinanceTab } from "./FinanceView";

export const metadata = { title: "Finance" };

const TABS: FinanceTab[] = ["invoices", "payments", "statement", "history", "reminders"];
type SP = Record<string, string | undefined>;

/**
 * Finance (spec B9), scoped to the top bar's Year + Country. Everything shown
 * is loaded here on the server through the scoped finance services; the URL
 * carries only what to look at (tab, mode, shipment, filters).
 */
export default async function FinancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  if (!can(user, "invoices:read")) throw new AuthorizationError("Missing permission: invoices:read");
  const sp = await searchParams;
  const scope = await getAdminScope(user);
  const tab: FinanceTab = TABS.includes(sp.tab as FinanceTab) ? (sp.tab as FinanceTab) : "invoices";
  const mode = sp.mode === "SEA" ? "SEA" : "AIR";
  const canPay = can(user, "payments:read");

  const data: FinanceData = {
    scope: { year: scope.year, country: scope.country },
    tab,
    mode,
    q: sp.q ?? "",
    perms: {
      invoiceWrite: can(user, "invoices:write"),
      invoiceManage: can(user, "invoices:manage"),
      paymentRead: canPay,
      paymentWrite: can(user, "payments:write"),
      paymentManage: can(user, "payments:manage"),
    },
    banks: [],
    company: await getSettings(prisma).then(({ company: c }) => ({ name: c.name, address: c.address, phone: c.phone })),
  };

  if (tab === "invoices" || tab === "payments") {
    const shipments = await listFinanceShipments(prisma, user, scope, { mode, q: sp.q });
    const selected = shipments.find((s) => s.id === sp.ship) ?? shipments[0] ?? null;
    data.shipments = shipments;
    data.selected = selected;
    if (selected) {
      const [customers, invoices] = await Promise.all([shipmentCustomers(prisma, user, selected.id), shipmentInvoices(prisma, user, selected.id)]);
      data.customers = customers;
      data.invoices = invoices;
      if (tab === "payments" && canPay) data.payments = await shipmentPayments(prisma, user, selected.id);
      const previewId = sp.inv && invoices.some((i) => i.id === sp.inv) ? sp.inv : undefined;
      if (tab === "invoices" && previewId) data.preview = await getInvoiceDocument(prisma, user, previewId);
    }
    data.banks = (await prisma.bank.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } })).map((b) => ({
      id: b.id,
      name: b.name,
      isCash: b.isCash,
    }));
  }

  if (tab === "statement" && canPay) {
    const customers = await prisma.customer.findMany({
      where: { invoices: { some: { status: { not: "VOID" }, shipment: { originCountry: scope.country, businessYear: scope.year } } } },
      select: { id: true, ref: true, name: true },
      orderBy: { ref: "asc" },
      take: 2000,
    });
    const customerId = customers.some((c) => c.id === sp.cust) ? sp.cust : undefined;
    data.statementCustomers = customers;
    data.statementCustomer = customerId ?? "";
    data.statement = await buildStatement(prisma, user, scope, { customerId, q: sp.sq });
    data.sq = sp.sq ?? "";
  }

  if (tab === "history") {
    data.hsub = sp.hsub === "extra" ? "extra" : "changes";
    data.hq = sp.hq ?? "";
    const [revisions, extra] = await Promise.all([listInvoiceRevisions(prisma, user, scope, { q: sp.hq }), listExtraMeasure(prisma, user, scope)]);
    data.revisions = revisions;
    data.extra = extra;
  }

  if (tab === "reminders") {
    const free = /^\d{1,3}$/.test(sp.free ?? "") ? Number(sp.free) : DEMURRAGE_DEFAULTS.freeDays;
    const rate = /^\d{1,6}(\.\d{1,2})?$/.test(sp.rate ?? "") ? sp.rate! : DEMURRAGE_DEFAULTS.ratePerDay;
    data.demurrageCfg = { freeDays: free, ratePerDay: rate };
    const [due, demurrage] = await Promise.all([
      listDueInvoices(prisma, user, scope),
      listDemurrage(prisma, user, scope, { freeDays: free, ratePerDay: rate }),
    ]);
    data.due = due;
    data.demurrage = demurrage;
  }

  return <FinanceView data={data} />;
}
