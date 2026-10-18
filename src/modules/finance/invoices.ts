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
import { dec, lineAmount, round2, sum } from "./money";

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

  const total = round2(sum(invoice.lines.map((l) => l.amount)));
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
  const total = round2(sum(lineData.map((l) => l.amount)));

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
            status: "UNPAID",
            createdByUserId: actor.id,
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
