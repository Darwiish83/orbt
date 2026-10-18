import type { Prisma, PrismaClient, Transfer } from "@prisma/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { buildPage, normalizePage, type Page, type PageParams } from "@/lib/pagination";
import { logAudit } from "@/modules/audit/log";
import { allowedCountries, requirePermission, requireScope, type AuthzUser } from "@/modules/authz/core";
import { dec, gt, round2 } from "@/modules/finance/money";

/**
 * Inter-country transfer send/receive workflow (ADR-011).
 * Capability = `transfer:write` permission + the acting employee's transferRole
 * (SEND to create/send, RECEIVE to receive); super admins bypass. Country scope
 * is enforced from the acting user's role scopes.
 */

type Capability = "SEND" | "RECEIVE" | "ALL" | "NONE";

async function transferCapability(db: PrismaClient, actor: AuthzUser): Promise<Capability> {
  if (actor.isSuperAdmin) return "ALL";
  if (!actor.employeeId) return "NONE";
  const employee = await db.employee.findUnique({ where: { id: actor.employeeId } });
  const role = employee?.transferRole ?? "NONE";
  return role === "SEND" ? "SEND" : role === "RECEIVE" ? "RECEIVE" : "NONE";
}

function can(cap: Capability, need: "SEND" | "RECEIVE"): boolean {
  return cap === "ALL" || cap === need;
}

async function nextReference(db: PrismaClient, year: number): Promise<string> {
  const prefix = `TR-${year}-`;
  const count = await db.transfer.count({ where: { reference: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export interface CreateTransferInput {
  amount: number | string;
  currency?: string;
  fromCountry: string;
  toCountry: string;
  businessYear: number;
  note?: string;
}

export async function createTransfer(db: PrismaClient, actor: AuthzUser, input: CreateTransferInput): Promise<Transfer> {
  requirePermission(actor, "transfer:write");
  const cap = await transferCapability(db, actor);
  if (!can(cap, "SEND")) throw new AuthorizationError("You are not a sending agent");
  requireScope(actor, { country: input.fromCountry, businessYear: input.businessYear });

  const amount = round2(dec(input.amount));
  if (!gt(amount, 0)) throw new ValidationError("Transfer amount must be positive");

  const reference = await nextReference(db, input.businessYear);
  const transfer = await db.transfer.create({
    data: {
      reference,
      amount,
      currency: input.currency ?? "USD",
      fromCountry: input.fromCountry,
      toCountry: input.toCountry,
      businessYear: input.businessYear,
      note: input.note,
      status: "PENDING",
      createdByUserId: actor.id,
    },
  });
  await logAudit(db, {
    actorUserId: actor.id,
    action: "transfer.create",
    entityType: "Transfer",
    entityId: transfer.id,
    metadata: { reference, amount: amount.toString(), from: input.fromCountry, to: input.toCountry },
  });
  return transfer;
}

export async function sendTransfer(db: PrismaClient, actor: AuthzUser, id: string): Promise<Transfer> {
  requirePermission(actor, "transfer:write");
  const cap = await transferCapability(db, actor);
  if (!can(cap, "SEND")) throw new AuthorizationError("You are not a sending agent");
  const transfer = await db.transfer.findUniqueOrThrow({ where: { id } });
  requireScope(actor, { country: transfer.fromCountry, businessYear: transfer.businessYear });
  if (transfer.status !== "PENDING") throw new ValidationError("Only a pending transfer can be sent");

  const updated = await db.transfer.update({
    where: { id },
    data: { status: "SENT", sentByUserId: actor.id, sentAt: new Date() },
  });
  await logAudit(db, { actorUserId: actor.id, action: "transfer.send", entityType: "Transfer", entityId: id });
  return updated;
}

export async function receiveTransfer(db: PrismaClient, actor: AuthzUser, id: string): Promise<Transfer> {
  requirePermission(actor, "transfer:write");
  const cap = await transferCapability(db, actor);
  if (!can(cap, "RECEIVE")) throw new AuthorizationError("You are not a receiving agent");
  const transfer = await db.transfer.findUniqueOrThrow({ where: { id } });
  requireScope(actor, { country: transfer.toCountry, businessYear: transfer.businessYear });
  if (transfer.status !== "SENT") throw new ValidationError("Only a sent transfer can be received");

  const updated = await db.transfer.update({
    where: { id },
    data: { status: "RECEIVED", receivedByUserId: actor.id, receivedAt: new Date() },
  });
  await logAudit(db, { actorUserId: actor.id, action: "transfer.receive", entityType: "Transfer", entityId: id });
  return updated;
}

export async function listTransfers(
  db: PrismaClient,
  actor: AuthzUser,
  filters: PageParams & { status?: Transfer["status"] } = {},
): Promise<Page<Transfer>> {
  requirePermission(actor, "transfer:read");
  const { page, pageSize, skip, take } = normalizePage(filters);
  const where: Prisma.TransferWhereInput = {};
  const countries = allowedCountries(actor);
  if (countries !== null) {
    where.OR = [{ fromCountry: { in: countries } }, { toCountry: { in: countries } }];
  }
  if (filters.status) where.status = filters.status;

  const [items, total] = await Promise.all([
    db.transfer.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    db.transfer.count({ where }),
  ]);
  return buildPage(items, total, page, pageSize);
}
