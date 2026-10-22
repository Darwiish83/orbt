import type { ChargeCategory, Invoice, Prisma, PrismaClient } from "@prisma/client";
import { ValidationError } from "@/lib/errors";
import { buildPage, normalizePage, type Page, type PageParams } from "@/lib/pagination";
import { logAudit } from "@/modules/audit/log";
import {
  assertCustomerAccess,
  isCustomerPrincipal,
  requirePermission,
  type AuthzUser,
} from "@/modules/authz/core";
import { buildSpecInvoice, type SpecInvoiceInput } from "./charges";
import { dec, lineAmount, round2, sum, type DecimalInput } from "./money";

export interface ChargeLineInput {
  category: ChargeCategory;
  description?: string;
  quantity: number | string;
  unitPrice: number | string;
}

export interface CreateInvoiceInput {
  customerId: string;
  shipmentId?: string;
  currency?: string;
  businessYear?: number;
  lines: ChargeLineInput[];
  /** Subtracted from the sum of lines; cannot exceed it. */
  discount?: DecimalInput;
  /** Spec B9 freight snapshot (set by createSpecInvoice). */
  spec?: {
    actualMeasure: DecimalInput;
    billedMeasure: DecimalInput;
    baseRate: DecimalInput;
    qualityRate?: DecimalInput | null;
    agentName?: string | null;
    agentRate?: DecimalInput | null;
    commissionAmount: DecimalInput;
  };
}

type TxClient = Prisma.TransactionClient;

async function nextInvoiceNumber(db: PrismaClient, year: number): Promise<string> {
  const prefix = `INV-${year}-`;
  const count = await db.invoice.count({ where: { number: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

/**
 * Recompute an invoice's authoritative total (from its line items) and
 * amountAllocated (from NON-reversed payment allocations), and derive status.
 * Always run inside the mutation's transaction. The DB CHECK
 * (amountAllocated <= total) is the final backstop against over-allocation.
 */
export async function recomputeInvoice(tx: TxClient, invoiceId: string): Promise<void> {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { lines: true, allocations: { include: { payment: true } } },
  });

  const total = round2(sum(invoice.lines.map((l) => l.amount)).minus(invoice.discount));
  const allocated = round2(
    sum(invoice.allocations.filter((a) => a.payment.reversedAt === null).map((a) => a.amount)),
  );

  let status: Invoice["status"];
  if (invoice.status === "VOID") status = "VOID";
  else if (total.greaterThan(0) && allocated.greaterThanOrEqualTo(total)) status = "PAID";
  else if (allocated.greaterThan(0)) status = "PARTIAL";
  else status = "UNPAID";

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { total, amountAllocated: allocated, status },
  });
}

export async function createInvoice(
  db: PrismaClient,
  actor: AuthzUser,
  input: CreateInvoiceInput,
): Promise<Invoice> {
  requirePermission(actor, "invoices:write");
  if (input.lines.length === 0) throw new ValidationError("An invoice needs at least one line");

  const currency = input.currency ?? "USD";
  const year = input.businessYear ?? new Date().getFullYear();

  const lineData = input.lines.map((l) => ({
    parentType: "INVOICE" as const,
    category: l.category,
    description: l.description,
    quantity: dec(l.quantity),
    unitPrice: dec(l.unitPrice),
    amount: lineAmount(l.quantity, l.unitPrice), // computed server-side
    currency,
  }));
  const discount = round2(dec(input.discount ?? 0));
  const subtotal = round2(sum(lineData.map((l) => l.amount)));
  if (discount.isNegative() || discount.greaterThan(subtotal)) {
    throw new ValidationError("Discount must be between zero and the invoice subtotal");
  }
  const total = round2(subtotal.minus(discount));
  const spec = input.spec;

  for (let attempt = 0; attempt < 5; attempt++) {
    const number = await nextInvoiceNumber(db, year);
    try {
      const invoice = await db.$transaction(async (tx) => {
        const inv = await tx.invoice.create({
          data: {
            number,
            customerId: input.customerId,
            shipmentId: input.shipmentId,
            currency,
            businessYear: year,
            total,
            discount,
            status: "UNPAID",
            createdByUserId: actor.id,
            ...(spec && {
              actualMeasure: dec(spec.actualMeasure),
              billedMeasure: dec(spec.billedMeasure),
              baseRate: dec(spec.baseRate),
              qualityRate: spec.qualityRate == null ? null : dec(spec.qualityRate),
              agentName: spec.agentName ?? null,
              agentRate: spec.agentRate == null ? null : dec(spec.agentRate),
              commissionAmount: round2(dec(spec.commissionAmount)),
            }),
            lines: { create: lineData },
          },
        });
        await logAudit(tx, {
          actorUserId: actor.id,
          action: "invoice.create",
          entityType: "Invoice",
          entityId: inv.id,
          metadata: { number, total: total.toString(), currency },
        });
        return inv;
      });
      return invoice;
    } catch (e) {
      if (attempt === 4) throw e;
    }
  }
  throw new Error("unreachable");
}

/**
 * Create a customer's shipment invoice from the spec inputs (billed measure,
 * rate, quality, agent commission, brand/fatura/local delivery/others,
 * discount). Totals and commission are computed here, never taken from the
 * browser. The customer-facing freight line uses the combined rate.
 */
export async function createSpecInvoice(
  db: PrismaClient,
  actor: AuthzUser,
  input: { customerId: string; shipmentId: string; currency?: string; businessYear?: number } & SpecInvoiceInput,
): Promise<Invoice> {
  const built = buildSpecInvoice(input);
  return createInvoice(db, actor, {
    customerId: input.customerId,
    shipmentId: input.shipmentId,
    currency: input.currency,
    businessYear: input.businessYear,
    lines: built.lines,
    discount: built.discount.toString(),
    spec: {
      actualMeasure: dec(input.actualMeasure ?? 0).toString(),
      billedMeasure: dec(input.billedMeasure ?? 0).toString(),
      baseRate: dec(input.baseRate ?? 0).toString(),
      qualityRate: input.qualityRate == null ? null : dec(input.qualityRate).toString(),
      agentName: input.agentName ?? null,
      agentRate: input.agentRate == null ? null : dec(input.agentRate).toString(),
      commissionAmount: built.commissionAmount.toString(),
    },
  });
}

export async function issueInvoice(db: PrismaClient, actor: AuthzUser, invoiceId: string): Promise<Invoice> {
  requirePermission(actor, "invoices:write");
  const invoice = await db.invoice.update({
    where: { id: invoiceId },
    data: { issuedAt: new Date() },
  });
  await logAudit(db, { actorUserId: actor.id, action: "invoice.issue", entityType: "Invoice", entityId: invoiceId });
  return invoice;
}

export async function voidInvoice(db: PrismaClient, actor: AuthzUser, invoiceId: string): Promise<Invoice> {
  requirePermission(actor, "invoices:manage");
  const invoice = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (!invoice.amountAllocated.equals(0)) {
    throw new ValidationError("Cannot void an invoice with payments; reverse the payments first");
  }
  const updated = await db.invoice.update({ where: { id: invoiceId }, data: { status: "VOID" } });
  await logAudit(db, { actorUserId: actor.id, action: "invoice.void", entityType: "Invoice", entityId: invoiceId });
  return updated;
}

export async function getInvoice(db: PrismaClient, actor: AuthzUser, invoiceId: string) {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId }, include: { lines: true } });
  if (!invoice) return null;
  assertCustomerAccess(actor, invoice.customerId, "invoices:read");
  return invoice;
}

export interface ListInvoicesFilters extends PageParams {
  status?: Invoice["status"];
  customerId?: string;
}

export async function listInvoices(
  db: PrismaClient,
  actor: AuthzUser,
  filters: ListInvoicesFilters = {},
): Promise<Page<Invoice>> {
  const { page, pageSize, skip, take } = normalizePage(filters);
  const where: Prisma.InvoiceWhereInput = {};

  if (isCustomerPrincipal(actor)) {
    where.customerId = actor.customerId ?? "__none__";
  } else {
    requirePermission(actor, "invoices:read");
    if (filters.customerId) where.customerId = filters.customerId;
  }
  if (filters.status) where.status = filters.status;

  const [items, total] = await Promise.all([
    db.invoice.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.invoice.count({ where }),
  ]);
  return buildPage(items, total, page, pageSize);
}
