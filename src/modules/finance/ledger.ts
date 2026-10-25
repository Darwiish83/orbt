import type { Prisma, PrismaClient } from "@prisma/client";
import { assertYearOpen } from "@/modules/accounting/periods";
import { ValidationError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import { displayShipmentCode } from "@/modules/authz/adminScope";
import { requirePermission, requireScope, type AuthzUser } from "@/modules/authz/core";
import { recomputeInvoice } from "./invoices";
import { dec, round2, sum } from "./money";

/**
 * Finance → Statement, Invoice History and Reminders (spec B9), for one
 * country + business year. Read models are bounded by that scope; every
 * figure is derived from stored invoices, allocations and lines.
 */

type Scope = { country: string; year: number };
const s = (v: Prisma.Decimal | null | undefined) => (v == null ? "0" : v.toString());
const MAX_ROWS = 5000;

function scoped(actor: AuthzUser, scope: Scope, permission: Parameters<typeof requirePermission>[1]) {
  requirePermission(actor, permission);
  requireScope(actor, { country: scope.country, businessYear: scope.year });
}

const shipmentWhere = (scope: Scope): Prisma.ShipmentWhereInput => ({
  originCountry: scope.country,
  businessYear: scope.year,
});

// ------------------------------------------------------------------ statement

export interface StatementRow {
  date: string;
  kind: "INVOICE" | "PAYMENT";
  customerRef: string;
  customerName: string;
  shipmentCode: string;
  docNo: string;
  mode: "AIR" | "SEA";
  bank: string | null;
  receiptNo: string | null;
  debit: string;
  credit: string;
  balance: string;
}

export interface Statement {
  rows: StatementRow[];
  totalInvoiced: string;
  totalPaid: string;
  balanceDue: string;
  truncated: boolean;
}

/** Every money movement: invoice = Debit, payment = Credit, running Balance. */
export async function buildStatement(
  db: PrismaClient,
  actor: AuthzUser,
  scope: Scope,
  filters: { customerId?: string; q?: string } = {},
): Promise<Statement> {
  scoped(actor, scope, "invoices:read");
  requirePermission(actor, "payments:read");
  const invoiceWhere: Prisma.InvoiceWhereInput = {
    status: { not: "VOID" },
    shipment: shipmentWhere(scope),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
  };
  const [invoices, allocations] = await Promise.all([
    db.invoice.findMany({ where: invoiceWhere, include: { customer: true, shipment: true }, take: MAX_ROWS }),
    db.paymentAllocation.findMany({
      where: { invoice: invoiceWhere, payment: { reversedAt: null } },
      include: { invoice: { include: { customer: true, shipment: true } }, payment: { include: { bank: true, receipt: true } } },
      take: MAX_ROWS,
    }),
  ]);

  const rows: Omit<StatementRow, "balance">[] = [
    ...invoices.map((i) => ({
      date: (i.issuedAt ?? i.createdAt).toISOString(),
      kind: "INVOICE" as const,
      customerRef: i.customer.ref,
      customerName: i.customer.name,
      shipmentCode: displayShipmentCode(i.shipment!.code),
      docNo: i.number,
      mode: i.shipment!.mode as "AIR" | "SEA",
      bank: null,
      receiptNo: null,
      debit: s(i.total),
      credit: "0",
    })),
    ...allocations.map((a) => ({
      date: a.payment.receivedAt.toISOString(),
      kind: "PAYMENT" as const,
      customerRef: a.invoice.customer.ref,
      customerName: a.invoice.customer.name,
      shipmentCode: displayShipmentCode(a.invoice.shipment!.code),
      docNo: a.invoice.number,
      mode: a.invoice.shipment!.mode as "AIR" | "SEA",
      bank: a.payment.bank?.name ?? null,
      receiptNo: a.payment.receipt?.number ?? null,
      debit: "0",
      credit: s(a.amount),
    })),
  ];

  const q = filters.q?.trim().toLowerCase();
  const kept = rows
    .filter((r) => !q || [r.docNo, r.customerRef, r.customerName, r.bank ?? "", r.receiptNo ?? "", r.shipmentCode].join(" ").toLowerCase().includes(q))
    // Same day: the invoice comes before the payment against it.
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === b.kind ? 0 : a.kind === "INVOICE" ? -1 : 1));

  let running = dec(0);
  const out = kept.map((r) => {
    running = running.add(dec(r.debit)).minus(dec(r.credit));
    return { ...r, balance: round2(running).toString() };
  });
  const totalInvoiced = round2(sum(kept.map((r) => dec(r.debit))));
  const totalPaid = round2(sum(kept.map((r) => dec(r.credit))));
  return {
    rows: out,
    totalInvoiced: totalInvoiced.toString(),
    totalPaid: totalPaid.toString(),
    balanceDue: round2(totalInvoiced.minus(totalPaid)).toString(),
    truncated: invoices.length === MAX_ROWS || allocations.length === MAX_ROWS,
  };
}

// ------------------------------------------------------------------ invoice history

export interface RevisionRow {
  id: string;
  createdAt: string;
  invoiceId: string;
  invoiceNo: string;
  customerRef: string;
  customerName: string;
  shipmentCode: string;
  mode: "AIR" | "SEA";
  field: string;
  before: string;
  after: string;
  changedBy: string;
}

export async function listInvoiceRevisions(
  db: PrismaClient,
  actor: AuthzUser,
  scope: Scope,
  filters: { invoiceId?: string; q?: string } = {},
): Promise<RevisionRow[]> {
  scoped(actor, scope, "invoices:read");
  const q = filters.q?.trim();
  const revisions = await db.invoiceRevision.findMany({
    where: {
      invoice: {
        shipment: shipmentWhere(scope),
        ...(filters.invoiceId ? { id: filters.invoiceId } : {}),
        ...(q
          ? {
              OR: [
                { number: { contains: q, mode: "insensitive" } },
                { customer: { ref: { contains: q, mode: "insensitive" } } },
                { customer: { name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
    },
    include: { invoice: { include: { customer: true, shipment: true } } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  const actorIds = [...new Set(revisions.map((r) => r.actorUserId).filter((x): x is string => !!x))];
  const users = await db.user.findMany({ where: { id: { in: actorIds } }, include: { employee: true } });
  const who = (id: string | null) => {
    const u = users.find((x) => x.id === id);
    return u?.employee?.name ?? u?.email ?? "-";
  };
  return revisions.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    invoiceId: r.invoiceId,
    invoiceNo: r.invoice.number,
    customerRef: r.invoice.customer.ref,
    customerName: r.invoice.customer.name,
    shipmentCode: displayShipmentCode(r.invoice.shipment!.code),
    mode: r.invoice.shipment!.mode as "AIR" | "SEA",
    field: r.field,
    before: r.before,
    after: r.after,
    changedBy: who(r.actorUserId),
  }));
}

export interface ExtraMeasureRow {
  invoiceId: string;
  invoiceNo: string;
  customerRef: string;
  customerName: string;
  shipmentId: string;
  shipmentCode: string;
  mode: "AIR" | "SEA";
  actual: string;
  billed: string;
  added: string;
  discount: string;
  extraEarned: string;
}

/** Invoices billed above the actual measure: Actual, Billed, Added, Discount,
 * Extra earned = added × (rate + quality) − discount. Commission is excluded:
 * it is not shipment income. */
export async function listExtraMeasure(db: PrismaClient, actor: AuthzUser, scope: Scope): Promise<ExtraMeasureRow[]> {
  scoped(actor, scope, "invoices:read");
  const invoices = await db.invoice.findMany({
    where: { status: { not: "VOID" }, shipment: shipmentWhere(scope), billedMeasure: { not: null }, actualMeasure: { not: null } },
    include: { customer: true, shipment: true },
    orderBy: { createdAt: "asc" },
    take: MAX_ROWS,
  });
  return invoices
    .filter((i) => i.billedMeasure!.greaterThan(i.actualMeasure!))
    .map((i) => {
      const added = i.billedMeasure!.minus(i.actualMeasure!);
      const rate = (i.baseRate ?? dec(0)).add(i.qualityRate ?? dec(0));
      return {
        invoiceId: i.id,
        invoiceNo: i.number,
        customerRef: i.customer.ref,
        customerName: i.customer.name,
        shipmentId: i.shipmentId!,
        shipmentCode: displayShipmentCode(i.shipment!.code),
        mode: i.shipment!.mode as "AIR" | "SEA",
        actual: s(i.actualMeasure),
        billed: s(i.billedMeasure),
        added: added.toString(),
        discount: s(i.discount),
        extraEarned: round2(added.mul(rate).minus(i.discount)).toString(),
      };
    });
}

// ------------------------------------------------------------------ reminders

export interface DueInvoiceRow {
  invoiceId: string;
  invoiceNo: string;
  customerRef: string;
  customerName: string;
  shipmentCode: string;
  date: string;
  ageDays: number;
  balance: string;
  status: "UNPAID" | "PARTIAL";
  lastReminderAt: string | null;
}

const DAY = 86_400_000;
const daysBetween = (from: Date, to: Date) => Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY));

export async function listDueInvoices(db: PrismaClient, actor: AuthzUser, scope: Scope, now = new Date()): Promise<DueInvoiceRow[]> {
  scoped(actor, scope, "invoices:read");
  const invoices = await db.invoice.findMany({
    where: { status: { in: ["UNPAID", "PARTIAL"] }, shipment: shipmentWhere(scope) },
    include: {
      customer: true,
      shipment: true,
      reminders: { where: { kind: "PAYMENT" }, orderBy: { createdAt: "desc" }, take: 1 },
    },
    take: MAX_ROWS,
  });
  return invoices
    .map((i) => {
      const date = i.issuedAt ?? i.createdAt;
      return {
        invoiceId: i.id,
        invoiceNo: i.number,
        customerRef: i.customer.ref,
        customerName: i.customer.name,
        shipmentCode: displayShipmentCode(i.shipment!.code),
        date: date.toISOString(),
        ageDays: daysBetween(date, now),
        balance: round2(i.total.minus(i.amountAllocated)).toString(),
        status: i.status as "UNPAID" | "PARTIAL",
        lastReminderAt: i.reminders[0]?.createdAt.toISOString() ?? null,
      };
    })
    .sort((a, b) => b.ageDays - a.ageDays);
}

/** Send a payment reminder. A reminder only: nothing is added to the invoice. */
export async function sendPaymentReminders(db: PrismaClient, actor: AuthzUser, scope: Scope, invoiceIds: string[]) {
  scoped(actor, scope, "invoices:write");
  if (invoiceIds.length === 0 || invoiceIds.length > 500) throw new ValidationError("Choose the invoices to remind");
  const invoices = await db.invoice.findMany({
    where: { id: { in: invoiceIds }, status: { in: ["UNPAID", "PARTIAL"] }, shipment: shipmentWhere(scope) },
  });
  if (invoices.length !== new Set(invoiceIds).size) throw new ValidationError("Some invoices are paid or outside your scope");
  await db.$transaction(async (tx) => {
    for (const i of invoices) {
      const balance = round2(i.total.minus(i.amountAllocated)).toFixed(2);
      const n = await tx.notification.create({
        data: {
          audience: "CUSTOMER",
          type: "payment_reminder",
          customerId: i.customerId,
          title: "Payment reminder",
          message: `Invoice ${i.number} has an unpaid balance of $${balance}. Please pay to one of our bank accounts.`,
          status: "SENT",
          sentAt: new Date(),
          createdByUserId: actor.id,
        },
      });
      await tx.paymentReminder.create({
        data: { kind: "PAYMENT", invoiceId: i.id, shipmentId: i.shipmentId!, customerId: i.customerId, notificationId: n.id, actorUserId: actor.id },
      });
    }
    await logAudit(tx, { actorUserId: actor.id, action: "invoice.remind", entityType: "Invoice", metadata: { invoices: invoiceIds } });
  });
  return invoices.length;
}

// Demurrage: spec A6 — charges begin when goods aren't collected within 3 days.
export const DEMURRAGE_DEFAULTS = { freeDays: 3, ratePerDay: "5" } as const;

export interface DemurrageRow {
  shipmentId: string;
  shipmentCode: string;
  customerId: string;
  customerRef: string;
  customerName: string;
  arrivedAt: string;
  daysWaiting: number;
  extraFreeDays: number;
  overFreeDays: number;
  fee: string;
  charged: string;
  invoiceId: string | null;
  invoiceNo: string | null;
  lastWarningAt: string | null;
}

function demurrageOf(arrivedAt: Date, now: Date, cfg: { freeDays: number; ratePerDay: Prisma.Decimal }, extra: number) {
  const days = daysBetween(arrivedAt, now);
  const over = Math.max(0, days - cfg.freeDays - extra);
  return { days, over, fee: round2(cfg.ratePerDay.mul(over)) };
}

function demurrageConfig(input: { freeDays?: number | string; ratePerDay?: number | string }) {
  const freeDays = Number(input.freeDays ?? DEMURRAGE_DEFAULTS.freeDays);
  if (!Number.isInteger(freeDays) || freeDays < 0 || freeDays > 365) throw new ValidationError("Free days must be a whole number");
  const ratePerDay = dec(input.ratePerDay ?? DEMURRAGE_DEFAULTS.ratePerDay);
  if (ratePerDay.isNegative()) throw new ValidationError("Rate per day cannot be negative");
  return { freeDays, ratePerDay };
}

/** Arrived cargo not yet collected, per customer, with the fee so far. */
export async function listDemurrage(
  db: PrismaClient,
  actor: AuthzUser,
  scope: Scope,
  cfgInput: { freeDays?: number | string; ratePerDay?: number | string } = {},
  now = new Date(),
): Promise<DemurrageRow[]> {
  scoped(actor, scope, "invoices:read");
  const cfg = demurrageConfig(cfgInput);
  const shipments = await db.shipment.findMany({
    where: { ...shipmentWhere(scope), status: "ARRIVED", lines: { some: { collectedAt: null } } },
    include: {
      lines: { where: { collectedAt: null }, include: { customer: true } },
      invoices: { where: { status: { not: "VOID" } }, include: { lines: { where: { category: "DEMURRAGE" } } } },
    },
    take: 500,
  });
  const warnings = await db.paymentReminder.findMany({
    where: { kind: "DEMURRAGE_WARNING", shipmentId: { in: shipments.map((x) => x.id) } },
    orderBy: { createdAt: "desc" },
  });
  const rows: DemurrageRow[] = [];
  for (const sh of shipments) {
    const arrived = sh.arrivedAt ?? sh.arrivalDate;
    if (!arrived) continue;
    const seen = new Set<string>();
    for (const l of sh.lines) {
      if (seen.has(l.customerId)) continue;
      seen.add(l.customerId);
      const extra = Math.max(...sh.lines.filter((x) => x.customerId === l.customerId).map((x) => x.extraFreeDays));
      const d = demurrageOf(arrived, now, cfg, extra);
      const inv = sh.invoices.find((i) => i.customerId === l.customerId);
      rows.push({
        shipmentId: sh.id,
        shipmentCode: displayShipmentCode(sh.code),
        customerId: l.customerId,
        customerRef: l.customer.ref,
        customerName: l.customer.name,
        arrivedAt: arrived.toISOString(),
        daysWaiting: d.days,
        extraFreeDays: extra,
        overFreeDays: d.over,
        fee: d.fee.toString(),
        charged: s(sum(inv?.lines.map((x) => x.amount) ?? [])),
        invoiceId: inv?.id ?? null,
        invoiceNo: inv?.number ?? null,
        lastWarningAt: warnings.find((w) => w.shipmentId === sh.id && w.customerId === l.customerId)?.createdAt.toISOString() ?? null,
      });
    }
  }
  return rows.sort((a, b) => b.overFreeDays - a.overFreeDays);
}

async function scopedCargo(db: PrismaClient, actor: AuthzUser, shipmentId: string, customerId: string, permission: Parameters<typeof requirePermission>[1]) {
  requirePermission(actor, permission);
  const sh = await db.shipment.findUnique({ where: { id: shipmentId } });
  if (!sh) throw new ValidationError("Shipment not found");
  requireScope(actor, { country: sh.originCountry, businessYear: sh.businessYear });
  const lines = await db.shipmentLine.findMany({ where: { shipmentId, customerId } });
  if (lines.length === 0) throw new ValidationError("This customer is not in the shipment");
  return { sh, lines };
}

/** Warn the customer. A warning only: nothing is charged. */
export async function sendDemurrageWarning(
  db: PrismaClient,
  actor: AuthzUser,
  input: { shipmentId: string; customerId: string; freeDays?: number | string; ratePerDay?: number | string },
  now = new Date(),
) {
  const { sh, lines } = await scopedCargo(db, actor, input.shipmentId, input.customerId, "invoices:write");
  const arrived = sh.arrivedAt ?? sh.arrivalDate;
  if (sh.status !== "ARRIVED" || !arrived) throw new ValidationError("The shipment has not arrived");
  const cfg = demurrageConfig(input);
  const d = demurrageOf(arrived, now, cfg, Math.max(...lines.map((l) => l.extraFreeDays)));
  const code = displayShipmentCode(sh.code);
  await db.$transaction(async (tx) => {
    const n = await tx.notification.create({
      data: {
        audience: "CUSTOMER",
        type: "demurrage_warning",
        customerId: input.customerId,
        title: "Demurrage warning",
        message: `Your cargo in ${code} has been waiting ${d.days} days. After ${cfg.freeDays} free days, demurrage of $${cfg.ratePerDay.toFixed(2)} per day may apply. Please collect it as soon as possible.`,
        status: "SENT",
        sentAt: new Date(),
        createdByUserId: actor.id,
      },
    });
    await tx.paymentReminder.create({
      data: { kind: "DEMURRAGE_WARNING", shipmentId: sh.id, customerId: input.customerId, notificationId: n.id, actorUserId: actor.id },
    });
    await logAudit(tx, { actorUserId: actor.id, action: "demurrage.warn", entityType: "Shipment", entityId: sh.id, metadata: { customerId: input.customerId } });
  });
}

/**
 * Approve demurrage: the only way a penalty reaches an invoice (spec B9 —
 * "a penalty or fee is added only after an admin approves it"). The fee is
 * recomputed here; the invoice's DEMURRAGE line is set to it, the change is
 * logged in Invoice History and the customer is notified.
 */
export async function approveDemurrage(
  db: PrismaClient,
  actor: AuthzUser,
  input: { shipmentId: string; customerId: string; freeDays?: number | string; ratePerDay?: number | string },
  now = new Date(),
) {
  const { sh, lines } = await scopedCargo(db, actor, input.shipmentId, input.customerId, "invoices:manage");
  await assertYearOpen(db, sh.originCountry, sh.businessYear);
  const arrived = sh.arrivedAt ?? sh.arrivalDate;
  if (sh.status !== "ARRIVED" || !arrived) throw new ValidationError("The shipment has not arrived");
  if (lines.every((l) => l.collectedAt)) throw new ValidationError("The cargo was already collected");
  const cfg = demurrageConfig(input);
  const d = demurrageOf(arrived, now, cfg, Math.max(...lines.map((l) => l.extraFreeDays)));

  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({
      where: { shipmentId: sh.id, customerId: input.customerId, status: { not: "VOID" } },
      include: { lines: { where: { category: "DEMURRAGE" } } },
    });
    if (!inv) throw new ValidationError("Create the customer's invoice first");
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${inv.id} FOR UPDATE`;
    const charged = round2(sum(inv.lines.map((l) => l.amount)));
    if (!d.fee.greaterThan(charged)) throw new ValidationError("Nothing new to charge");

    await tx.chargeLineItem.deleteMany({ where: { invoiceId: inv.id, category: "DEMURRAGE" } });
    await tx.chargeLineItem.create({
      data: {
        parentType: "INVOICE",
        invoiceId: inv.id,
        category: "DEMURRAGE",
        description: "Demurrage",
        quantity: dec(d.over),
        unitPrice: cfg.ratePerDay,
        amount: d.fee,
        currency: inv.currency,
      },
    });
    await recomputeInvoice(tx, inv.id);
    await tx.invoiceRevision.create({
      data: { invoiceId: inv.id, field: "Demurrage", before: charged.toString(), after: d.fee.toString(), actorUserId: actor.id },
    });
    const added = round2(d.fee.minus(charged));
    await tx.notification.create({
      data: {
        audience: "CUSTOMER",
        type: "demurrage",
        customerId: input.customerId,
        title: "Demurrage added",
        message: `Demurrage of $${added.toFixed(2)} (${d.over} days × $${cfg.ratePerDay.toFixed(2)}) has been added to invoice ${inv.number}.`,
        status: "SENT",
        sentAt: new Date(),
        createdByUserId: actor.id,
      },
    });
    await logAudit(tx, {
      actorUserId: actor.id,
      action: "demurrage.approve",
      entityType: "Invoice",
      entityId: inv.id,
      metadata: { days: d.over, rate: cfg.ratePerDay.toString(), fee: d.fee.toString() },
    });
    return { invoiceNo: inv.number, added: added.toString() };
  });
}

/** Extra free days for one customer's cargo (Finance, per row ±). */
export async function setExtraFreeDays(db: PrismaClient, actor: AuthzUser, input: { shipmentId: string; customerId: string; days: number }) {
  if (!Number.isInteger(input.days) || input.days < 0 || input.days > 365) throw new ValidationError("Extra days must be a whole number");
  await scopedCargo(db, actor, input.shipmentId, input.customerId, "invoices:write");
  await db.shipmentLine.updateMany({ where: { shipmentId: input.shipmentId, customerId: input.customerId }, data: { extraFreeDays: input.days } });
  await logAudit(db, { actorUserId: actor.id, action: "demurrage.extra_days", entityType: "Shipment", entityId: input.shipmentId, metadata: input });
}

/** The customer collected the cargo: the demurrage clock stops. */
export async function markCargoCollected(db: PrismaClient, actor: AuthzUser, input: { shipmentId: string; customerId: string }) {
  await scopedCargo(db, actor, input.shipmentId, input.customerId, "invoices:write");
  await db.shipmentLine.updateMany({
    where: { shipmentId: input.shipmentId, customerId: input.customerId, collectedAt: null },
    data: { collectedAt: new Date() },
  });
  await logAudit(db, { actorUserId: actor.id, action: "cargo.collected", entityType: "Shipment", entityId: input.shipmentId, metadata: input });
}
