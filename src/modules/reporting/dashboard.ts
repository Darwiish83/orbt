import type { Prisma, PrismaClient, ShipmentStatus } from "@prisma/client";
import { displayShipmentCode } from "@/modules/authz/adminScope";
import { can, requireScope, type AuthzUser } from "@/modules/authz/core";
import { lineMeasure } from "@/modules/finance/charges";
import { round2, sum } from "@/modules/finance/money";

/**
 * Dashboard (spec B3 / §4) for the top bar's country + year. Each block is
 * only computed when the viewer may see that area; everything comes from the
 * database (no sample numbers).
 */

const s = (v: Prisma.Decimal) => round2(v).toString();
const month = (d: Date) => d.getUTCMonth();

export async function getDashboard(db: PrismaClient, actor: AuthzUser, scope: { country: string; year: number }) {
  requireScope(actor, { country: scope.country, businessYear: scope.year });
  const shipWhere = { originCountry: scope.country, businessYear: scope.year };
  const seeShipments = can(actor, "shipments:read") || can(actor, "operations:read");
  const seeFinance = can(actor, "invoices:read");
  const seePayments = can(actor, "payments:read");
  const seeCustomers = can(actor, "customers:read");
  const seeUsers = can(actor, "users:read");

  const shipments = seeShipments
    ? await db.shipment.findMany({ where: shipWhere, include: { lines: true, invoices: { where: { status: { not: "VOID" } } } }, orderBy: { createdAt: "desc" }, take: 2000 })
    : [];
  const statuses: ShipmentStatus[] = ["AT_ORIGIN_STORE", "DEPARTED", "IN_TRANSIT", "ARRIVED"];
  const monthly = Array.from({ length: 12 }, (_, m) => ({ m, revenue: "0", air: 0, sea: 0 }));
  for (const sh of shipments) {
    const d = sh.shipDate ?? sh.createdAt;
    if (d.getUTCFullYear() === scope.year) {
      if (sh.mode === "AIR") monthly[month(d)]!.air++;
      else if (sh.mode === "SEA") monthly[month(d)]!.sea++;
    }
  }

  let finance = null;
  if (seeFinance) {
    const invoices = await db.invoice.findMany({
      where: { status: { not: "VOID" }, shipment: shipWhere },
      include: { customer: { select: { name: true } }, shipment: { select: { code: true } } },
      take: 5000,
    });
    for (let m = 0; m < 12; m++) {
      monthly[m]!.revenue = s(sum(invoices.filter((i) => month(i.issuedAt ?? i.createdAt) === m && (i.issuedAt ?? i.createdAt).getUTCFullYear() === scope.year).map((i) => i.total)));
    }
    const owing = invoices
      .map((i) => ({ i, bal: i.total.minus(i.amountAllocated) }))
      .filter((x) => x.bal.greaterThan(0))
      .sort((a, b) => b.bal.comparedTo(a.bal))
      .slice(0, 5)
      .map(({ i, bal }) => ({ id: i.id, number: i.number, customer: i.customer.name, shipment: displayShipmentCode(i.shipment!.code), balance: s(bal) }));
    finance = {
      invoiced: s(sum(invoices.map((i) => i.total))),
      paid: s(sum(invoices.map((i) => i.amountAllocated))),
      outstanding: s(sum(invoices.map((i) => i.total.minus(i.amountAllocated)))),
      count: invoices.length,
      owing,
    };
  }

  let payments = null;
  if (seePayments) {
    const allocs = await db.paymentAllocation.findMany({
      where: { invoice: { status: { not: "VOID" }, shipment: shipWhere }, payment: { reversedAt: null } },
      include: { payment: { include: { bank: true, customer: { select: { name: true } } } } },
      take: 5000,
    });
    const byBank = new Map<string, Prisma.Decimal[]>();
    for (const a of allocs) {
      const b = a.payment.bank?.name ?? "Other";
      byBank.set(b, [...(byBank.get(b) ?? []), a.amount]);
    }
    payments = {
      byBank: [...byBank.entries()].map(([bank, xs]) => ({ bank, amount: s(sum(xs)) })).sort((a, b) => Number(b.amount) - Number(a.amount)),
      recent: [...allocs]
        .sort((a, b) => b.payment.receivedAt.getTime() - a.payment.receivedAt.getTime())
        .slice(0, 5)
        .map((a) => ({ id: a.paymentId, customer: a.payment.customer.name, date: a.payment.receivedAt.toISOString(), bank: a.payment.bank?.name ?? null, amount: s(a.amount) })),
    };
  }

  const [customers, activeCustomers, employees, activeEmployees, documents, notifications] = await Promise.all([
    seeCustomers ? db.customer.count() : Promise.resolve(null),
    seeCustomers ? db.customer.count({ where: { status: "ACTIVE" } }) : Promise.resolve(null),
    seeUsers ? db.employee.count() : Promise.resolve(null),
    seeUsers ? db.employee.count({ where: { active: true, user: { status: "ACTIVE" } } }) : Promise.resolve(null),
    can(actor, "documents:read") ? db.document.count({ where: { shipment: shipWhere } }) : Promise.resolve(null),
    can(actor, "notifications:read") ? db.notification.findMany({ orderBy: { createdAt: "desc" }, take: 5 }) : Promise.resolve(null),
  ]);

  return {
    shipments: seeShipments
      ? {
          total: shipments.length,
          air: shipments.filter((x) => x.mode === "AIR").length,
          sea: shipments.filter((x) => x.mode === "SEA").length,
          kg: s(sum(shipments.filter((x) => x.mode === "AIR").flatMap((x) => x.lines.map((l) => lineMeasure("AIR", l))))),
          cbm: s(sum(shipments.filter((x) => x.mode === "SEA").flatMap((x) => x.lines.map((l) => lineMeasure("SEA", l))))),
          packages: shipments.reduce((n, x) => n + x.lines.reduce((m, l) => m + (l.packages ?? 0) + (l.mixCount ?? 0), 0), 0),
          statusCounts: statuses.map((st) => ({ status: st, count: shipments.filter((x) => x.status === st).length })),
          recent: shipments.slice(0, 6).map((x) => ({
            id: x.id,
            code: displayShipmentCode(x.code),
            mode: x.mode,
            originCountry: x.originCountry,
            originCity: x.originCity,
            destCity: x.destCity,
            arrivalDate: x.arrivalDate?.toISOString() ?? null,
            packages: x.lines.reduce((n, l) => n + (l.packages ?? 0) + (l.mixCount ?? 0), 0),
            status: x.status,
            amount: s(sum(x.invoices.map((i) => i.total))),
          })),
        }
      : null,
    finance,
    payments,
    monthly,
    people: { customers, activeCustomers, employees, activeEmployees, documents },
    notifications: notifications?.map((n) => ({ id: n.id, title: n.title, status: n.status, at: n.createdAt.toISOString() })) ?? null,
  };
}
