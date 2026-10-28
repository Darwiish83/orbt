import type { ChargeLineItem, Invoice, Prisma, PrismaClient, Shipment, ShipmentLine } from "@prisma/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import { displayShipmentCode } from "@/modules/authz/adminScope";
import { isCustomerPrincipal, requirePermission, requireScope, type AuthzUser } from "@/modules/authz/core";
import { assertOpen, assertYearOpen } from "@/modules/accounting/periods";
import { buildSpecInvoice, lineMeasure, type SpecInvoiceInput } from "./charges";
import { createInvoice, recomputeInvoice } from "./invoices";
import { dec, round2, sum } from "./money";
import { recordPayment, recordPaymentTx, reversePaymentTx } from "./payments";

/**
 * Finance by shipment (spec B9): every read and write is scoped to the
 * shipment's origin country and business year, and every amount is computed
 * here from stored values — the browser only sends what staff typed.
 */

type Db = PrismaClient | Prisma.TransactionClient;
const s = (v: Prisma.Decimal | null | undefined) => (v == null ? "0" : v.toString());

async function scopedShipment(db: Db, actor: AuthzUser, shipmentId: string, permission: Parameters<typeof requirePermission>[1]) {
  requirePermission(actor, permission);
  const shipment = await db.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new ValidationError("Shipment not found");
  requireScope(actor, { country: shipment.originCountry, businessYear: shipment.businessYear });
  return shipment;
}

/** Load an invoice that belongs to a shipment the actor may work on. */
async function scopedInvoice(db: Db, actor: AuthzUser, invoiceId: string, permission: Parameters<typeof requirePermission>[1]) {
  requirePermission(actor, permission);
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { shipment: true, lines: true } });
  if (!invoice) throw new ValidationError("Invoice not found");
  if (!invoice.shipment) throw new AuthorizationError("Invoice is not linked to a shipment");
  requireScope(actor, { country: invoice.shipment.originCountry, businessYear: invoice.shipment.businessYear });
  return invoice as typeof invoice & { shipment: Shipment };
}

// ------------------------------------------------------------------ reads

export interface FinanceShipmentRow {
  id: string;
  code: string;
  mode: "AIR" | "SEA";
  shipDate: string | null;
  status: Shipment["status"];
  packages: number;
  measure: string;
}

/** Shipments of the selected country + year, W-1 first (spec §1 ordering). */
export async function listFinanceShipments(
  db: PrismaClient,
  actor: AuthzUser,
  scope: { country: string; year: number },
  filters: { mode: "AIR" | "SEA"; q?: string },
): Promise<FinanceShipmentRow[]> {
  requirePermission(actor, "invoices:read");
  requireScope(actor, { country: scope.country, businessYear: scope.year });
  const shipments = await db.shipment.findMany({
    where: {
      originCountry: scope.country,
      businessYear: scope.year,
      mode: filters.mode,
      ...(filters.q ? { code: { contains: filters.q.trim(), mode: "insensitive" } } : {}),
    },
    include: { lines: true },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const seq = (code: string) => parseInt(displayShipmentCode(code).replace(/^\D+-/, ""), 10) || 0;
  return shipments
    .sort((a, b) => seq(a.code) - seq(b.code))
    .map((sh) => ({
      id: sh.id,
      code: displayShipmentCode(sh.code),
      mode: sh.mode as "AIR" | "SEA",
      shipDate: sh.shipDate?.toISOString() ?? null,
      status: sh.status,
      packages: sh.lines.reduce((n, l) => n + (l.packages ?? 0) + (l.mixCount ?? 0), 0),
      measure: sum(sh.lines.map((l) => lineMeasure(sh.mode, l))).toString(),
    }));
}

export interface InvoiceSummary {
  id: string;
  number: string;
  status: Invoice["status"];
  total: string;
  paid: string;
  balance: string;
  createdAt: string;
  customerId: string;
}

function summary(inv: Invoice): InvoiceSummary {
  return {
    id: inv.id,
    number: inv.number,
    status: inv.status,
    total: s(inv.total),
    paid: s(inv.amountAllocated),
    balance: round2(inv.total.minus(inv.amountAllocated)).toString(),
    createdAt: (inv.issuedAt ?? inv.createdAt).toISOString(),
    customerId: inv.customerId,
  };
}

/** Defaults offered in Create Invoice, taken from the customer's cargo lines. */
export interface InvoiceDefaults {
  actualMeasure: string;
  baseRate: string;
  qualityRate: string;
  brandPcs: number;
  brandRate: string;
  fatura: string;
  localDelivery: string;
  others: string;
  othersDescription: string;
  discount: string;
}

function defaultsFrom(mode: Shipment["mode"], lines: ShipmentLine[]): InvoiceDefaults {
  const first = (k: "rate" | "qualityRate" | "brandRate") => lines.find((l) => l[k] && !l[k]!.isZero())?.[k];
  const add = (k: "fatura" | "delivery" | "other" | "discount") => sum(lines.map((l) => l[k] ?? dec(0)));
  return {
    actualMeasure: sum(lines.map((l) => lineMeasure(mode, l))).toString(),
    baseRate: s(first("rate")),
    qualityRate: s(first("qualityRate")),
    brandPcs: lines.reduce((n, l) => n + (l.brandPcs ?? 0), 0),
    brandRate: s(first("brandRate")),
    fatura: add("fatura").toString(),
    localDelivery: add("delivery").toString(),
    others: add("other").toString(),
    othersDescription: lines.map((l) => l.note).find(Boolean) ?? "",
    discount: add("discount").toString(),
  };
}

export interface ShipmentCustomerRow {
  customerId: string;
  ref: string;
  name: string;
  packages: number;
  defaults: InvoiceDefaults;
  invoice: InvoiceSummary | null;
}

/** "Customers in this Shipment": one row per customer (MIX entries stack). */
export async function shipmentCustomers(db: PrismaClient, actor: AuthzUser, shipmentId: string): Promise<ShipmentCustomerRow[]> {
  const shipment = await scopedShipment(db, actor, shipmentId, "invoices:read");
  const [lines, invoices] = await Promise.all([
    db.shipmentLine.findMany({ where: { shipmentId }, include: { customer: true }, orderBy: { createdAt: "asc" } }),
    db.invoice.findMany({ where: { shipmentId, status: { not: "VOID" } } }),
  ]);
  const byCustomer = new Map<string, { ref: string; name: string; lines: ShipmentLine[] }>();
  for (const l of lines) {
    const g = byCustomer.get(l.customerId) ?? { ref: l.customer.ref, name: l.customer.name, lines: [] };
    g.lines.push(l);
    byCustomer.set(l.customerId, g);
  }
  return [...byCustomer.entries()].map(([customerId, g]) => {
    const inv = invoices.find((i) => i.customerId === customerId);
    return {
      customerId,
      ref: g.ref,
      name: g.name,
      packages: g.lines.reduce((n, l) => n + (l.packages ?? 0) + (l.mixCount ?? 0), 0),
      defaults: defaultsFrom(shipment.mode, g.lines),
      invoice: inv ? summary(inv) : null,
    };
  });
}

export interface ShipmentInvoiceRow extends InvoiceSummary {
  customerRef: string;
  customerName: string;
}

export async function shipmentInvoices(db: PrismaClient, actor: AuthzUser, shipmentId: string): Promise<ShipmentInvoiceRow[]> {
  await scopedShipment(db, actor, shipmentId, "invoices:read");
  const invoices = await db.invoice.findMany({
    where: { shipmentId, status: { not: "VOID" } },
    include: { customer: true },
    orderBy: { createdAt: "asc" },
  });
  return invoices.map((i) => ({ ...summary(i), customerRef: i.customer.ref, customerName: i.customer.name }));
}

export interface ShipmentPaymentRow {
  id: string;
  receiptNo: string | null;
  receivedAt: string;
  customerRef: string;
  customerName: string;
  bank: string | null;
  amount: string;
  invoiceId: string;
  invoiceNo: string;
  invoiceStatus: Invoice["status"];
}

/** Payments allocated to this shipment's invoices (reversed ones are hidden). */
export async function shipmentPayments(db: PrismaClient, actor: AuthzUser, shipmentId: string): Promise<ShipmentPaymentRow[]> {
  await scopedShipment(db, actor, shipmentId, "payments:read");
  const allocations = await db.paymentAllocation.findMany({
    where: { invoice: { shipmentId }, payment: { reversedAt: null } },
    include: { invoice: true, payment: { include: { customer: true, bank: true, receipt: true } } },
    orderBy: { payment: { receivedAt: "asc" } },
  });
  return allocations.map((a) => ({
    id: a.payment.id,
    receiptNo: a.payment.receipt?.number ?? null,
    receivedAt: a.payment.receivedAt.toISOString(),
    customerRef: a.payment.customer.ref,
    customerName: a.payment.customer.name,
    bank: a.payment.bank?.name ?? null,
    amount: s(a.amount),
    invoiceId: a.invoiceId,
    invoiceNo: a.invoice.number,
    invoiceStatus: a.invoice.status,
  }));
}

// ------------------------------------------------------------------ invoice inputs

/** What staff type in Create / Edit Invoice. The actual measure is never taken
 * from here: it is recomputed from the shipment lines. */
export type InvoiceFormInput = Omit<SpecInvoiceInput, "actualMeasure">;

/** The current values of an invoice's inputs (for Edit Invoice and history). */
export function invoiceInputsOf(inv: Invoice & { lines: ChargeLineItem[] }): InvoiceFormInput {
  const line = (c: ChargeLineItem["category"]) => inv.lines.find((l) => l.category === c);
  const brand = line("BRAND");
  const other = line("OTHER");
  return {
    billedMeasure: s(inv.billedMeasure),
    baseRate: s(inv.baseRate),
    qualityRate: s(inv.qualityRate),
    agentName: inv.agentName,
    agentRate: inv.agentRate ? inv.agentRate.toString() : null,
    brandPcs: brand ? Number(brand.quantity) : 0,
    brandRate: brand ? brand.unitPrice.toString() : "0",
    fatura: s(line("FATURA")?.amount),
    localDelivery: s(line("LOCAL_DELIVERY")?.amount),
    others: s(other?.amount),
    othersDescription: other?.description ?? "",
    discount: s(inv.discount),
  };
}

async function actualMeasureOf(db: Db, shipment: Shipment, customerId: string): Promise<Prisma.Decimal> {
  const lines = await db.shipmentLine.findMany({ where: { shipmentId: shipment.id, customerId } });
  if (lines.length === 0) throw new ValidationError("This customer is not in the shipment");
  return sum(lines.map((l) => lineMeasure(shipment.mode, l)));
}

/** Create the customer's invoice for a shipment (row button "Create Invoice"). */
export async function createShipmentInvoice(
  db: PrismaClient,
  actor: AuthzUser,
  input: { shipmentId: string; customerId: string } & InvoiceFormInput,
): Promise<Invoice> {
  const shipment = await scopedShipment(db, actor, input.shipmentId, "invoices:write");
  await assertYearOpen(db, shipment.originCountry, shipment.businessYear);
  await assertOpen(db, shipment.originCountry, new Date());
  const actual = await actualMeasureOf(db, shipment, input.customerId);
  const existing = await db.invoice.findFirst({
    where: { shipmentId: shipment.id, customerId: input.customerId, status: { not: "VOID" } },
  });
  if (existing) throw new ValidationError("This customer already has an invoice for this shipment");

  const built = buildSpecInvoice({ ...input, actualMeasure: actual.toString() });
  return createInvoice(db, actor, {
    customerId: input.customerId,
    shipmentId: shipment.id,
    businessYear: shipment.businessYear,
    lines: built.lines,
    discount: built.discount.toString(),
    spec: {
      actualMeasure: actual.toString(),
      billedMeasure: dec(input.billedMeasure ?? 0).toString(),
      baseRate: dec(input.baseRate ?? 0).toString(),
      qualityRate: input.qualityRate == null ? null : dec(input.qualityRate).toString(),
      agentName: input.agentName?.trim() || null,
      agentRate: input.agentName?.trim() && input.agentRate != null ? dec(input.agentRate).toString() : null,
      commissionAmount: built.commissionAmount.toString(),
    },
  });
}

/** Field labels shown in Invoice History (translated in the UI). */
const REVISION_FIELDS: [label: string, get: (i: InvoiceFormInput) => string][] = [
  ["Quantity", (i) => s(dec(i.billedMeasure ?? 0))],
  ["Rate (USD)", (i) => s(dec(i.baseRate ?? 0))],
  ["Quality (USD)", (i) => s(dec(i.qualityRate ?? 0))],
  ["Brand PCS", (i) => String(i.brandPcs ?? 0)],
  ["Brand Rate (USD)", (i) => s(dec(i.brandRate ?? 0))],
  ["Fatura (USD)", (i) => s(dec(i.fatura ?? 0))],
  ["Local Delivery (USD)", (i) => s(dec(i.localDelivery ?? 0))],
  ["Others (USD)", (i) => s(dec(i.others ?? 0))],
  ["Discount (USD)", (i) => s(dec(i.discount ?? 0))],
  ["Agent", (i) => i.agentName?.trim() || "-"],
  ["Commission rate (USD)", (i) => (i.agentName?.trim() ? s(dec(i.agentRate ?? 0)) : "0")],
];

/**
 * Edit Invoice. Lines are rebuilt from the new inputs (an approved DEMURRAGE
 * line is kept); the new total may not fall below what was already paid; one
 * InvoiceRevision row is written per changed field.
 */
export async function updateShipmentInvoice(
  db: PrismaClient,
  actor: AuthzUser,
  invoiceId: string,
  input: InvoiceFormInput,
): Promise<Invoice> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
    const inv = await scopedInvoice(tx, actor, invoiceId, "invoices:write");
    if (inv.status === "VOID") throw new ValidationError("A deleted invoice cannot be edited");
    await assertYearOpen(tx, inv.shipment.originCountry, inv.shipment.businessYear);
    await assertOpen(tx, inv.shipment.originCountry, inv.issuedAt ?? inv.createdAt);

    const actual = await actualMeasureOf(tx, inv.shipment, inv.customerId);
    const built = buildSpecInvoice({ ...input, actualMeasure: actual.toString() });
    const demurrage = inv.lines.filter((l) => l.category === "DEMURRAGE");
    const newTotal = round2(
      sum([...built.lines.map((l) => round2(dec(l.quantity).mul(dec(l.unitPrice)))), ...demurrage.map((l) => l.amount)]).minus(
        built.discount,
      ),
    );
    if (newTotal.lessThan(inv.amountAllocated)) {
      throw new ValidationError("The new total is below the amount already paid");
    }

    const before = invoiceInputsOf(inv);
    const agentName = input.agentName?.trim() || null;
    await tx.chargeLineItem.deleteMany({ where: { invoiceId, category: { not: "DEMURRAGE" } } });
    await tx.chargeLineItem.createMany({
      data: built.lines.map((l) => ({
        parentType: "INVOICE" as const,
        invoiceId,
        category: l.category,
        description: l.description,
        quantity: dec(l.quantity),
        unitPrice: dec(l.unitPrice),
        amount: round2(dec(l.quantity).mul(dec(l.unitPrice))),
        currency: inv.currency,
      })),
    });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        discount: built.discount,
        actualMeasure: actual,
        billedMeasure: dec(input.billedMeasure ?? 0),
        baseRate: dec(input.baseRate ?? 0),
        qualityRate: input.qualityRate == null ? null : dec(input.qualityRate),
        agentName,
        agentRate: agentName && input.agentRate != null ? dec(input.agentRate) : null,
        commissionAmount: agentName ? built.commissionAmount : dec(0),
      },
    });
    await recomputeInvoice(tx, invoiceId);
    const after = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });

    const changes = REVISION_FIELDS.map(([field, get]) => ({ field, before: get(before), after: get(input) })).filter(
      (c) => c.before !== c.after,
    );
    if (!inv.total.equals(after.total)) changes.unshift({ field: "Total Amount (USD)", before: s(inv.total), after: s(after.total) });
    if (changes.length) {
      await tx.invoiceRevision.createMany({ data: changes.map((c) => ({ ...c, invoiceId, actorUserId: actor.id })) });
    }
    await logAudit(tx, {
      actorUserId: actor.id,
      action: "invoice.update",
      entityType: "Invoice",
      entityId: invoiceId,
      metadata: { changes: changes.map((c) => c.field), total: s(after.total) },
    });
    return after;
  });
}

/** Delete Invoice = void it (financial history is never hard-deleted). Only an
 * invoice with no live payments can be deleted. */
export async function deleteShipmentInvoice(db: PrismaClient, actor: AuthzUser, invoiceId: string): Promise<Invoice> {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
    const inv = await scopedInvoice(tx, actor, invoiceId, "invoices:manage");
    if (inv.status === "VOID") return inv;
    await assertYearOpen(tx, inv.shipment.originCountry, inv.shipment.businessYear);
    await assertOpen(tx, inv.shipment.originCountry, inv.issuedAt ?? inv.createdAt);
    if (!inv.amountAllocated.isZero()) {
      throw new ValidationError("Cannot delete an invoice with payments; delete the payments first");
    }
    const updated = await tx.invoice.update({ where: { id: invoiceId }, data: { status: "VOID" } });
    await tx.invoiceRevision.create({
      data: { invoiceId, field: "Status", before: inv.status, after: "VOID", actorUserId: actor.id },
    });
    await logAudit(tx, { actorUserId: actor.id, action: "invoice.void", entityType: "Invoice", entityId: invoiceId });
    return updated;
  });
}

// ------------------------------------------------------------------ payments

export interface ShipmentPaymentInput {
  amount: string;
  bankId: string;
  receivedAt: Date;
}

async function bankMethod(db: Db, bankId: string) {
  const bank = await db.bank.findUnique({ where: { id: bankId } });
  if (!bank || !bank.active) throw new ValidationError("Choose a bank");
  return bank.isCash ? ("CASH" as const) : ("BANK_TRANSFER" as const);
}

function checkDate(d: Date) {
  if (Number.isNaN(d.getTime())) throw new ValidationError("Enter a valid payment date");
  if (d.getTime() > Date.now() + 24 * 3600 * 1000) throw new ValidationError("The payment date cannot be in the future");
}

/** + Add Payment against one of the shipment's invoices. */
export async function addShipmentPayment(
  db: PrismaClient,
  actor: AuthzUser,
  input: ShipmentPaymentInput & { invoiceId: string; idempotencyKey?: string },
) {
  const inv = await scopedInvoice(db, actor, input.invoiceId, "payments:write");
  if (inv.status === "VOID") throw new ValidationError("Cannot pay a deleted invoice");
  checkDate(input.receivedAt);
  await assertOpen(db, inv.shipment.originCountry, input.receivedAt);
  const method = await bankMethod(db, input.bankId);
  return recordPayment(db, actor, {
    customerId: inv.customerId,
    amount: input.amount,
    currency: inv.currency,
    method,
    bankId: input.bankId,
    receivedAt: input.receivedAt,
    idempotencyKey: input.idempotencyKey,
    allocations: [{ invoiceId: inv.id, amount: input.amount }],
    notifyCustomer: true,
  });
}

async function scopedPayment(db: Db, actor: AuthzUser, paymentId: string) {
  requirePermission(actor, "payments:manage");
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { allocations: { include: { invoice: { include: { shipment: true } } } } },
  });
  if (!payment) throw new ValidationError("Payment not found");
  const alloc = payment.allocations[0];
  if (payment.allocations.length !== 1 || !alloc?.invoice.shipment) {
    throw new ValidationError("Only single-invoice shipment payments can be changed here");
  }
  const sh = alloc.invoice.shipment;
  requireScope(actor, { country: sh.originCountry, businessYear: sh.businessYear });
  if (payment.reversedAt) throw new ValidationError("This payment was already changed or deleted");
  await assertOpen(db, sh.originCountry, payment.receivedAt);
  return { payment, invoice: alloc.invoice };
}

/** Edit Payment = reverse the old payment and record the corrected one, in one
 * transaction. Both receipts stay on file; the old one is marked reversed. */
export async function editShipmentPayment(db: PrismaClient, actor: AuthzUser, paymentId: string, input: ShipmentPaymentInput) {
  checkDate(input.receivedAt);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const { payment, invoice } = await scopedPayment(tx, actor, paymentId);
    await assertOpen(tx, invoice.shipment!.originCountry, input.receivedAt);
    const method = await bankMethod(tx, input.bankId);
    await reversePaymentTx(tx, actor, paymentId, "Edited in Finance");
    return recordPaymentTx(tx, actor, {
      customerId: payment.customerId,
      amount: input.amount,
      currency: payment.currency,
      method,
      bankId: input.bankId,
      receivedAt: input.receivedAt,
      allocations: [{ invoiceId: invoice.id, amount: input.amount }],
    });
  });
}

/** Delete Payment = reverse it (kept on file, excluded from balances). */
export async function deleteShipmentPayment(db: PrismaClient, actor: AuthzUser, paymentId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    await scopedPayment(tx, actor, paymentId);
    return reversePaymentTx(tx, actor, paymentId, "Deleted in Finance");
  });
}

// ------------------------------------------------------------------ documents

export interface InvoiceDocument {
  id: string;
  number: string;
  status: Invoice["status"];
  date: string;
  mode: "AIR" | "SEA";
  shipmentCode: string;
  customerName: string;
  customerRef: string;
  inputs: InvoiceFormInput;
  actualMeasure: string;
  lines: { category: ChargeLineItem["category"]; description: string; quantity: string; unitPrice: string; amount: string }[];
  discount: string;
  total: string;
  paid: string;
  balance: string;
}

/** A customer's own live invoice, or "not found" — never a hint that another
 * customer's invoice exists. */
async function ownInvoice(db: Db, actor: AuthzUser, invoiceId: string) {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, customerId: actor.customerId ?? "__none__", status: { not: "VOID" } },
    include: { shipment: true, lines: true },
  });
  if (!invoice?.shipment) throw new ValidationError("Invoice not found");
  return invoice as typeof invoice & { shipment: Shipment };
}

/** Everything the invoice paper / Edit dialog needs: staff (scoped), or the
 * customer it belongs to (download / print in the portal). */
export async function getInvoiceDocument(db: PrismaClient, actor: AuthzUser, invoiceId: string): Promise<InvoiceDocument> {
  const inv = isCustomerPrincipal(actor) ? await ownInvoice(db, actor, invoiceId) : await scopedInvoice(db, actor, invoiceId, "invoices:read");
  const customer = await db.customer.findUniqueOrThrow({ where: { id: inv.customerId } });
  const order: ChargeLineItem["category"][] = ["FREIGHT", "QUALITY", "BRAND", "FATURA", "LOCAL_DELIVERY", "OTHER", "DEMURRAGE"];
  const lines = [...inv.lines].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  return {
    id: inv.id,
    number: inv.number,
    status: inv.status,
    date: (inv.issuedAt ?? inv.createdAt).toISOString(),
    mode: inv.shipment.mode as "AIR" | "SEA",
    shipmentCode: displayShipmentCode(inv.shipment.code),
    customerName: customer.name,
    customerRef: customer.ref,
    inputs: invoiceInputsOf(inv),
    actualMeasure: s(inv.actualMeasure),
    lines: lines.map((l) => ({
      category: l.category,
      description: l.description ?? "",
      quantity: s(l.quantity),
      unitPrice: s(l.unitPrice),
      amount: s(l.amount),
    })),
    discount: s(inv.discount),
    total: s(inv.total),
    paid: s(inv.amountAllocated),
    balance: round2(inv.total.minus(inv.amountAllocated)).toString(),
  };
}

export interface PaymentReceiptDoc {
  receiptNo: string;
  amount: string;
  customerName: string;
  customerRef: string;
  invoiceNo: string;
  date: string;
  bank: string | null;
  balance: string;
  reversed: boolean;
}

/** A payment receipt: staff (payments:read, scoped), or the customer who paid
 * (their own, not reversed). */
export async function getPaymentReceipt(db: PrismaClient, actor: AuthzUser, paymentId: string): Promise<PaymentReceiptDoc> {
  const customer = isCustomerPrincipal(actor);
  if (!customer) requirePermission(actor, "payments:read");
  const payment = await db.payment.findUnique({
    where: { id: paymentId },
    include: { customer: true, bank: true, receipt: true, allocations: { include: { invoice: { include: { shipment: true } } } } },
  });
  if (!payment || !payment.receipt) throw new ValidationError("Receipt not found");
  if (customer && (payment.customerId !== actor.customerId || payment.reversedAt)) throw new ValidationError("Receipt not found");
  const inv = payment.allocations[0]?.invoice;
  if (!inv?.shipment) throw new AuthorizationError("Receipt is not linked to a shipment invoice");
  if (!customer) requireScope(actor, { country: inv.shipment.originCountry, businessYear: inv.shipment.businessYear });
  return {
    receiptNo: payment.receipt.number,
    amount: s(payment.amount),
    customerName: payment.customer.name,
    customerRef: payment.customer.ref,
    invoiceNo: inv.number,
    date: payment.receivedAt.toISOString(),
    bank: payment.bank?.name ?? null,
    balance: round2(inv.total.minus(inv.amountAllocated)).toString(),
    reversed: payment.reversedAt !== null,
  };
}

export interface MyReceiptRow {
  paymentId: string;
  invoiceId: string;
  receiptNo: string;
  amount: string;
  date: string;
}

/** The signed-in customer's payment receipts (not reversed), newest first. */
export async function myPaymentReceipts(db: PrismaClient, actor: AuthzUser): Promise<MyReceiptRow[]> {
  if (!isCustomerPrincipal(actor)) throw new AuthorizationError("Customers only");
  const payments = await db.payment.findMany({
    where: { customerId: actor.customerId ?? "__none__", reversedAt: null, receipt: { isNot: null } },
    include: { receipt: true, allocations: { select: { invoiceId: true }, take: 1 } },
    orderBy: { receivedAt: "desc" },
  });
  return payments
    .filter((p) => p.receipt && p.allocations[0])
    .map((p) => ({ paymentId: p.id, invoiceId: p.allocations[0]!.invoiceId, receiptNo: p.receipt!.number, amount: s(p.amount), date: p.receivedAt.toISOString() }));
}
