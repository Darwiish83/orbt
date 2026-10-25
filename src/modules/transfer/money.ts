import type { Prisma, PrismaClient, TransferKind, TransferSendStatus, TransferTag } from "@prisma/client";
import { assertYearOpen } from "@/modules/accounting/periods";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import { can, requirePermission, type AuthzUser } from "@/modules/authz/core";
import { dec, round2, sum } from "@/modules/finance/money";

/**
 * Money Transfer (spec B11 / revised prompt §12): the Money Status Report.
 * The Receiver records money received (fee % deducted automatically) and hands
 * it to the Sender (orange → green). Only then can the Sender record that the
 * money reached its owner; the fee is read from the Receiver's row. A Sender
 * works only in their assigned countries (Turkey by default); a super admin
 * sees both sides and every country.
 */

const CURRENCIES = ["USD", "EUR", "TRY"] as const;
const s2 = (v: Prisma.Decimal) => round2(v).toString();

export type TransferRoleView = "SUPER" | "RECEIVER" | "SENDER";

/** What this user may do and in which countries. */
export async function transferAccess(db: PrismaClient, actor: AuthzUser) {
  requirePermission(actor, "transfer:read");
  if (actor.isSuperAdmin) {
    const all = await db.country.findMany({ where: { active: true, isOrigin: true }, orderBy: { createdAt: "asc" } });
    return { role: "SUPER" as TransferRoleView, countries: all.map((c) => c.name), canReceive: true, canSend: true };
  }
  const emp = actor.employeeId ? await db.employee.findUnique({ where: { id: actor.employeeId } }) : null;
  const countries = emp?.transferCountries.length ? emp.transferCountries : ["Turkey"];
  return {
    role: (can(actor, "transfer:receive") ? "RECEIVER" : "SENDER") as TransferRoleView,
    countries,
    canReceive: can(actor, "transfer:receive"),
    canSend: can(actor, "transfer:send"),
  };
}

async function inCountry(db: PrismaClient, actor: AuthzUser, country: string) {
  const a = await transferAccess(db, actor);
  if (!a.countries.includes(country)) throw new AuthorizationError("Outside your Money Transfer countries");
  return a;
}

const fee = (amount: Prisma.Decimal, pct: Prisma.Decimal) => round2(amount.mul(pct).div(100));

export interface ReportRow {
  id: string;
  receivedAt: string;
  amount: string; // total received
  feePct: string;
  fee: string;
  net: string; // amount − fee: to send
  currency: string;
  description: string;
  tag: TransferTag | null;
  handed: boolean;
  /** The live Receipt Voucher made for this row, if any. */
  receipt: { id: string; number: number } | null;
  sent: null | { sentAt: string; amount: string; fee: string; delivered: string; currency: string; status: TransferSendStatus };
}

/** One month of the Money Status Report, with totals and the open months. */
export async function monthReport(db: PrismaClient, actor: AuthzUser, input: { country: string; year: number; kind: TransferKind; month?: number }, now = new Date()) {
  const access = await inCountry(db, actor, input.country);
  const [rows, opened] = await Promise.all([
    db.moneyTransferRow.findMany({
      where: { country: input.country, year: input.year, kind: input.kind, deletedAt: null },
      include: { receipts: { where: { voidedAt: null }, select: { id: true, number: true } } },
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
    }),
    db.transferMonth.findMany({ where: { country: input.country, year: input.year } }),
  ]);
  // Months shown: up to the current month (whole year for past years), plus any opened or used.
  const cap = input.year < now.getUTCFullYear() ? 12 : input.year === now.getUTCFullYear() ? now.getUTCMonth() + 1 : 0;
  const top = Math.max(cap, 1, ...opened.map((m) => m.month), ...rows.map((r) => r.month));
  const months = Array.from({ length: top }, (_, i) => top - i).map((m) => ({ month: m, count: rows.filter((r) => r.month === m).length }));
  const month = input.month && input.month >= 1 && input.month <= top ? input.month : top;
  const R: ReportRow[] = rows
    .filter((r) => r.month === month)
    .map((r) => {
      const f = fee(r.amount, r.feePct);
      return {
        id: r.id,
        receivedAt: r.receivedAt.toISOString().slice(0, 10),
        amount: s2(r.amount),
        feePct: r.feePct.toString(),
        fee: s2(f),
        net: s2(r.amount.minus(f)),
        currency: r.currency,
        description: r.description,
        tag: r.tag,
        handed: !!r.handedAt,
        receipt: r.receipts[0] ?? null,
        sent:
          r.sentAmount && r.sentAt && r.sentStatus
            ? { sentAt: r.sentAt.toISOString().slice(0, 10), amount: s2(r.sentAmount), fee: s2(f), delivered: s2(r.sentAmount.minus(f)), currency: r.sentCurrency ?? r.currency, status: r.sentStatus }
            : null,
      };
    });
  const add = (xs: string[]) => s2(sum(xs.map((x) => dec(x))));
  return {
    access,
    month,
    months,
    rows: R,
    totals: {
      received: add(R.map((r) => r.net)),
      fees: add(R.map((r) => r.fee)),
      sent: add(R.filter((r) => r.sent).map((r) => r.sent!.delivered)),
      notSent: add(R.filter((r) => !r.sent).map((r) => r.net)),
    },
  };
}

function money(v: string, label: string) {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(v.trim())) throw new ValidationError(`Enter the ${label}`);
  const d = round2(dec(v.trim()));
  if (!d.greaterThan(0)) throw new ValidationError(`Enter the ${label}`);
  return d;
}

export interface ReceiveInput {
  country: string;
  year: number;
  kind: TransferKind;
  receivedAt: string; // YYYY-MM-DD
  amount: string;
  feePct?: string;
  currency: string;
  description: string;
  tag?: TransferTag | null;
}

function checkReceive(input: ReceiveInput) {
  const amount = money(input.amount, "amount");
  const feePct = input.feePct?.trim() ? dec(input.feePct.trim()) : dec(0);
  if (feePct.isNegative() || feePct.greaterThanOrEqualTo(100)) throw new ValidationError("The transfer fee must be under 100%");
  if (!CURRENCIES.includes(input.currency as (typeof CURRENCIES)[number])) throw new ValidationError("Choose the currency");
  const description = input.description.trim().toUpperCase().slice(0, 160);
  if (!description) throw new ValidationError("Fill all required fields");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.receivedAt)) throw new ValidationError("Enter a valid date");
  const date = new Date(`${input.receivedAt}T00:00:00Z`);
  if (date.getUTCFullYear() !== input.year) throw new ValidationError("The date must be in the selected year");
  return { amount, feePct, description, date, month: date.getUTCMonth() + 1, tag: input.kind === "CUSTOMER" ? (input.tag ?? "OTHER") : null };
}

/** Receiver: + Add Money Receive. */
export async function addReceive(db: PrismaClient, actor: AuthzUser, input: ReceiveInput) {
  requirePermission(actor, "transfer:receive");
  await inCountry(db, actor, input.country);
  await assertYearOpen(db, input.country, input.year);
  const v = checkReceive(input);
  const row = await db.moneyTransferRow.create({
    data: { country: input.country, year: input.year, month: v.month, kind: input.kind, receivedAt: v.date, amount: v.amount, feePct: v.feePct, currency: input.currency, description: v.description, tag: v.tag, receiverUserId: actor.id },
  });
  await logAudit(db, { actorUserId: actor.id, action: "transfer.receive", entityType: "MoneyTransferRow", entityId: row.id, metadata: { amount: v.amount.toString(), currency: input.currency } });
  return row;
}

async function loadRow(db: PrismaClient, actor: AuthzUser, id: string) {
  const row = await db.moneyTransferRow.findUnique({ where: { id } });
  if (!row || row.deletedAt) throw new ValidationError("Not found");
  await inCountry(db, actor, row.country);
  // Money received counts in the year's balance: a closed year is locked.
  await assertYearOpen(db, row.country, row.year);
  return row;
}

/** Receiver: edit the left side (click the name). Locked once the Sender recorded it. */
export async function editReceive(db: PrismaClient, actor: AuthzUser, id: string, input: ReceiveInput) {
  requirePermission(actor, "transfer:receive");
  const row = await loadRow(db, actor, id);
  if (row.sentAmount) throw new ValidationError("The Sender already recorded this transfer");
  const v = checkReceive({ ...input, country: row.country, year: row.year, kind: row.kind });
  await db.moneyTransferRow.update({ where: { id }, data: { receivedAt: v.date, month: v.month, amount: v.amount, feePct: v.feePct, currency: input.currency, description: v.description, tag: v.tag } });
  await logAudit(db, { actorUserId: actor.id, action: "transfer.receive_edit", entityType: "MoneyTransferRow", entityId: id });
}

/** Receiver only: orange (received) ↔ green (handed to the Sender). */
export async function setHanded(db: PrismaClient, actor: AuthzUser, id: string, handed: boolean) {
  requirePermission(actor, "transfer:receive");
  const row = await loadRow(db, actor, id);
  if (!handed && row.sentAmount) throw new ValidationError("The Sender already recorded this transfer");
  await db.moneyTransferRow.update({ where: { id }, data: { handedAt: handed ? (row.handedAt ?? new Date()) : null } });
  await logAudit(db, { actorUserId: actor.id, action: handed ? "transfer.handed" : "transfer.unhanded", entityType: "MoneyTransferRow", entityId: id });
}

/** Sender: record that the money reached its owner (only on a green row). */
export async function recordSend(db: PrismaClient, actor: AuthzUser, id: string, input: { sentAt: string; amount: string; currency: string; status: TransferSendStatus }) {
  requirePermission(actor, "transfer:send");
  const row = await loadRow(db, actor, id);
  if (!row.handedAt) throw new ValidationError("The Receiver has not handed this money over yet");
  const amount = money(input.amount, "amount");
  if (!CURRENCIES.includes(input.currency as (typeof CURRENCIES)[number])) throw new ValidationError("Choose the currency");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sentAt)) throw new ValidationError("Enter a valid date");
  if (!["PAID", "PENDING"].includes(input.status)) throw new ValidationError("Choose the status");
  await db.moneyTransferRow.update({ where: { id }, data: { sentAt: new Date(`${input.sentAt}T00:00:00Z`), sentAmount: amount, sentCurrency: input.currency, sentStatus: input.status, senderUserId: actor.id } });
  await logAudit(db, { actorUserId: actor.id, action: "transfer.send", entityType: "MoneyTransferRow", entityId: id, metadata: { amount: amount.toString(), status: input.status } });
}

/** Delete the Sender side only (Money Receive stays). */
export async function deleteSend(db: PrismaClient, actor: AuthzUser, id: string) {
  requirePermission(actor, "transfer:send");
  await loadRow(db, actor, id);
  await db.moneyTransferRow.update({ where: { id }, data: { sentAt: null, sentAmount: null, sentCurrency: null, sentStatus: null, senderUserId: null } });
  await logAudit(db, { actorUserId: actor.id, action: "transfer.send_delete", entityType: "MoneyTransferRow", entityId: id });
}

/** Delete a Money Receive row (soft). A row the Sender already recorded must
 * have its transfer side removed first. */
export async function deleteReceive(db: PrismaClient, actor: AuthzUser, id: string) {
  requirePermission(actor, "transfer:receive");
  const row = await loadRow(db, actor, id);
  if (row.sentAmount) throw new ValidationError("Delete the transfer side first");
  if (await db.transferReceipt.count({ where: { transferRowId: id, voidedAt: null } })) throw new ValidationError("Void its receipt first");
  await db.moneyTransferRow.update({ where: { id }, data: { deletedAt: new Date() } });
  await logAudit(db, { actorUserId: actor.id, action: "transfer.receive_delete", entityType: "MoneyTransferRow", entityId: id });
}

/** Start new month (Receiver or super admin): opens the next month after the last one. */
export async function startNewMonth(db: PrismaClient, actor: AuthzUser, input: { country: string; year: number }, now = new Date()) {
  const a = await inCountry(db, actor, input.country);
  if (!a.canReceive) throw new AuthorizationError("Only the Receiver starts a new month");
  const r = await monthReport(db, actor, { ...input, kind: "CUSTOMER" }, now);
  const last = r.months[0]?.month ?? 1;
  if (last >= 12) throw new ValidationError("Year is complete. Create a new year in Settings");
  await db.transferMonth.upsert({
    where: { country_year_month: { country: input.country, year: input.year, month: last + 1 } },
    create: { country: input.country, year: input.year, month: last + 1, actorUserId: actor.id },
    update: {},
  });
  await logAudit(db, { actorUserId: actor.id, action: "transfer.month", entityType: "TransferMonth", metadata: { ...input, month: last + 1 } });
  return last + 1;
}

/**
 * Money received through Customer transfers (USD) for a country and year: it
 * counts in Accounting → Income and the balance (spec §12). Operation-cost
 * rows are a record only. Other currencies can't be added to a USD balance and
 * are left out (listed on the report).
 */
export async function transferIncomeOf(db: PrismaClient | Prisma.TransactionClient, country: string, year: number): Promise<Prisma.Decimal> {
  const rows = await db.moneyTransferRow.findMany({ where: { country, year, kind: "CUSTOMER", currency: "USD", deletedAt: null }, select: { amount: true } });
  return sum(rows.map((r) => r.amount));
}
