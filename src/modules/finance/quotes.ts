import type { Invoice, Prisma, PrismaClient, Quote, QuoteStatus } from "@prisma/client";
import { ValidationError } from "@/lib/errors";
import { buildPage, normalizePage, type Page, type PageParams } from "@/lib/pagination";
import { logAudit } from "@/modules/audit/log";
import {
  assertCustomerAccess,
  isCustomerPrincipal,
  requirePermission,
  type AuthzUser,
} from "@/modules/authz/core";
import { createInvoice, type ChargeLineInput } from "./invoices";
import { dec, lineAmount, round2, sum } from "./money";

export interface CreateQuoteInput {
  customerId: string;
  shipmentId?: string;
  currency?: string;
  businessYear?: number;
  expiresAt?: Date;
  lines: ChargeLineInput[];
}

const ALLOWED_QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["ACCEPTED", "EXPIRED", "CANCELLED"],
  ACCEPTED: [],
  EXPIRED: [],
  CANCELLED: [],
};

export async function createQuote(
  db: PrismaClient,
  actor: AuthzUser,
  input: CreateQuoteInput,
): Promise<Quote> {
  requirePermission(actor, "quotes:write");
  if (input.lines.length === 0) throw new ValidationError("A quote needs at least one line");

  const currency = input.currency ?? "USD";
  const lineData = input.lines.map((l) => ({
    parentType: "QUOTE" as const,
    category: l.category,
    description: l.description,
    quantity: dec(l.quantity),
    unitPrice: dec(l.unitPrice),
    amount: lineAmount(l.quantity, l.unitPrice),
    currency,
  }));
  const total = round2(sum(lineData.map((l) => l.amount)));

  const quote = await db.quote.create({
    data: {
      customerId: input.customerId,
      shipmentId: input.shipmentId,
      currency,
      businessYear: input.businessYear,
      expiresAt: input.expiresAt,
      total,
      status: "DRAFT",
      createdByUserId: actor.id,
      lines: { create: lineData },
    },
  });
  await logAudit(db, {
    actorUserId: actor.id,
    action: "quote.create",
    entityType: "Quote",
    entityId: quote.id,
    metadata: { total: total.toString(), currency },
  });
  return quote;
}

export async function setQuoteStatus(
  db: PrismaClient,
  actor: AuthzUser,
  quoteId: string,
  toStatus: QuoteStatus,
): Promise<Quote> {
  requirePermission(actor, "quotes:write");
  const quote = await db.quote.findUniqueOrThrow({ where: { id: quoteId } });
  if (!ALLOWED_QUOTE_TRANSITIONS[quote.status].includes(toStatus)) {
    throw new ValidationError(`Illegal quote transition: ${quote.status} → ${toStatus}`);
  }
  return db.quote.update({ where: { id: quoteId }, data: { status: toStatus } });
}

export async function getQuote(db: PrismaClient, actor: AuthzUser, quoteId: string) {
  const quote = await db.quote.findUnique({ where: { id: quoteId }, include: { lines: true } });
  if (!quote) return null;
  assertCustomerAccess(actor, quote.customerId, "quotes:read");
  return quote;
}

export interface ListQuotesFilters extends PageParams {
  status?: QuoteStatus;
}

export async function listQuotes(
  db: PrismaClient,
  actor: AuthzUser,
  filters: ListQuotesFilters = {},
): Promise<Page<Quote>> {
  const { page, pageSize, skip, take } = normalizePage(filters);
  const where: Prisma.QuoteWhereInput = {};
  if (isCustomerPrincipal(actor)) {
    where.customerId = actor.customerId ?? "__none__";
  } else {
    requirePermission(actor, "quotes:read");
  }
  if (filters.status) where.status = filters.status;

  const [items, total] = await Promise.all([
    db.quote.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.quote.count({ where }),
  ]);
  return buildPage(items, total, page, pageSize);
}

/** Convert an accepted quote's lines into a new invoice. */
export async function convertQuoteToInvoice(
  db: PrismaClient,
  actor: AuthzUser,
  quoteId: string,
): Promise<Invoice> {
  requirePermission(actor, "invoices:write");
  const quote = await db.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { lines: true } });
  if (quote.status !== "ACCEPTED") {
    throw new ValidationError("Only an accepted quote can be converted to an invoice");
  }
  return createInvoice(db, actor, {
    customerId: quote.customerId,
    shipmentId: quote.shipmentId ?? undefined,
    currency: quote.currency,
    businessYear: quote.businessYear ?? undefined,
    lines: quote.lines.map((l) => ({
      category: l.category,
      description: l.description ?? undefined,
      quantity: l.quantity.toString(),
      unitPrice: l.unitPrice.toString(),
    })),
  });
}
