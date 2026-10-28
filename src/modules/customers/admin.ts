import type { Customer, Prisma, PrismaClient } from "@prisma/client";
import { ValidationError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import { displayShipmentCode } from "@/modules/authz/adminScope";
import { requirePermission, type AuthzUser } from "@/modules/authz/core";
import { round2, sum } from "@/modules/finance/money";
import { levelFromVolume, type CustomerLevel } from "./level";
import { customerScopeWhere } from "./service";

/**
 * Admin → Customers (spec B5 / revised prompt §6). Customers are shared by
 * all countries; the level is computed from the business year's KG/CBM
 * (ADR-018) and is never chosen by hand.
 */

const s = (v: Prisma.Decimal | null | undefined) => (v == null ? "0" : v.toString());

const scopeWhere = customerScopeWhere;

export interface AdminCustomerRow {
  id: string;
  ref: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  cargoCategory: string | null;
  status: Customer["status"];
  createdAt: string;
  level: CustomerLevel;
  airKg: string;
  seaCbm: string;
  service: "Air" | "Sea" | "Air & Sea" | "—";
  hasAccount: boolean;
}

async function volumes(db: PrismaClient, customerIds: string[], year: number) {
  const lines = await db.shipmentLine.findMany({
    where: { customerId: { in: customerIds }, shipment: { businessYear: year } },
    select: { customerId: true, chargeableWeightKg: true, mixKg: true, volumeCbm: true, shipment: { select: { mode: true } } },
  });
  const map = new Map<string, { air: Prisma.Decimal[]; sea: Prisma.Decimal[] }>();
  for (const l of lines) {
    const v = map.get(l.customerId) ?? { air: [], sea: [] };
    if (l.shipment.mode === "AIR") v.air.push(...[l.chargeableWeightKg, l.mixKg].filter((x): x is Prisma.Decimal => !!x));
    else if (l.shipment.mode === "SEA" && l.volumeCbm) v.sea.push(l.volumeCbm);
    map.set(l.customerId, v);
  }
  return map;
}

export async function listAdminCustomers(
  db: PrismaClient,
  actor: AuthzUser,
  year: number,
  filters: { status?: "ACTIVE" | "INACTIVE"; q?: string; page?: number } = {},
) {
  requirePermission(actor, "customers:read");
  const q = filters.q?.trim();
  const base: Prisma.CustomerWhereInput = { AND: [scopeWhere(actor)] };
  const where: Prisma.CustomerWhereInput = {
    AND: [
      scopeWhere(actor),
      ...(filters.status === "ACTIVE" ? [{ status: "ACTIVE" as const }] : filters.status === "INACTIVE" ? [{ status: { not: "ACTIVE" as const } }] : []),
      ...(q
        ? [
            {
              OR: [
                { ref: { contains: q, mode: "insensitive" as const } },
                { name: { contains: q, mode: "insensitive" as const } },
                { company: { contains: q, mode: "insensitive" as const } },
                { phone: { contains: q } },
                { email: { contains: q, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
    ],
  };
  const pageSize = 50;
  const page = Math.max(1, filters.page ?? 1);
  const [items, total, all, active] = await Promise.all([
    db.customer.findMany({ where, orderBy: { ref: "asc" }, skip: (page - 1) * pageSize, take: pageSize, include: { user: { select: { id: true } } } }),
    db.customer.count({ where }),
    db.customer.count({ where: base }),
    db.customer.count({ where: { AND: [scopeWhere(actor), { status: "ACTIVE" }] } }),
  ]);
  const vol = await volumes(db, items.map((c) => c.id), year);
  const rows: AdminCustomerRow[] = items.map((c) => {
    const v = vol.get(c.id);
    const airKg = round2(sum(v?.air ?? []));
    const seaCbm = round2(sum(v?.sea ?? []));
    const air = (v?.air.length ?? 0) > 0;
    const sea = (v?.sea.length ?? 0) > 0;
    return {
      id: c.id,
      ref: c.ref,
      name: c.name,
      company: c.company,
      phone: c.phone,
      email: c.email,
      location: c.location,
      cargoCategory: c.cargoCategory,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      level: levelFromVolume(airKg, seaCbm),
      airKg: airKg.toString(),
      seaCbm: seaCbm.toString(),
      service: air && sea ? "Air & Sea" : air ? "Air" : sea ? "Sea" : "—",
      hasAccount: !!c.user,
    };
  });
  // A PRO / B VIP across all customers of the year (one grouped read).
  const yearLines = await db.shipmentLine.findMany({
    where: { shipment: { businessYear: year }, customer: base },
    select: { customerId: true, chargeableWeightKg: true, mixKg: true, volumeCbm: true, shipment: { select: { mode: true } } },
  });
  const per = new Map<string, { air: Prisma.Decimal[]; sea: Prisma.Decimal[] }>();
  for (const l of yearLines) {
    const v = per.get(l.customerId) ?? { air: [], sea: [] };
    if (l.shipment.mode === "AIR") v.air.push(...[l.chargeableWeightKg, l.mixKg].filter((x): x is Prisma.Decimal => !!x));
    else if (l.volumeCbm) v.sea.push(l.volumeCbm);
    per.set(l.customerId, v);
  }
  const top = [...per.values()].filter((v) => ["A", "B"].includes(levelFromVolume(sum(v.air), sum(v.sea)))).length;
  return { rows, total, page, pageSize, stats: { total: all, active, inactive: all - active, top } };
}

/** Customer details: everything about the customer (spec §6). */
export async function getCustomerDetails(db: PrismaClient, actor: AuthzUser, customerId: string, year: number) {
  requirePermission(actor, "customers:read");
  const c = await db.customer.findFirst({ where: { id: customerId, ...scopeWhere(actor) } });
  if (!c) throw new ValidationError("Customer not found");
  const canInvoices = actor.isSuperAdmin || actor.permissions.has("invoices:read") || actor.permissions.has("invoices:write") || actor.permissions.has("invoices:manage");
  const canPayments = actor.isSuperAdmin || actor.permissions.has("payments:read") || actor.permissions.has("payments:write") || actor.permissions.has("payments:manage");
  const [lines, invoices, payments] = await Promise.all([
    db.shipmentLine.findMany({ where: { customerId }, include: { shipment: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    canInvoices ? db.invoice.findMany({ where: { customerId, status: { not: "VOID" } }, include: { shipment: true }, orderBy: { createdAt: "desc" }, take: 200 }) : [],
    canPayments
      ? db.payment.findMany({ where: { customerId, reversedAt: null }, include: { bank: true, receipt: true }, orderBy: { receivedAt: "desc" }, take: 200 })
      : [],
  ]);
  const shipments = new Map<string, { id: string; code: string; mode: string; year: number; status: string; country: string }>();
  for (const l of lines) {
    shipments.set(l.shipmentId, {
      id: l.shipmentId,
      code: displayShipmentCode(l.shipment.code),
      mode: l.shipment.mode,
      year: l.shipment.businessYear,
      status: l.shipment.status,
      country: l.shipment.originCountry,
    });
  }
  const yearLines = lines.filter((l) => l.shipment.businessYear === year);
  const airKg = sum(yearLines.filter((l) => l.shipment.mode === "AIR").flatMap((l) => [l.chargeableWeightKg, l.mixKg].filter((x): x is Prisma.Decimal => !!x)));
  const seaCbm = sum(yearLines.filter((l) => l.shipment.mode === "SEA" && l.volumeCbm).map((l) => l.volumeCbm!));
  return {
    customer: {
      id: c.id,
      ref: c.ref,
      name: c.name,
      company: c.company,
      phone: c.phone,
      email: c.email,
      location: c.location,
      cargoCategory: c.cargoCategory,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    },
    level: levelFromVolume(airKg, seaCbm),
    airKg: round2(airKg).toString(),
    seaCbm: round2(seaCbm).toString(),
    shipments: [...shipments.values()],
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      shipmentCode: i.shipment ? displayShipmentCode(i.shipment.code) : "-",
      total: s(i.total),
      paid: s(i.amountAllocated),
      balance: round2(i.total.minus(i.amountAllocated)).toString(),
      status: i.status,
      date: (i.issuedAt ?? i.createdAt).toISOString(),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      receiptNo: p.receipt?.number ?? null,
      amount: s(p.amount),
      bank: p.bank?.name ?? null,
      date: p.receivedAt.toISOString(),
    })),
    totals: {
      invoiced: round2(sum(invoices.map((i) => i.total))).toString(),
      balance: round2(sum(invoices.map((i) => i.total.minus(i.amountAllocated)))).toString(),
    },
  };
}

/** Active / Inactive (Customers tabs). Inactive customers stay on file. */
export async function setCustomerStatus(db: PrismaClient, actor: AuthzUser, customerId: string, status: "ACTIVE" | "INACTIVE") {
  requirePermission(actor, "customers:write");
  const c = await db.customer.findFirst({ where: { id: customerId, ...scopeWhere(actor) } });
  if (!c) throw new ValidationError("Customer not found");
  await db.customer.update({ where: { id: customerId }, data: { status } });
  await logAudit(db, { actorUserId: actor.id, action: "customer.status", entityType: "Customer", entityId: customerId, metadata: { status } });
}

/**
 * Delete Customer — only a customer with no history (no shipments, invoices,
 * payments, documents or portal account). Anyone with history is set to
 * Inactive instead, so references and money records are never lost.
 */
export async function deleteCustomer(db: PrismaClient, actor: AuthzUser, customerId: string) {
  requirePermission(actor, "customers:manage");
  const c = await db.customer.findFirst({ where: { id: customerId, ...scopeWhere(actor) }, include: { user: true } });
  if (!c) throw new ValidationError("Customer not found");
  const [lines, invoices, payments, docs, receipts] = await Promise.all([
    db.shipmentLine.count({ where: { customerId } }),
    db.invoice.count({ where: { customerId } }),
    db.payment.count({ where: { customerId } }),
    db.document.count({ where: { customerId } }),
    db.receipt.count({ where: { customerId } }),
  ]);
  if (lines + invoices + payments + docs + receipts > 0 || c.user) {
    throw new ValidationError("This customer has history and cannot be deleted. Set them to Inactive instead.");
  }
  await db.$transaction(async (tx) => {
    await tx.notification.deleteMany({ where: { customerId } });
    await tx.customer.delete({ where: { id: customerId } });
    await logAudit(tx, { actorUserId: actor.id, action: "customer.delete", entityType: "Customer", entityId: customerId, metadata: { ref: c.ref, name: c.name } });
  });
}
