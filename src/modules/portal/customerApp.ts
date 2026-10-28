import type { Prisma, PrismaClient, ShipmentStatus } from "@prisma/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import type { AuthzUser } from "@/modules/authz/core";
import { customerVolume, LEVEL_NAME } from "@/modules/customers/level";
import { dec, round2, sum } from "@/modules/finance/money";
import { invoiceDocumentOf, paymentReceiptDocOf, type InvoiceDocument } from "@/modules/finance/shipmentFinance";

/**
 * Customer App (Phase 13, spec A2–A10). Every read here is the signed-in
 * customer's own data: the customer id comes from the session, never from the
 * request, so one customer can never see another's shipments, invoices,
 * payments or documents.
 */

const s2 = (v: Prisma.Decimal) => round2(v).toString();
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

function customerOf(actor: AuthzUser): string {
  if (!actor.customerId) throw new AuthorizationError("Customers only");
  return actor.customerId;
}

/** Years the customer has shipments or invoices in (newest first; at least this year). */
export async function myYears(db: PrismaClient, actor: AuthzUser): Promise<number[]> {
  const id = customerOf(actor);
  const [lines, invs] = await Promise.all([
    db.shipmentLine.findMany({ where: { customerId: id, rate: { not: null } }, select: { shipment: { select: { businessYear: true } } } }),
    db.invoice.findMany({ where: { customerId: id, status: { not: "VOID" } }, select: { businessYear: true } }),
  ]);
  const ys = new Set<number>([new Date().getUTCFullYear(), ...lines.map((l) => l.shipment.businessYear), ...invs.map((i) => i.businessYear).filter((y): y is number => !!y)]);
  return [...ys].sort((a, b) => b - a);
}

/** Profile card: who the customer is, their level for the year and status. */
export async function myProfile(db: PrismaClient, actor: AuthzUser, year = new Date().getUTCFullYear()) {
  const id = customerOf(actor);
  const c = await db.customer.findUniqueOrThrow({ where: { id } });
  const v = await customerVolume(db, id, year);
  return {
    ref: c.ref,
    name: c.name,
    company: c.company,
    phone: c.phone,
    email: c.email,
    location: c.location,
    cargoCategory: c.cargoCategory,
    status: c.status,
    level: v.level,
    levelName: LEVEL_NAME[v.level],
    memberSince: c.createdAt.toISOString(),
  };
}

export interface MyShipment {
  id: string;
  code: string;
  mode: "AIR" | "SEA";
  status: ShipmentStatus;
  year: number;
  originCountry: string;
  originCity: string | null;
  destCountry: string | null;
  destCity: string | null;
  destCode: string | null;
  shipDate: string | null;
  departedAt: string | null;
  arrivedAt: string | null;
  arrivalDate: string | null;
  /**
   * KG (air, incl. MIX KG) or CBM (sea) of this customer's goods only. Once
   * invoiced, the invoice's billed measure — the customer sees the same KG on
   * the shipment as on the invoice (owner 2026-10-27).
   */
  measure: string;
  packages: number;
  mixCount: number;
}

/** The customer's shipments: one row per shipment, totals of their own lines only. */
export async function myShipments(db: PrismaClient, actor: AuthzUser, year?: number): Promise<MyShipment[]> {
  const id = customerOf(actor);
  const lines = await db.shipmentLine.findMany({
    // A cargo line reaches the customer once its Rate is set (ADR-036; RLS repeats it).
    where: { customerId: id, rate: { not: null }, ...(year ? { shipment: { businessYear: year } } : {}) },
    include: { shipment: true },
  });
  const by = new Map<string, typeof lines>();
  for (const l of lines) by.set(l.shipmentId, [...(by.get(l.shipmentId) ?? []), l]);
  const billed = new Map(
    (
      await db.invoice.findMany({
        where: { customerId: id, shipmentId: { in: [...by.keys()] }, status: { not: "VOID" }, billedMeasure: { not: null } },
        select: { shipmentId: true, billedMeasure: true },
      })
    ).map((i) => [i.shipmentId, i.billedMeasure!]),
  );
  return [...by.values()]
    .map((ls) => {
      const sh = ls[0]!.shipment;
      const air = sh.mode === "AIR";
      const measure = billed.get(sh.id) ?? sum(ls.map((l) => (air ? dec(l.chargeableWeightKg ?? 0).add(dec(l.mixKg ?? 0)) : dec(l.volumeCbm ?? 0))));
      return {
        id: sh.id,
        // Customers see only the random SH- code, never W-n / C-n (ADR-034).
        code: sh.publicCode,
        mode: (air ? "AIR" : "SEA") as "AIR" | "SEA",
        status: sh.status,
        year: sh.businessYear,
        originCountry: sh.originCountry,
        originCity: sh.originCity,
        destCountry: sh.destCountry,
        destCity: sh.destCity,
        destCode: sh.destCode,
        shipDate: day(sh.shipDate),
        departedAt: day(sh.departedAt),
        arrivedAt: day(sh.arrivedAt),
        arrivalDate: day(sh.arrivalDate),
        measure: round2(measure).toString(),
        packages: ls.reduce((n, l) => n + (l.packages ?? 0), 0),
        mixCount: ls.reduce((n, l) => n + (l.mixCount ?? 0), 0),
      };
    })
    .sort((a, b) => ((b.shipDate ?? "") > (a.shipDate ?? "") ? 1 : -1));
}

/** One shipment of the customer's, with their invoice for it (if any). */
export async function myShipment(db: PrismaClient, actor: AuthzUser, shipmentId: string) {
  const id = customerOf(actor);
  const sh = (await myShipments(db, actor)).find((s) => s.id === shipmentId);
  if (!sh) throw new ValidationError("Shipment not found");
  const inv = await db.invoice.findFirst({ where: { customerId: id, shipmentId, status: { not: "VOID" } } });
  const [payments, docs] = await Promise.all([
    inv
      ? db.paymentAllocation.findMany({ where: { invoiceId: inv.id, payment: { reversedAt: null } }, include: { payment: { include: { bank: true, receipt: true } } }, orderBy: { payment: { receivedAt: "asc" } } })
      : Promise.resolve([]),
    db.document.findMany({ where: { customerId: id, shipmentId, deletedAt: null }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    shipment: sh,
    invoice: inv
      ? { id: inv.id, number: inv.number, status: inv.status, total: s2(inv.total), paid: s2(inv.amountAllocated), balance: s2(inv.total.minus(inv.amountAllocated)) }
      : null,
    payments: payments.map((a) => ({ id: a.payment.id, date: a.payment.receivedAt.toISOString(), bank: a.payment.bank?.name ?? null, receiptNo: a.payment.receipt?.number ?? null, amount: s2(a.amount) })),
    documents: docs.map((d) => ({ id: d.id, filename: d.filename ?? "document", size: d.size, date: d.createdAt.toISOString() })),
  };
}

/** Finance: the year's invoices, payments and totals. */
export async function myFinance(db: PrismaClient, actor: AuthzUser, year: number) {
  const id = customerOf(actor);
  const [invoices, payments] = await Promise.all([
    db.invoice.findMany({ where: { customerId: id, status: { not: "VOID" }, OR: [{ businessYear: year }, { businessYear: null, shipment: { businessYear: year } }] }, include: { shipment: true }, orderBy: { createdAt: "desc" } }),
    db.payment.findMany({ where: { customerId: id, reversedAt: null }, include: { bank: true, receipt: true, allocations: { include: { invoice: true } } }, orderBy: { receivedAt: "desc" } }),
  ]);
  const invIds = new Set(invoices.map((i) => i.id));
  const yearPays = payments.filter((p) => p.allocations.some((a) => invIds.has(a.invoiceId)));
  const total = sum(invoices.map((i) => i.total));
  const paid = sum(invoices.map((i) => i.amountAllocated));
  return {
    totals: { invoices: invoices.length, invoiced: s2(total), paid: s2(paid), balance: s2(total.minus(paid)) },
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      status: i.status,
      date: (i.issuedAt ?? i.createdAt).toISOString(),
      shipmentId: i.shipmentId,
      shipment: i.shipment?.publicCode ?? null,
      mode: i.shipment?.mode === "SEA" ? "SEA" : "AIR",
      total: s2(i.total),
      paid: s2(i.amountAllocated),
      balance: s2(i.total.minus(i.amountAllocated)),
    })),
    payments: yearPays.map((p) => {
      const inv = p.allocations[0]?.invoice;
      return {
        id: p.id,
        date: p.receivedAt.toISOString(),
        amount: s2(p.amount),
        bank: p.bank?.name ?? null,
        receiptNo: p.receipt?.number ?? null,
        invoiceNo: inv?.number ?? null,
        balance: inv ? s2(inv.total.minus(inv.amountAllocated)) : "0",
      };
    }),
  };
}

/** The customer's own invoice paper. */
export async function myInvoiceDocument(db: PrismaClient, actor: AuthzUser, invoiceId: string): Promise<InvoiceDocument> {
  const id = customerOf(actor);
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, include: { shipment: true, lines: true } });
  if (!inv || inv.customerId !== id || inv.status === "VOID" || !inv.shipment) throw new ValidationError("Invoice not found");
  return invoiceDocumentOf(db, inv as typeof inv & { shipment: NonNullable<typeof inv.shipment> });
}

/** The customer's own payment receipt (paper data). */
export async function myPaymentReceipt(db: PrismaClient, actor: AuthzUser, paymentId: string) {
  const id = customerOf(actor);
  const r = await paymentReceiptDocOf(db, paymentId);
  if (!r || r.payment.customerId !== id) throw new ValidationError("Receipt not found");
  return r.doc;
}

/** Records: each shipment with its invoice, for a period. */
export async function myRecords(db: PrismaClient, actor: AuthzUser, year: number) {
  const id = customerOf(actor);
  const [ships, invs] = await Promise.all([
    myShipments(db, actor, year),
    db.invoice.findMany({ where: { customerId: id, status: { not: "VOID" } }, select: { id: true, number: true, status: true, shipmentId: true, total: true, amountAllocated: true } }),
  ]);
  return ships.map((s) => {
    const i = invs.find((x) => x.shipmentId === s.id);
    return { ...s, invoice: i ? { id: i.id, number: i.number, status: i.status, total: s2(i.total), paid: s2(i.amountAllocated), balance: s2(i.total.minus(i.amountAllocated)) } : null };
  });
}

export interface MyProfileInput {
  name: string;
  company: string;
  location: string;
  cargoCategory: string;
}

/** The customer edits their own profile. Phone and email (sign-in details) change through Orbit support. */
export async function updateMyProfile(db: PrismaClient, actor: AuthzUser, input: MyProfileInput) {
  const id = customerOf(actor);
  const clean = {
    name: input.name.trim().slice(0, 120),
    company: input.company.trim().slice(0, 120),
    location: input.location.trim().slice(0, 160),
    cargoCategory: input.cargoCategory.trim().slice(0, 120),
  };
  if (!clean.name || !clean.company) throw new ValidationError("Please fill in all required fields");
  await db.customer.update({ where: { id }, data: { name: clean.name, company: clean.company, location: clean.location || null, cargoCategory: clean.cargoCategory || null } });
  await logAudit(db, { actorUserId: actor.id, action: "customer.self_update", entityType: "Customer", entityId: id });
}
