import type { Prisma, PrismaClient, ShipmentStatus } from "@prisma/client";
import { AuthorizationError } from "@/lib/errors";
import { allowedCountries, requirePermission, type AuthzUser } from "@/modules/authz/core";
import { dec, round2 } from "@/modules/finance/money";
import { packagesOf as shipmentPackages } from "@/modules/shipments/mix";

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

  // Same country scope as the shipments: a country-scoped user must not see
  // other countries' money. Voided invoices are not revenue.
  const invWhere: Prisma.InvoiceWhereInput = { status: { not: "VOID" } };
  if (opts.businessYear) invWhere.businessYear = opts.businessYear;
  if (countries !== null) invWhere.shipment = { originCountry: { in: countries } };
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

export type ReportSection = "company" | "shipments" | "finance" | "customers" | "operations";

/**
 * Reports (spec B13 / §14): one report per section plus a company-wide one.
 * Company-wide covers every country the user may see; the others use the
 * top bar's country. Always one business year.
 */
export async function getAdminReport(
  db: PrismaClient,
  actor: AuthzUser,
  opts: { year: number; country: string; section: ReportSection },
) {
  requirePermission(actor, "reports:read");
  const allowed = allowedCountries(actor);
  const countries = opts.section === "company" ? allowed : [opts.country];
  if (allowed !== null && countries && countries.some((c) => !allowed.includes(c))) {
    throw new AuthorizationError("Outside your assigned country/year scope");
  }
  const shipWhere: Prisma.ShipmentWhereInput = { businessYear: opts.year, ...(countries ? { originCountry: { in: countries } } : {}) };
  const [shipments, invoices, customers, activeCustomers] = await Promise.all([
    db.shipment.findMany({ where: shipWhere, include: { lines: true } }),
    db.invoice.findMany({ where: { status: { not: "VOID" }, shipment: shipWhere }, select: { total: true, amountAllocated: true, createdAt: true, issuedAt: true, shipment: { select: { originCountry: true } } } }),
    db.customer.count(),
    db.customer.count({ where: { status: "ACTIVE" } }),
  ]);
  const measure = (mode: "AIR" | "SEA") =>
    round2(
      shipments
        .filter((s) => s.mode === mode)
        .flatMap((s) => s.lines)
        .reduce((a, l) => a.add(mode === "AIR" ? dec(l.chargeableWeightKg ?? 0).add(dec(l.mixKg ?? 0)) : dec(l.volumeCbm ?? 0)), dec(0)),
    ).toString();
  const revenue = round2(invoices.reduce((a, i) => a.add(i.total), dec(0)));
  const collected = round2(invoices.reduce((a, i) => a.add(i.amountAllocated), dec(0)));
  const monthly = MONTHS.map((m) => ({ month: m, air: 0, sea: 0, revenue: "0" }));
  for (const s of shipments) {
    const d = s.shipDate ?? s.createdAt;
    if (d.getUTCFullYear() !== opts.year) continue;
    if (s.mode === "AIR") monthly[d.getUTCMonth()]!.air++;
    else if (s.mode === "SEA") monthly[d.getUTCMonth()]!.sea++;
  }
  for (let m = 0; m < 12; m++) {
    monthly[m]!.revenue = round2(
      invoices.filter((i) => (i.issuedAt ?? i.createdAt).getUTCMonth() === m && (i.issuedAt ?? i.createdAt).getUTCFullYear() === opts.year).reduce((a, i) => a.add(i.total), dec(0)),
    ).toString();
  }
  const statuses: ShipmentStatus[] = ["AT_ORIGIN_STORE", "DEPARTED", "IN_TRANSIT", "ARRIVED"];
  const packagesOf = (mode: "AIR" | "SEA") => shipments.filter((s) => s.mode === mode).reduce((n, s) => n + shipmentPackages(s.lines), 0);
  // One line per country (the company report covers several).
  const byCountry = [...new Set(shipments.map((s) => s.originCountry))].sort().map((c) => {
    const inv = invoices.filter((i) => i.shipment?.originCountry === c);
    const rev = round2(inv.reduce((a, i) => a.add(i.total), dec(0)));
    const col = round2(inv.reduce((a, i) => a.add(i.amountAllocated), dec(0)));
    const sh = shipments.filter((s) => s.originCountry === c);
    return { country: c, shipments: sh.length, air: sh.filter((s) => s.mode === "AIR").length, sea: sh.filter((s) => s.mode === "SEA").length, revenue: rev.toString(), collected: col.toString(), outstanding: round2(rev.minus(col)).toString() };
  });
  return {
    section: opts.section,
    year: opts.year,
    countries: countries ?? "all",
    totals: {
      shipments: shipments.length,
      air: shipments.filter((s) => s.mode === "AIR").length,
      sea: shipments.filter((s) => s.mode === "SEA").length,
      kg: measure("AIR"),
      cbm: measure("SEA"),
      packages: shipments.reduce((n, s) => n + shipmentPackages(s.lines), 0),
      packagesAir: packagesOf("AIR"),
      packagesSea: packagesOf("SEA"),
      revenue: revenue.toString(),
      collected: collected.toString(),
      outstanding: round2(revenue.minus(collected)).toString(),
      invoices: invoices.length,
      customers,
      activeCustomers,
    },
    status: statuses.map((st) => ({ status: st, count: shipments.filter((s) => s.status === st).length })),
    monthly,
    byCountry,
    generatedAt: new Date().toISOString(),
  };
}
