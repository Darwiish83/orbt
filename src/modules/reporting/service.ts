import type { Prisma, PrismaClient, ShipmentStatus } from "@prisma/client";
import { allowedCountries, requirePermission, type AuthzUser } from "@/modules/authz/core";
import { dec, round2 } from "@/modules/finance/money";

export interface Report {
  businessYear: number | null;
  shipments: { total: number; byMode: Record<string, number>; byStatus: Partial<Record<ShipmentStatus, number>> };
  finance: { invoiced: string; collected: string; outstanding: string; invoiceCount: number };
  customers: number;
  monthly: { month: string; air: number; sea: number }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function getReport(
  db: PrismaClient,
  actor: AuthzUser,
  opts: { businessYear?: number } = {},
): Promise<Report> {
  requirePermission(actor, "reports:read");

  const countries = allowedCountries(actor);
  const shipWhere: Prisma.ShipmentWhereInput = {};
  if (opts.businessYear) shipWhere.businessYear = opts.businessYear;
  if (countries !== null) shipWhere.originCountry = { in: countries };

  const [byMode, byStatus, shipTotal, monthlyRows] = await Promise.all([
    db.shipment.groupBy({ by: ["mode"], where: shipWhere, _count: { _all: true } }),
    db.shipment.groupBy({ by: ["status"], where: shipWhere, _count: { _all: true } }),
    db.shipment.count({ where: shipWhere }),
    db.shipment.findMany({ where: shipWhere, select: { createdAt: true, mode: true } }),
  ]);

  const invWhere: Prisma.InvoiceWhereInput = {};
  if (opts.businessYear) invWhere.businessYear = opts.businessYear;
  const finance = await db.invoice.aggregate({
    where: invWhere,
    _sum: { total: true, amountAllocated: true },
    _count: { _all: true },
  });
  const invoiced = round2(dec(finance._sum.total ?? 0));
  const collected = round2(dec(finance._sum.amountAllocated ?? 0));

  const custWhere: Prisma.CustomerWhereInput = {};
  if (countries !== null) custWhere.OR = [{ country: { in: countries } }, { country: null }];
  const customers = await db.customer.count({ where: custWhere });

  const monthly = MONTHS.map((m) => ({ month: m, air: 0, sea: 0 }));
  for (const s of monthlyRows) {
    const idx = s.createdAt.getMonth();
    if (s.mode === "AIR") monthly[idx]!.air += 1;
    else if (s.mode === "SEA") monthly[idx]!.sea += 1;
  }

  return {
    businessYear: opts.businessYear ?? null,
    shipments: {
      total: shipTotal,
      byMode: Object.fromEntries(byMode.map((r) => [r.mode, r._count._all])),
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Partial<
        Record<ShipmentStatus, number>
      >,
    },
    finance: {
      invoiced: invoiced.toString(),
      collected: collected.toString(),
      outstanding: round2(invoiced.minus(collected)).toString(),
      invoiceCount: finance._count._all,
    },
    customers,
    monthly,
  };
}
