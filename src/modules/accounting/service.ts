import type { CostStage, OpeningSource, OutCategory, Partner, Prisma, PrismaClient, ReceiptKind, ClosePeriod } from "@prisma/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import { displayShipmentCode } from "@/modules/authz/adminScope";
import { requirePermission, requireScope, type AuthzUser } from "@/modules/authz/core";
import { lineMeasure } from "@/modules/finance/charges";
import { dec, round2, sum } from "@/modules/finance/money";
import { issueReceipt } from "@/modules/finance/receipts";
import {
  airMgqSchema,
  airOriginSchema,
  computeCost,
  DEFAULT_SPLITS,
  seaMgqSchema,
  seaOriginSchema,
  splitFor,

  type Split,
} from "./calc";
import { assertOpenFor, isClosed, isYearClosed, SYSTEM_START_YEAR } from "./periods";
import { requireAccountingAccess } from "./pin";
import { transferIncomeOf } from "@/modules/transfer/money";

export { assertOpen, isClosed, isYearClosed } from "./periods";

/**
 * Accounting (spec B10 / revised prompt §11), per country + business year.
 * Read models are derived from invoices, payments, cost sheets and outs; all
 * money moves through CashOut / DebtReturn with a receipt, and nothing in a
 * closed period can change.
 */

type Db = PrismaClient | Prisma.TransactionClient;
export type Scope = { country: string; year: number };
const D0 = () => dec(0);
const s2 = (v: Prisma.Decimal) => round2(v).toString();

function scoped(actor: AuthzUser, scope: Scope) {
  requireAccountingAccess(actor);
  requireScope(actor, { country: scope.country, businessYear: scope.year });
}

// ------------------------------------------------------------------ settings & periods

export async function getSplits(db: Db): Promise<Record<string, { AIR: Split; SEA: Split }>> {
  const row = await db.appSetting.findUnique({ where: { key: "profitSplit" } });
  return (row?.value as Record<string, { AIR: Split; SEA: Split }> | undefined) ?? DEFAULT_SPLITS;
}


function periodRange(year: number, p: ClosePeriod) {
  if (p === "H1") return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year, 5, 30, 23, 59, 59, 999)) };
  if (p === "H2") return { from: new Date(Date.UTC(year, 6, 1)), to: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)) };
  return { from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)) };
}

// ------------------------------------------------------------------ shipment costs

async function shipmentFacts(db: Db, scope: Scope, filters: { mode?: "AIR" | "SEA"; shipmentId?: string } = {}) {
  const shipments = await db.shipment.findMany({
    where: { originCountry: scope.country, businessYear: scope.year, mode: filters.mode ? filters.mode : { in: ["AIR", "SEA"] }, ...(filters.shipmentId ? { id: filters.shipmentId } : {}) },
    include: {
      lines: true,
      costSheet: true,
      airDetail: true,
      seaDetail: true,
      invoices: { where: { status: { not: "VOID" } }, include: { allocations: { include: { payment: { select: { reversedAt: true } } } } } },
      cashOuts: { where: { reversedAt: null, category: "SHIPMENT_COST" } },
    },
    orderBy: { createdAt: "asc" },
    take: 1000,
  });
  const splits = await getSplits(db);
  const seq = (code: string) => parseInt(displayShipmentCode(code).replace(/^\D+-/, ""), 10) || 0;
  return shipments
    .sort((a, b) => (a.mode === b.mode ? seq(a.code) - seq(b.code) : a.mode === "AIR" ? -1 : 1))
    .map((sh) => {
      const mode = sh.mode as "AIR" | "SEA";
      const collected = sum(sh.invoices.flatMap((i) => i.allocations.filter((a) => !a.payment.reversedAt).map((a) => a.amount)));
      const commission = sum(sh.invoices.map((i) => i.commissionAmount));
      const origin = (mode === "AIR" ? airOriginSchema : seaOriginSchema).safeParse(sh.costSheet?.origin ?? {});
      const mgq = (mode === "AIR" ? airMgqSchema : seaMgqSchema).safeParse(sh.costSheet?.mgq ?? {});
      const row = computeCost(
        {
          mode,
          quantity: sum(sh.lines.map((l) => lineMeasure(mode, l))),
          localDelivery: sum(sh.lines.map((l) => l.delivery ?? D0())),
          invoiceCharge: sum(sh.lines.map((l) => l.fatura ?? D0())),
          collected,
          commission,
        },
        origin.success ? origin.data : {},
        mgq.success ? mgq.data : {},
        splitFor(splits, sh.originCountry, mode),
      );
      const paid = (st: CostStage) => sum(sh.cashOuts.filter((o) => o.stage === st).map((o) => o.amount));
      return {
        id: sh.id,
        code: displayShipmentCode(sh.code),
        mode,
        shipDate: (sh.shipDate ?? sh.createdAt).toISOString(),
        arrivalDate: (sh.arrivedAt ?? sh.arrivalDate)?.toISOString() ?? null,
        awb: sh.airDetail?.awbNumber ?? null,
        billOfLading: sh.seaDetail?.blNumber ?? null,
        container: sh.seaDetail?.containerRefs[0] ?? null,
        originInputs: (sh.costSheet?.origin ?? {}) as Record<string, string>,
        mgqInputs: (sh.costSheet?.mgq ?? {}) as Record<string, string>,
        row,
        paid: { ORIGIN: s2(paid("ORIGIN")), TRANSIT: s2(paid("TRANSIT")), ARRIVED: s2(paid("ARRIVED")) },
        commissionEarned: s2(sum(sh.invoices.filter((i) => i.status === "PAID").map((i) => i.commissionAmount))),
      };
    });
}

export type CostShipment = Awaited<ReturnType<typeof shipmentFacts>>[number];

/** Shipment cost payment + the cost sheets + cost & profit, one row per shipment. */
export async function listShipmentCosts(db: PrismaClient, actor: AuthzUser, scope: Scope, mode?: "AIR" | "SEA") {
  scoped(actor, scope);
  const rows = await shipmentFacts(db, scope, { mode });
  const total = (pick: (r: CostShipment) => string) => s2(sum(rows.map((r) => dec(pick(r)))));
  const due = (r: CostShipment) => dec(r.row.stages.ORIGIN).add(r.row.stages.TRANSIT).add(r.row.stages.ARRIVED);
  const paid = (r: CostShipment) => dec(r.paid.ORIGIN).add(r.paid.TRANSIT).add(r.paid.ARRIVED);
  return {
    rows,
    summary: {
      cost: s2(sum(rows.map(due))),
      paid: s2(sum(rows.map(paid))),
      remaining: s2(sum(rows.map((r) => due(r).minus(paid(r)).greaterThan(0) ? due(r).minus(paid(r)) : D0()))),
      totalCost: total((r) => r.row.totalCost),
      totalIncome: total((r) => r.row.totalIncome),
      profit: total((r) => r.row.profit),
      orbit: total((r) => r.row.orbit),
      somaliTransport: total((r) => r.row.somaliTransport),
      mahad: total((r) => r.row.mahad),
    },
  };
}

/**
 * Save a cost sheet: origin (origin-country staff) or MGQ (Somalia staff).
 * `values` is merged into the stored sheet, so the spreadsheet can save one
 * cell at a time; an empty string clears that field.
 */
export async function saveCostSheet(db: PrismaClient, actor: AuthzUser, shipmentId: string, sheet: "origin" | "mgq", values: Record<string, unknown>) {
  requireAccountingAccess(actor);
  requirePermission(actor, sheet === "origin" ? "costorigin:write" : "costmgq:write");
  const sh = await db.shipment.findUnique({ where: { id: shipmentId }, include: { costSheet: true } });
  if (!sh) throw new ValidationError("Shipment not found");
  requireScope(actor, { country: sh.originCountry, businessYear: sh.businessYear });
  await assertOpenFor(db, sh.originCountry, { year: sh.businessYear, date: sh.shipDate ?? sh.createdAt });
  const schema = sh.mode === "AIR" ? (sheet === "origin" ? airOriginSchema : airMgqSchema) : sheet === "origin" ? seaOriginSchema : seaMgqSchema;
  const stored = (sh.costSheet?.[sheet] ?? {}) as Record<string, unknown>;
  const parsed = schema.safeParse({ ...stored, ...values });
  if (!parsed.success) throw new ValidationError("Check the highlighted fields.");
  const clean = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined && v !== ""));
  await db.shipmentCostSheet.upsert({
    where: { shipmentId },
    create: { shipmentId, [sheet]: clean, [`${sheet}UpdatedBy`]: actor.id },
    update: { [sheet]: clean, [`${sheet}UpdatedBy`]: actor.id },
  });
  await logAudit(db, { actorUserId: actor.id, action: `cost.${sheet}`, entityType: "Shipment", entityId: shipmentId, metadata: clean });
}

// ------------------------------------------------------------------ balances

async function moneyFacts(db: Db, scope: Scope) {
  const [shipments, outs, returns, legacy, entries] = await Promise.all([
    shipmentFacts(db, scope),
    db.cashOut.findMany({ where: { country: scope.country, year: scope.year, reversedAt: null }, include: { bank: true, receipt: true, shipment: true, commissions: true, returns: true }, orderBy: { paidAt: "desc" } }),
    db.debtReturn.findMany({
      where: { OR: [{ cashOut: { country: scope.country, year: scope.year, reversedAt: null } }, { openingEntry: { country: scope.country, year: scope.year, reversedAt: null } }] },
      include: { bank: true, receipt: true, cashOut: true, openingEntry: true },
      orderBy: { returnedAt: "desc" },
    }),
    db.openingBalance.findUnique({ where: { country_year: { country: scope.country, year: scope.year } } }),
    db.openingEntry.findMany({ where: { country: scope.country, year: scope.year, reversedAt: null }, orderBy: [{ fromYear: "asc" }, { createdAt: "asc" }] }),
  ]);
  const payments = await db.paymentAllocation.findMany({
    where: { payment: { reversedAt: null }, invoice: { status: { not: "VOID" }, shipment: { originCountry: scope.country, businessYear: scope.year } } },
    include: { payment: { include: { bank: true, receipt: true, customer: { select: { name: true, ref: true } } } }, invoice: { include: { shipment: true } } },
    orderBy: { payment: { receivedAt: "desc" } },
  });
  // Opening balance = a legacy carried total + each earlier year's TOTAL. Its
  // BANK lines say where it is, its SOURCE lines what it is. Debts owed to us
  // are not money we hold until they are returned.
  const opening = (legacy?.amount ?? D0()).add(sum(entries.filter((e) => e.kind === "TOTAL").map((e) => e.amount)));
  return {
    shipments,
    outs,
    returns,
    payments,
    opening,
    legacyOpening: legacy?.amount ?? D0(),
    openingBanks: entries.filter((e) => e.kind === "BANK"),
    openingSources: entries.filter((e) => e.kind === "SOURCE"),
  };
}

/** Which "What this balance is made of" row an opening line belongs to. */
const OPENING_ROW: Record<Exclude<OpeningSource, "DEBT">, string> = {
  TRANSFER: "transfer",
  COMMISSION: "commission",
  SHIPMENT_COST: "cost",
  SOMALI_TRANSPORT: "som",
  MAHAD: "mah",
  PROFIT: "orbit",
  OTHER: "orbit",
};
function openingFor(f: { openingSources: { source: OpeningSource | null; amount: Prisma.Decimal }[] }, row: string) {
  return sum(f.openingSources.filter((e) => e.source && OPENING_ROW[e.source as Exclude<OpeningSource, "DEBT">] === row).map((e) => e.amount));
}

function outsBy(outs: { category: OutCategory; amount: Prisma.Decimal; partner: Partner | null }[], c: OutCategory, partner?: Partner) {
  return sum(outs.filter((o) => o.category === c && (!partner || o.partner === partner)).map((o) => o.amount));
}

/** Partners' realised shares: earned only once the shipment's cost is covered. */
function partnerShares(shipments: CostShipment[]) {
  let som = D0(), mah = D0(), orb = D0();
  for (const s of shipments) {
    const r = s.row;
    const got = dec(r.collected).minus(dec(s.commissionEarned));
    const cost = dec(r.totalCost);
    const total = dec(r.orbit).add(dec(r.somaliTransport)).add(dec(r.mahad));
    if (!total.greaterThan(0)) continue;
    const real = got.minus(cost).greaterThan(0) ? got.minus(cost) : D0();
    const ratio = real.greaterThanOrEqualTo(total) ? dec(1) : real.div(total);
    const pos = (v: string) => (dec(v).greaterThan(0) ? dec(v) : D0());
    som = som.add(pos(r.somaliTransport).mul(ratio));
    mah = mah.add(pos(r.mahad).mul(ratio));
    orb = orb.add(pos(r.orbit).mul(ratio));
  }
  return { som: round2(som), mah: round2(mah), orb: round2(orb) };
}

/** Income & Out (spec §11): balance, per bank, income, outs, and what the balance is made of. */
export async function incomeAndOut(db: PrismaClient, actor: AuthzUser, scope: Scope, filter?: OutCategory) {
  scoped(actor, scope);
  const f = await moneyFacts(db, scope);
  const gross = sum(f.payments.map((p) => p.amount));
  const commissionIn = sum(f.shipments.map((s) => dec(s.commissionEarned)));
  const debtIn = sum(f.returns.map((r) => r.amount));
  const moneyReceive = await transferIncome(db, scope);
  const outTotal = sum(f.outs.map((o) => o.amount));
  const balance = round2(f.opening.add(gross).add(debtIn).add(moneyReceive).minus(outTotal));

  // Per bank: what the records say, next to the admin's latest count.
  const banks = await db.bank.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  const counts = await db.cashCount.findMany({ where: { country: scope.country }, orderBy: { countedAt: "desc" } });
  const perBank = banks.map((b) => {
    const openB = sum(f.openingBanks.filter((e) => e.bankId === b.id).map((e) => e.amount));
    const inB = sum(f.payments.filter((p) => p.payment.bankId === b.id).map((p) => p.amount)).add(sum(f.returns.filter((r) => r.bankId === b.id).map((r) => r.amount)));
    const outB = sum(f.outs.filter((o) => o.bankId === b.id).map((o) => o.amount));
    const last = counts.find((c) => c.bankId === b.id);
    return { bankId: b.id, bank: b.name, opening: s2(openB), in: s2(inB), out: s2(outB), recorded: s2(openB.add(inB).minus(outB)), counted: last ? s2(last.amount) : null, countedAt: last?.countedAt.toISOString() ?? null };
  });
  // Money the records don't place in a bank: carried lines without a bank,
  // Money Receive (transfers) and anything in an inactive bank.
  const unbankedNow = balance.minus(sum(perBank.map((b) => dec(b.recorded))));
  const unbankedOpen = f.opening.minus(sum(perBank.map((b) => dec(b.opening))));
  const unbankedOut = outTotal.minus(sum(perBank.map((b) => dec(b.out))));
  const unbanked = unbankedNow.isZero() && unbankedOpen.isZero() ? null : { opening: s2(unbankedOpen), in: s2(unbankedNow.minus(unbankedOpen).add(unbankedOut)), out: s2(unbankedOut), recorded: s2(unbankedNow) };
  const countedTotal = perBank.every((b) => b.counted !== null) ? round2(sum(perBank.map((b) => dec(b.counted!)))) : null;

  // What this balance is made of (rows add up to the balance).
  const costIn = sum(f.shipments.map((s) => {
    const got = dec(s.row.collected).minus(dec(s.commissionEarned));
    const cost = dec(s.row.totalCost);
    return got.lessThan(cost) ? (got.greaterThan(0) ? got : D0()) : cost;
  }));
  const shares = partnerShares(f.shipments);
  const hasSplit = f.shipments.some((s) => s.row.split[1] > 0 || s.row.split[2] > 0) || scope.country === "Turkey" || !openingFor(f, "som").add(openingFor(f, "mah")).isZero();
  // Each row: opening (from earlier years) + came in − went out = remaining.
  const rows: { key: string; label: string; opening: string; in: string; out: string; remaining: string }[] = [];
  const add = (key: string, label: string, i: Prisma.Decimal, o: Prisma.Decimal) => {
    const op = openingFor(f, key);
    rows.push({ key, label, opening: s2(op), in: s2(i), out: s2(o), remaining: s2(op.add(i).minus(o)) });
  };
  // An out paid for an earlier year comes out of that year's balance, which is
  // Orbit profit (owner 2026-10-25); only this year's outs pay this year's parts.
  const cur = f.outs.filter((o) => o.forYear === null);
  const earlierOut = sum(f.outs.filter((o) => o.forYear !== null).map((o) => o.amount));
  add("transfer", "Transfer", moneyReceive, outsBy(cur, "TRANSFER"));
  add("commission", "Commission", commissionIn, outsBy(cur, "COMMISSION"));
  add("cost", "Shipments cost", costIn, outsBy(cur, "SHIPMENT_COST"));
  if (hasSplit) {
    add("som", "Somali Transport profit", shares.som, outsBy(cur, "PROFIT_PAYOUT", "SOMALI_TRANSPORT"));
    add("mah", "Mahad profit", shares.mah, outsBy(cur, "PROFIT_PAYOUT", "MAHAD"));
  }
  const others = sum(rows.map((r) => dec(r.remaining)));
  const orbitOut = outsBy(cur, "EXPENSE").add(outsBy(cur, "DEBT")).add(earlierOut);
  const orbitRemaining = balance.minus(others);
  const orbitOpening = f.legacyOpening.add(openingFor(f, "orbit"));
  rows.push({ key: "orbit", label: "Orbit profit", opening: s2(orbitOpening), in: s2(orbitRemaining.add(orbitOut).minus(orbitOpening)), out: s2(orbitOut), remaining: s2(orbitRemaining) });

  const income = [
    ...f.payments.map((p) => ({
      id: p.id,
      date: p.payment.receivedAt.toISOString(),
      kind: "Shipment collection",
      detail: `${p.payment.customer.ref} — ${p.payment.customer.name} · ${displayShipmentCode(p.invoice.shipment!.code)} · ${p.invoice.number}`,
      // For grouping the Income list per shipment.
      shipment: displayShipmentCode(p.invoice.shipment!.code) as string | null,
      mode: p.invoice.shipment!.mode as string | null,
      bank: p.payment.bank?.name ?? null,
      receiptNo: p.payment.receipt?.number ?? null,
      amount: s2(p.amount),
    })),
    ...(await db.moneyTransferRow.findMany({ where: { country: scope.country, year: scope.year, kind: "CUSTOMER", currency: "USD", deletedAt: null } })).map((r) => ({
      id: r.id,
      date: r.receivedAt.toISOString(),
      kind: "Money Receive",
      detail: r.description,
      shipment: null,
      mode: null,
      bank: null,
      receiptNo: null,
      amount: s2(r.amount),
    })),
    ...f.returns.map((r) => ({
      id: r.id,
      date: r.returnedAt.toISOString(),
      kind: "Debt returned",
      detail: r.cashOut?.sentTo ?? r.openingEntry?.person ?? "-",
      shipment: null,
      mode: null,
      bank: r.bank.name,
      receiptNo: r.receipt.number,
      amount: s2(r.amount),
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const outs = f.outs
    .filter((o) => !filter || o.category === filter)
    .map((o) => ({
      id: o.id,
      date: o.paidAt.toISOString(),
      category: o.category,
      shipment: o.shipment ? displayShipmentCode(o.shipment.code) : null,
      stage: o.stage,
      partner: o.partner,
      forYear: o.forYear,
      reference: o.reference,
      bank: o.bank.name,
      sentTo: o.sentTo,
      sentVia: o.sentVia,
      sentAccount: o.sentAccount,
      note: o.note,
      receiptNo: o.receipt.number,
      amount: s2(o.amount),
    }));

  return {
    balance: s2(balance),
    opening: s2(f.opening),
    totals: { collections: s2(gross), commission: s2(commissionIn), debtReturned: s2(debtIn), moneyReceive: s2(moneyReceive), out: s2(outTotal) },
    perBank,
    unbanked,
    countedTotal: countedTotal?.toString() ?? null,
    countMismatch: countedTotal !== null && !countedTotal.equals(balance),
    composition: rows,
    income,
    outs,
  };
}

/** Money received through Money Transfer (customer transfers, USD) counts in the balance. */
async function transferIncome(db: Db, scope: Scope): Promise<Prisma.Decimal> {
  return transferIncomeOf(db, scope.country, scope.year);
}

/** Balances of every allowed country for the year (+ total). */
export async function countryBalances(db: PrismaClient, actor: AuthzUser, year: number, countries: string[]) {
  const out: { country: string; balance: string; in: string; out: string }[] = [];
  for (const country of countries) {
    try {
      const io = await incomeAndOut(db, actor, { country, year });
      // In = everything the balance is built from (incl. the opening balance).
      out.push({ country, balance: io.balance, in: s2(dec(io.balance).add(dec(io.totals.out))), out: io.totals.out });
    } catch (e) {
      if (!(e instanceof AuthorizationError)) throw e;
    }
  }
  return { rows: out, total: s2(sum(out.map((r) => dec(r.balance)))) };
}

export async function saveCashCount(db: PrismaClient, actor: AuthzUser, scope: Scope, counts: { bankId: string; amount: string }[]) {
  scoped(actor, scope);
  requirePermission(actor, "accounting:write");
  for (const c of counts) if (!/^\d{1,10}(\.\d{1,2})?$/.test(c.amount)) throw new ValidationError("Enter the amounts");
  await db.$transaction(async (tx) => {
    for (const c of counts) await tx.cashCount.create({ data: { country: scope.country, bankId: c.bankId, amount: dec(c.amount), actorUserId: actor.id } });
    await logAudit(tx, { actorUserId: actor.id, action: "accounting.count", entityType: "CashCount", metadata: { country: scope.country, counts } });
  });
}

// ------------------------------------------------------------------ add / reverse out

const RECEIPT_KIND: Record<OutCategory, ReceiptKind> = {
  SHIPMENT_COST: "SHIPMENT_COST",
  EXPENSE: "EXPENSE",
  COMMISSION: "COMMISSION",
  TRANSFER: "TRANSFER",
  DEBT: "DEBT",
  PROFIT_PAYOUT: "OTHER",
};

export interface AddOutInput {
  category: OutCategory;
  amount: string;
  bankId: string;
  paidAt: Date;
  /** Who it went to (name). */
  sentTo?: string;
  /** How it went: a bank, EVC Plus, Zaad, cash … */
  sentVia?: string;
  /** Their account or phone number. */
  sentAccount?: string;
  note?: string;
  shipmentId?: string;
  stage?: CostStage;
  partner?: Partner;
  /** Commission: which invoices' commissions this payment settles. */
  commissions?: { invoiceId: string; amount: string }[];
  /** Paid now for an earlier year (e.g. 2025): comes out of what that year left. */
  forYear?: number;
  /** For an earlier year: the shipment or agent when it is not in the system (e.g. "W-30"). */
  reference?: string;
}

/** Outs that can be paid for an earlier year (they come out of its Orbit profit). */
const EARLIER_OUT: OutCategory[] = ["SHIPMENT_COST", "TRANSFER", "COMMISSION", "EXPENSE"];

/** What an earlier year's balance (Orbit profit) still has after what was paid for it since. */
async function earlierYearLeft(db: Db, scope: Scope, fromYear: number) {
  const [total, outs] = await Promise.all([
    db.openingEntry.findFirst({ where: { country: scope.country, year: scope.year, fromYear, kind: "TOTAL", reversedAt: null } }),
    db.cashOut.findMany({ where: { country: scope.country, year: scope.year, forYear: fromYear, reversedAt: null } }),
  ]);
  return (total?.amount ?? D0()).minus(sum(outs.map((o) => o.amount)));
}

/** + Add Out: every out leaves a numbered OUT receipt. */
export async function addOut(db: PrismaClient, actor: AuthzUser, scope: Scope, input: AddOutInput) {
  scoped(actor, scope);
  requirePermission(actor, "accounting:write");
  const amount = round2(dec(input.amount));
  if (!amount.greaterThan(0)) throw new ValidationError("Enter the amount");
  if (Number.isNaN(input.paidAt.getTime()) || input.paidAt.getTime() > Date.now() + 86_400_000) throw new ValidationError("Enter a valid date");
  await assertOpenFor(db, scope.country, { year: scope.year, date: input.paidAt });
  const bank = await db.bank.findUnique({ where: { id: input.bankId } });
  if (!bank?.active) throw new ValidationError("Choose a bank");
  const sentTo = input.sentTo?.trim().slice(0, 160) || null;
  const sentVia = input.sentVia?.trim().slice(0, 60) || null;
  const sentAccount = input.sentAccount?.trim().slice(0, 60) || null;
  const forYear = input.forYear ?? null;
  const reference = input.reference?.trim().slice(0, 120) || null;

  // Paid now for a year before the system (e.g. 2025 W-30): it must have a
  // typed opening balance, and it comes out of what that year left (its Orbit
  // profit). A system year (2026 on) is finished before it is closed.
  if (forYear !== null) {
    if (!Number.isInteger(forYear) || forYear >= scope.year || forYear >= SYSTEM_START_YEAR) throw new ValidationError("Choose the year it belongs to");
    if (!EARLIER_OUT.includes(input.category)) throw new ValidationError("This kind of out cannot belong to an earlier year");
    const hasYear = await db.openingEntry.findFirst({ where: { country: scope.country, year: scope.year, fromYear: forYear, kind: "TOTAL", carried: false, reversedAt: null } });
    if (!hasYear) throw new ValidationError("That year has no opening balance");
    if (amount.greaterThan(await earlierYearLeft(db, scope, forYear))) throw new ValidationError("More than what is left from that year");
  }

  if (input.category === "SHIPMENT_COST") {
    if (forYear !== null) {
      // An earlier year's shipment is not in the system (e.g. 2025 W-30).
      if (!reference) throw new ValidationError("Enter the shipment, e.g. W-30");
      if (input.shipmentId) throw new ValidationError("Shipment not found");
    } else {
      if (!input.shipmentId || !input.stage) throw new ValidationError("Choose the shipment and the stage");
      const sh = await db.shipment.findUnique({ where: { id: input.shipmentId } });
      if (!sh || sh.originCountry !== scope.country || sh.businessYear !== scope.year) throw new ValidationError("Shipment not found");
      if (input.stage === "TRANSIT" && sh.mode !== "AIR") throw new ValidationError("A container has no transit stage");
    }
  }
  if (input.category === "DEBT" && !sentTo) throw new ValidationError("Enter who took the money");
  if (input.category === "PROFIT_PAYOUT" && forYear === null) {
    if (!input.partner) throw new ValidationError("Choose the partner");
    const io = await incomeAndOut(db, actor, scope);
    const row = io.composition.find((r) => r.key === (input.partner === "MAHAD" ? "mah" : "som"));
    if (!row || amount.greaterThan(dec(row.remaining))) throw new ValidationError("The payout is more than what we hold for this partner");
  }
  // An earlier year's commission is paid as one amount (its invoices are not in this year).
  const allocations = input.category === "COMMISSION" && forYear === null ? input.commissions ?? [] : [];
  if (input.category === "COMMISSION" && forYear === null) {
    if (!allocations.length) throw new ValidationError("Choose the commissions to pay");
    if (!sum(allocations.map((a) => round2(dec(a.amount)))).equals(amount)) throw new ValidationError("The amounts must add up to the total");
  }

  return db.$transaction(async (tx) => {
    for (const a of allocations) {
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${a.invoiceId} FOR UPDATE`;
      const inv = await tx.invoice.findUnique({ where: { id: a.invoiceId }, include: { shipment: true, commissionPayments: { include: { cashOut: true } } } });
      if (!inv?.shipment || inv.shipment.originCountry !== scope.country || inv.shipment.businessYear !== scope.year) throw new ValidationError("Invoice not found");
      if (inv.status !== "PAID") throw new ValidationError("Commission is payable only after the customer has paid in full");
      const paid = sum(inv.commissionPayments.filter((p) => !p.cashOut.reversedAt).map((p) => p.amount));
      if (round2(dec(a.amount)).greaterThan(inv.commissionAmount.minus(paid))) throw new ValidationError("More than the commission still owed");
    }
    const forNote = forYear !== null ? [`For ${forYear}`, reference].filter(Boolean).join(" · ") : null;
    const receipt = await issueReceipt(tx, {
      direction: "OUT",
      kind: RECEIPT_KIND[input.category],
      amount,
      bankId: bank.id,
      counterparty: [sentTo, [sentVia, sentAccount].filter(Boolean).join(" ")].filter(Boolean).join(" — ") || null,
      note: [forNote, input.note?.trim().slice(0, 300)].filter(Boolean).join(" — ") || null,
      actorUserId: actor.id,
      issuedAt: input.paidAt,
    });
    const out = await tx.cashOut.create({
      data: {
        country: scope.country,
        year: scope.year,
        category: input.category,
        shipmentId: input.category === "SHIPMENT_COST" ? input.shipmentId || null : null,
        stage: input.category === "SHIPMENT_COST" && input.shipmentId ? input.stage : null,
        forYear,
        reference,
        partner: input.category === "PROFIT_PAYOUT" ? input.partner : null,
        bankId: bank.id,
        sentTo,
        sentVia,
        sentAccount,
        amount,
        paidAt: input.paidAt,
        note: input.note?.trim().slice(0, 300) || null,
        receiptId: receipt.id,
        actorUserId: actor.id,
      },
    });
    if (allocations.length) await tx.commissionPayment.createMany({ data: allocations.map((a) => ({ cashOutId: out.id, invoiceId: a.invoiceId, amount: round2(dec(a.amount)) })) });
    await logAudit(tx, { actorUserId: actor.id, action: "accounting.out", entityType: "CashOut", entityId: out.id, metadata: { category: input.category, amount: amount.toString(), receipt: receipt.number, forYear, reference } });
    return { id: out.id, receiptNo: receipt.number };
  });
}

/** Correct an out: it is reversed (kept with its receipt), never deleted. */
export async function reverseOut(db: PrismaClient, actor: AuthzUser, outId: string) {
  requireAccountingAccess(actor);
  requirePermission(actor, "accounting:write");
  const out = await db.cashOut.findUnique({ where: { id: outId }, include: { returns: true } });
  if (!out) throw new ValidationError("Not found");
  requireScope(actor, { country: out.country, businessYear: out.year });
  if (out.reversedAt) return;
  await assertOpenFor(db, out.country, { year: out.year, date: out.paidAt });
  if (out.returns.length) throw new ValidationError("This debt has returns; it cannot be removed");
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.cashOut.update({ where: { id: outId }, data: { reversedAt: now } });
    await tx.receipt.update({ where: { id: out.receiptId }, data: { reversedAt: now } });
    await logAudit(tx, { actorUserId: actor.id, action: "accounting.out_reverse", entityType: "CashOut", entityId: outId });
  });
}

// ------------------------------------------------------------------ debts

export async function listDebts(db: PrismaClient, actor: AuthzUser, scope: Scope) {
  scoped(actor, scope);
  const [debts, old] = await Promise.all([
    db.cashOut.findMany({ where: { country: scope.country, year: scope.year, category: "DEBT", reversedAt: null }, include: { returns: { include: { bank: true } }, bank: true }, orderBy: { paidAt: "desc" } }),
    db.openingEntry.findMany({ where: { country: scope.country, year: scope.year, kind: "DEBT", reversedAt: null }, include: { returns: { include: { bank: true } } }, orderBy: { fromYear: "asc" } }),
  ]);
  const all = [
    ...debts.map((d) => ({ id: d.id, person: d.sentTo ?? "-", note: d.note, date: d.paidAt.toISOString(), fromYear: null as number | null, bank: d.bank.name as string | null, amount: d.amount, returns: d.returns })),
    // Debts brought forward from earlier years (Opening balance → Debt).
    ...old.map((e) => ({ id: e.id, person: e.person ?? "-", note: e.note, date: new Date(Date.UTC(scope.year, 0, 1)).toISOString(), fromYear: e.fromYear as number | null, bank: null, amount: e.amount, returns: e.returns })),
  ];
  const rows = all.map((d) => {
    const returned = sum(d.returns.map((r) => r.amount));
    const owed = d.amount.minus(returned);
    return {
      id: d.id,
      person: d.person,
      note: d.note,
      date: d.date,
      fromYear: d.fromYear,
      bank: d.bank,
      lent: s2(d.amount),
      returned: s2(returned),
      owed: s2(owed),
      status: owed.isZero() ? "Paid" : returned.greaterThan(0) ? "Partial" : "Unpaid",
      returns: d.returns.map((r) => ({ id: r.id, date: r.returnedAt.toISOString(), amount: s2(r.amount), bank: r.bank.name })),
    };
  });
  return {
    rows,
    totals: { lent: s2(sum(rows.map((r) => dec(r.lent)))), returned: s2(sum(rows.map((r) => dec(r.returned)))), owed: s2(sum(rows.map((r) => dec(r.owed)))) },
  };
}

/** Money returned on a debt: posts to Income with an IN receipt. */
export async function returnDebt(db: PrismaClient, actor: AuthzUser, input: { debtId: string; amount: string; bankId: string; returnedAt: Date }) {
  requireAccountingAccess(actor);
  requirePermission(actor, "accounting:write");
  const amount = round2(dec(input.amount));
  if (!amount.greaterThan(0)) throw new ValidationError("Enter the amount");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "CashOut" WHERE id = ${input.debtId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "OpeningEntry" WHERE id = ${input.debtId} FOR UPDATE`;
    const out = await tx.cashOut.findUnique({ where: { id: input.debtId }, include: { returns: true } });
    const old = out ? null : await tx.openingEntry.findUnique({ where: { id: input.debtId }, include: { returns: true } });
    // A debt is an Out → Debt this year, or a debt brought forward from an earlier year.
    const debt =
      out && out.category === "DEBT" && !out.reversedAt
        ? { country: out.country, year: out.year, person: out.sentTo, amount: out.amount, returns: out.returns, link: { cashOutId: out.id }, entity: "CashOut" }
        : old && old.kind === "DEBT" && !old.reversedAt
          ? { country: old.country, year: old.year, person: old.person, amount: old.amount, returns: old.returns, link: { openingEntryId: old.id }, entity: "OpeningEntry" }
          : null;
    if (!debt) throw new ValidationError("Not found");
    requireScope(actor, { country: debt.country, businessYear: debt.year });
    await assertOpenFor(tx, debt.country, { year: debt.year, date: input.returnedAt });
    const owed = debt.amount.minus(sum(debt.returns.map((r) => r.amount)));
    if (amount.greaterThan(owed)) throw new ValidationError("More than what is still owed");
    const bank = await tx.bank.findUnique({ where: { id: input.bankId } });
    if (!bank?.active) throw new ValidationError("Choose a bank");
    const receipt = await issueReceipt(tx, { direction: "IN", kind: "DEBT_RETURN", amount, bankId: bank.id, counterparty: debt.person, actorUserId: actor.id, issuedAt: input.returnedAt });
    const r = await tx.debtReturn.create({ data: { ...debt.link, amount, bankId: bank.id, returnedAt: input.returnedAt, receiptId: receipt.id, actorUserId: actor.id } });
    await logAudit(tx, { actorUserId: actor.id, action: "accounting.debt_return", entityType: debt.entity, entityId: input.debtId, metadata: { amount: amount.toString() } });
    return { id: r.id, receiptNo: receipt.number };
  });
}

// ------------------------------------------------------------------ commissions, partners, profit

export async function listCommissions(db: PrismaClient, actor: AuthzUser, scope: Scope) {
  scoped(actor, scope);
  const invoices = await db.invoice.findMany({
    where: { status: { not: "VOID" }, agentName: { not: null }, commissionAmount: { gt: 0 }, shipment: { originCountry: scope.country, businessYear: scope.year } },
    include: { customer: true, shipment: true, commissionPayments: { include: { cashOut: { include: { receipt: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const rows = invoices.map((i) => {
    const live = i.commissionPayments.filter((p) => !p.cashOut.reversedAt);
    const paid = sum(live.map((p) => p.amount));
    const due = i.commissionAmount.minus(paid);
    return {
      invoiceId: i.id,
      agent: i.agentName!,
      shipment: displayShipmentCode(i.shipment!.code),
      customer: `${i.customer.ref} — ${i.customer.name}`,
      quantity: s2(i.billedMeasure ?? D0()),
      rate: s2(i.agentRate ?? D0()),
      amount: s2(i.commissionAmount),
      paid: s2(paid),
      due: s2(due),
      // Payable only once the customer has paid the invoice in full.
      payable: i.status === "PAID",
      status: due.isZero() ? "Paid" : paid.greaterThan(0) ? "Partial" : "Unpaid",
      history: live.map((p) => ({ date: p.cashOut.paidAt.toISOString(), amount: s2(p.amount), receiptNo: p.cashOut.receipt.number })),
    };
  });
  return {
    rows,
    totals: { amount: s2(sum(rows.map((r) => dec(r.amount)))), paid: s2(sum(rows.map((r) => dec(r.paid)))), payable: s2(sum(rows.filter((r) => r.payable).map((r) => dec(r.due)))) },
  };
}

export async function partnersProfit(db: PrismaClient, actor: AuthzUser, scope: Scope) {
  scoped(actor, scope);
  const f = await moneyFacts(db, scope);
  const shares = partnerShares(f.shipments);
  const openSom = openingFor(f, "som");
  const openMah = openingFor(f, "mah");
  const payouts = (p: Partner) => f.outs.filter((o) => o.category === "PROFIT_PAYOUT" && o.partner === p && o.forYear === null);
  const mk = (p: Partner, earned: Prisma.Decimal) => {
    const paid = sum(payouts(p).map((o) => o.amount));
    return { earned: s2(earned), paid: s2(paid), hold: s2(earned.minus(paid)), payouts: payouts(p).map((o) => ({ id: o.id, date: o.paidAt.toISOString(), amount: s2(o.amount), receiptNo: o.receipt.number })) };
  };
  return {
    applies: f.shipments.some((s) => s.row.split[1] > 0 || s.row.split[2] > 0) || !openSom.add(openMah).isZero(),
    perShipment: f.shipments.map((s) => ({ code: s.code, mode: s.mode, profit: s.row.profit, split: s.row.split, somaliTransport: s.row.somaliTransport, mahad: s.row.mahad })),
    // Earned includes what was still held for them from earlier years.
    somaliTransport: mk("SOMALI_TRANSPORT", shares.som.add(openSom)),
    mahad: mk("MAHAD", shares.mah.add(openMah)),
  };
}

export async function profitAndExpenses(db: PrismaClient, actor: AuthzUser, scope: Scope) {
  scoped(actor, scope);
  const f = await moneyFacts(db, scope);
  const orbit = sum(f.shipments.map((s) => dec(s.row.orbit)));
  const expenses = outsBy(f.outs, "EXPENSE");
  return {
    perShipment: f.shipments.map((s) => ({ code: s.code, mode: s.mode, income: s.row.totalIncome, cost: s.row.totalCost, profit: s.row.profit, orbitShare: s.row.split[0], orbit: s.row.orbit })),
    orbit: s2(orbit),
    expenses: s2(expenses),
    net: s2(orbit.minus(expenses)),
    expenseRows: f.outs.filter((o) => o.category === "EXPENSE").map((o) => ({ id: o.id, date: o.paidAt.toISOString(), sentTo: o.sentTo, note: o.note, amount: s2(o.amount), receiptNo: o.receipt.number })),
  };
}

// ------------------------------------------------------------------ receipts, overview, closing

const KIND_LABEL: Record<ReceiptKind, string> = {
  PAYMENT: "Payment",
  EXPENSE: "Expense",
  SHIPMENT_COST: "Shipment cost",
  COMMISSION: "Commission",
  TRANSFER: "Transfer",
  DEBT: "Debt",
  DEBT_RETURN: "Debt returned",
  OTHER: "Profit payout",
};

export async function listReceipts(db: PrismaClient, actor: AuthzUser, scope: Scope, filters: { kind?: ReceiptKind; q?: string } = {}) {
  scoped(actor, scope);
  const q = filters.q?.trim();
  const receipts = await db.receipt.findMany({
    // The business year comes from what the money belongs to (the shipment,
    // the out, the debt), not Receipt.year: that is the numbering year of the
    // issue date, and an out dated Oct 2026 can belong to business year 2027.
    where: {
      ...(filters.kind ? { kind: filters.kind } : {}),
      OR: [
        { payment: { allocations: { some: { invoice: { shipment: { originCountry: scope.country, businessYear: scope.year } } } } } },
        { cashOut: { country: scope.country, year: scope.year } },
        { debtReturn: { cashOut: { country: scope.country, year: scope.year } } },
        { debtReturn: { openingEntry: { country: scope.country, year: scope.year } } },
      ],
      ...(q ? { AND: [{ OR: [{ number: { contains: q, mode: "insensitive" } }, { counterparty: { contains: q, mode: "insensitive" } }, { customer: { name: { contains: q, mode: "insensitive" } } }] }] } : {}),
    },
    include: { bank: true, customer: true, cashOut: { select: { sentTo: true, sentVia: true, sentAccount: true } } },
    orderBy: { issuedAt: "desc" },
    take: 500,
  });
  return receipts.map((r) => ({
    id: r.id,
    number: r.number,
    date: r.issuedAt.toISOString(),
    direction: r.direction,
    kind: r.kind,
    kindLabel: KIND_LABEL[r.kind],
    party: r.customer ? `${r.customer.ref} — ${r.customer.name}` : r.cashOut?.sentTo ?? r.counterparty ?? "-",
    // How an out was sent (e.g. "EVC Plus 615123456"); null for older outs and money in.
    via: [r.cashOut?.sentVia, r.cashOut?.sentAccount].filter(Boolean).join(" ") || null,
    bank: r.bank?.name ?? null,
    amount: s2(r.amount),
    reversed: !!r.reversedAt,
    note: r.note,
  }));
}

export async function getReceipt(db: PrismaClient, actor: AuthzUser, scope: Scope, receiptId: string) {
  const rows = await listReceipts(db, actor, scope, {});
  const r = rows.find((x) => x.id === receiptId);
  if (!r) throw new ValidationError("Receipt not found");
  return r;
}

/** Overview: H1 / H2 / Year figures, and which periods are closed. */
export async function overview(db: PrismaClient, actor: AuthzUser, scope: Scope) {
  scoped(actor, scope);
  const f = await moneyFacts(db, scope);
  const invoices = await db.invoice.findMany({ where: { status: { not: "VOID" }, shipment: { originCountry: scope.country, businessYear: scope.year } } });
  const closes = await db.periodClose.findMany({ where: { country: scope.country, year: scope.year, reopenedAt: null } });
  const periods = (["H1", "H2", "YEAR"] as ClosePeriod[]).map((p) => {
    const { from, to } = periodRange(scope.year, p);
    const inP = (d: Date) => d >= from && d <= to;
    const S = f.shipments.filter((s) => inP(new Date(s.shipDate)));
    const I = invoices.filter((i) => inP(i.issuedAt ?? i.createdAt));
    const revenue = sum(I.map((i) => i.total));
    const cost = sum(S.map((s) => dec(s.row.totalCost)));
    const commission = sum(S.map((s) => dec(s.row.commission)));
    const expenses = sum(f.outs.filter((o) => o.category === "EXPENSE" && inP(o.paidAt)).map((o) => o.amount));
    const close = closes.find((c) => c.period === p);
    return {
      period: p,
      from: from.toISOString(),
      to: to.toISOString(),
      revenue: s2(revenue),
      shipmentCost: s2(cost),
      commission: s2(commission),
      expenses: s2(expenses),
      net: s2(revenue.minus(cost).minus(commission).minus(expenses)),
      collected: s2(sum(I.map((i) => i.amountAllocated))),
      outstanding: s2(sum(I.map((i) => i.total.minus(i.amountAllocated)))),
      closedAt: close?.closedAt.toISOString() ?? null,
    };
  });
  const yearClosed = periods.some((p) => p.period === "YEAR" && p.closedAt);
  return {
    periods,
    opening: s2(f.opening),
    // Closing is for system years only; years before it are opening balances.
    canClose: scope.year >= SYSTEM_START_YEAR,
    canReopen: actor.isSuperAdmin && scope.year >= SYSTEM_START_YEAR,
    yearCheck: yearClosed || scope.year < SYSTEM_START_YEAR ? null : await yearCloseCheck(db, actor, scope),
  };
}

/** Parts that must be paid out before the year is closed: only Orbit profit stays. */
const MUST_BE_PAID = ["transfer", "commission", "cost", "som", "mah"];

/**
 * What stops the year from closing (owner 2026-10-25): every shipment cost,
 * Somali Transport and Mahad profit, Transfer Money and Commission must be
 * paid out, so only Orbit profit is left. Customers who still owe are not a
 * stop: their invoices are carried to next year as debts owed to us.
 */
async function yearCloseCheck(db: PrismaClient, actor: AuthzUser, scope: Scope) {
  const [io, costs, prevOpen] = await Promise.all([
    incomeAndOut(db, actor, scope),
    listShipmentCosts(db, actor, scope),
    scope.year - 1 >= SYSTEM_START_YEAR ? isYearClosed(db, scope.country, scope.year - 1).then((c) => !c) : Promise.resolve(false),
  ]);
  const blockers: { key: string; label: string; amount: string; detail: { code: string; amount: string }[] }[] = [];
  if (prevOpen) blockers.push({ key: "previous", label: "Close the previous year first", amount: "0.00", detail: [] });
  // Shipment costs still due on their cost sheets (stage by stage).
  const unpaid = costs.rows
    .map((r) => ({ code: r.code, left: (["ORIGIN", "TRANSIT", "ARRIVED"] as const).reduce((a, st) => a.add(dec(r.row.stages[st]).minus(dec(r.paid[st])).greaterThan(0) ? dec(r.row.stages[st]).minus(dec(r.paid[st])) : D0()), D0()) }))
    .filter((r) => r.left.greaterThan(0));
  if (unpaid.length) blockers.push({ key: "costDue", label: "Shipment costs not paid", amount: s2(sum(unpaid.map((r) => r.left))), detail: unpaid.map((r) => ({ code: r.code, amount: s2(r.left) })) });
  // Money still held for someone else. (A part below zero is money Orbit put
  // in from its profit — it is not a stop.)
  for (const r of io.composition.filter((c) => MUST_BE_PAID.includes(c.key) && dec(c.remaining).greaterThan(0))) {
    blockers.push({ key: r.key, label: r.label, amount: r.remaining, detail: [] });
  }
  const owed = await customersOwing(db, scope);
  return {
    blockers,
    orbitProfit: io.composition.find((c) => c.key === "orbit")?.remaining ?? "0.00",
    balance: io.balance,
    customersOwe: { count: owed.length, amount: s2(sum(owed.map((o) => o.amount))) },
  };
}

/** Invoices of the year's shipments that customers have not paid in full. */
async function customersOwing(db: Db, scope: Scope) {
  const invoices = await db.invoice.findMany({
    where: { status: { not: "VOID" }, shipment: { originCountry: scope.country, businessYear: scope.year } },
    include: { customer: { select: { ref: true, name: true } }, shipment: { select: { code: true } } },
    orderBy: { createdAt: "asc" },
  });
  return invoices
    .map((i) => ({ person: `${i.customer.ref} — ${i.customer.name}`, note: `${displayShipmentCode(i.shipment!.code)} · ${i.number}`, amount: round2(i.total.minus(i.amountAllocated)) }))
    .filter((i) => i.amount.greaterThan(0));
}

/**
 * Close a period: it is locked for Finance and Accounting. January – June
 * locks what is dated in it. The full year locks everything of the year,
 * whatever the date, and is allowed only when only Orbit profit is left; next
 * year then opens with this year's balance, and every debt still owed to us —
 * customers' unpaid invoices included — is carried as a debt.
 */
export async function closePeriod(db: PrismaClient, actor: AuthzUser, scope: Scope, period: ClosePeriod) {
  scoped(actor, scope);
  requirePermission(actor, "accounting:manage");
  if (scope.year < SYSTEM_START_YEAR) throw new ValidationError("Years before 2026 are opening balances; there is nothing to close");
  if (period === "H2") throw new ValidationError("July – December is closed with the full year");
  const { from, to } = periodRange(scope.year, period);
  if (await db.periodClose.findFirst({ where: { country: scope.country, year: scope.year, period, reopenedAt: null } })) throw new ValidationError("This period is already closed");
  if (period === "H1" && (await isYearClosed(db, scope.country, scope.year))) throw new ValidationError("This period is already closed");
  const check = period === "YEAR" ? await yearCloseCheck(db, actor, scope) : null;
  if (check?.blockers.length) throw new ValidationError("Pay out everything first; only Orbit profit can be left");
  const io = period === "YEAR" ? await incomeAndOut(db, actor, scope) : null;
  const debts = period === "YEAR" ? await listDebts(db, actor, scope) : null;
  const owing = period === "YEAR" ? await customersOwing(db, scope) : [];
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`close:${scope.country}:${scope.year}`}))`;
    await tx.periodClose.create({ data: { country: scope.country, year: scope.year, period, fromDate: from, toDate: to, actorUserId: actor.id } });
    if (io && debts) {
      // Next year opens with this year's balance: its total, where it is (per
      // bank) and what it is (per source), plus every debt still owed to us.
      const base = { country: scope.country, year: scope.year + 1, fromYear: scope.year, carried: true, actorUserId: actor.id };
      await reverseCarried(tx, actor, base.country, base.year, base.fromYear);
      const nz = <T extends { amount: Prisma.Decimal }>(xs: T[]) => xs.filter((x) => !x.amount.isZero());
      const total = dec(io.balance);
      const lines = total.isZero()
        ? []
        : [
            { ...base, kind: "TOTAL" as const, amount: total, note: `Closing balance ${scope.year}` },
            ...nz(io.perBank.map((b) => ({ ...base, kind: "BANK" as const, bankId: b.bankId, amount: dec(b.recorded) }))),
            ...nz(io.unbanked ? [{ ...base, kind: "BANK" as const, bankId: null, amount: dec(io.unbanked.recorded) }] : []),
            // Everything else is paid out, so the whole balance is Orbit profit.
            { ...base, kind: "SOURCE" as const, source: "PROFIT" as const, amount: total },
          ];
      const owed = [
        ...debts.rows.filter((d) => dec(d.owed).greaterThan(0)).map((d) => ({ ...base, kind: "DEBT" as const, source: "DEBT" as const, amount: dec(d.owed), person: d.person, note: d.note })),
        // Customers who still owe on this year's invoices: paid back next year in Debts.
        ...owing.map((o) => ({ ...base, kind: "DEBT" as const, source: "DEBT" as const, amount: o.amount, person: o.person, note: o.note })),
      ];
      if (lines.length + owed.length) await tx.openingEntry.createMany({ data: [...lines, ...owed] });
    }
    await logAudit(tx, { actorUserId: actor.id, action: "accounting.close", entityType: "PeriodClose", metadata: { ...scope, period, carried: io?.balance ?? null, customersOwe: owing.length } });
  });
}

/** Reverse every line a year close carried into the next year (kept in History). */
async function reverseCarried(tx: Prisma.TransactionClient, actor: AuthzUser, country: string, year: number, fromYear: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`opening:${country}:${year}:${fromYear}`}))`;
  await tx.openingEntry.updateMany({ where: { country, year, fromYear, carried: true, reversedAt: null }, data: { reversedAt: new Date(), reversedBy: actor.id } });
}

/**
 * Reopen a closed period (Super Admin only, system years). Reopening the full
 * year takes back what it carried into the next year; it is refused once the
 * next year is closed or has used a carried debt.
 */
export async function reopenPeriod(db: PrismaClient, actor: AuthzUser, scope: Scope, period: ClosePeriod) {
  scoped(actor, scope);
  if (!actor.isSuperAdmin) throw new AuthorizationError("Only a Super Admin can reopen a closed period");
  if (scope.year < SYSTEM_START_YEAR) throw new ValidationError("Years before 2026 are opening balances; there is nothing to close");
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`close:${scope.country}:${scope.year}`}))`;
    const close = await tx.periodClose.findFirst({ where: { country: scope.country, year: scope.year, period, reopenedAt: null } });
    if (!close) throw new ValidationError("This period is not closed");
    if (period === "H1" && (await isYearClosed(tx, scope.country, scope.year))) throw new ValidationError("Reopen the full year first");
    if (period === "YEAR") {
      if (await isYearClosed(tx, scope.country, scope.year + 1)) throw new ValidationError("Reopen the next year first");
      const used = await tx.openingEntry.count({ where: { country: scope.country, year: scope.year + 1, fromYear: scope.year, carried: true, reversedAt: null, returns: { some: {} } } });
      if (used) throw new ValidationError("Money was already returned next year on a debt carried from this year");
      await reverseCarried(tx, actor, scope.country, scope.year + 1, scope.year);
    }
    await tx.periodClose.update({ where: { id: close.id }, data: { reopenedAt: new Date(), reopenedBy: actor.id } });
    await logAudit(tx, { actorUserId: actor.id, action: "accounting.reopen", entityType: "PeriodClose", entityId: close.id, metadata: { ...scope, period } });
  });
}

// ------------------------------------------------------------------ opening balance (earlier years)

const yearStart = (year: number) => new Date(Date.UTC(year, 0, 1));

/**
 * Opening balance of the year: for every earlier year, the balance typed
 * first, then the banks it is in. The money is Orbit profit (owner
 * 2026-10-25). Then "brought forward + this year = now".
 */
export async function listOpening(db: PrismaClient, actor: AuthzUser, scope: Scope) {
  scoped(actor, scope);
  const [entries, legacy, banks, locked] = await Promise.all([
    db.openingEntry.findMany({ where: { country: scope.country, year: scope.year }, include: { bank: true, returns: true }, orderBy: [{ fromYear: "desc" }, { createdAt: "asc" }] }),
    db.openingBalance.findUnique({ where: { country_year: { country: scope.country, year: scope.year } } }),
    db.bank.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    isClosed(db, scope.country, yearStart(scope.year)).then(async (c) => c || isYearClosed(db, scope.country, scope.year)),
  ]);
  const live = entries.filter((e) => !e.reversedAt);
  // Outs paid this year for an earlier year (e.g. 2025 shipment W-30).
  const later = await db.cashOut.findMany({ where: { country: scope.country, year: scope.year, forYear: { not: null }, reversedAt: null }, include: { receipt: true, shipment: true, bank: true }, orderBy: { paidAt: "asc" } });
  const fromYears = [...new Set(live.map((e) => e.fromYear))].sort((a, b) => b - a);
  const years = fromYears.map((fy) => {
    const L = live.filter((e) => e.fromYear === fy);
    const total = L.find((e) => e.kind === "TOTAL");
    const paidFor = later.filter((o) => o.forYear === fy);
    const paid = sum(paidFor.map((o) => o.amount));
    return {
      fromYear: fy,
      total: total ? s2(total.amount) : null,
      carried: !!total?.carried,
      note: total?.note ?? null,
      banks: L.filter((e) => e.kind === "BANK").map((e) => ({ bankId: e.bankId, bank: e.bank?.name ?? null, amount: s2(e.amount) })),
      // What that year left (Orbit profit) after what was paid for it this year.
      left: total ? s2(total.amount.minus(paid)) : null,
      paidAfter: paidFor.map((o) => ({
        id: o.id,
        date: o.paidAt.toISOString(),
        category: o.category,
        partner: o.partner,
        what: o.shipment ? `${displayShipmentCode(o.shipment.code)}${o.stage ? ` · ${o.stage}` : ""}` : o.reference,
        sentTo: o.sentTo,
        bank: o.bank.name,
        receiptNo: o.receipt.number,
        amount: s2(o.amount),
      })),
      paidTotal: s2(paid),
      debts: L.filter((e) => e.kind === "DEBT").map((e) => ({ id: e.id, person: e.person ?? "-", amount: s2(e.amount), returned: s2(sum(e.returns.map((r) => r.amount))), note: e.note, carried: e.carried, hasReturns: e.returns.length > 0 })),
    };
  });
  // Brought forward + this year = now, per bank and per part.
  const io = await incomeAndOut(db, actor, scope);
  return {
    years,
    legacy: legacy ? s2(legacy.amount) : null,
    now: { banks: io.perBank, unbanked: io.unbanked, sources: io.composition, opening: io.opening, balance: io.balance },
    history: entries.map((e) => ({
      id: e.id,
      fromYear: e.fromYear,
      kind: e.kind,
      source: e.source,
      amount: s2(e.amount),
      bank: e.bank?.name ?? null,
      person: e.person,
      note: e.note,
      carried: e.carried,
      reversed: !!e.reversedAt,
    })),
    locked,
    banks: banks.map((b) => ({ id: b.id, name: b.name })),
    systemStart: SYSTEM_START_YEAR,
  };
}

const money2 = (v: string, msg: string) => {
  const raw = v.trim().replace(/[\s,]/g, "");
  if (raw === "") return D0();
  if (!/^-?\d{1,10}(\.\d{1,2})?$/.test(raw)) throw new ValidationError(msg);
  return round2(dec(raw));
};
/** Only years before the system are typed; later years are carried when they are closed. */
const checkFromYear = (scope: Scope, fromYear: number) => {
  if (!Number.isInteger(fromYear) || fromYear >= scope.year || fromYear < scope.year - 30) throw new ValidationError("Choose the year it came from");
  if (fromYear >= SYSTEM_START_YEAR) throw new ValidationError("This year is carried automatically when it is closed");
};

/** Reverse an earlier year's TOTAL / BANK / SOURCE lines (debts are kept). */
async function reverseYearLines(tx: Prisma.TransactionClient, actor: AuthzUser, country: string, year: number, fromYear: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`opening:${country}:${year}:${fromYear}`}))`;
  const old = await tx.openingEntry.findMany({ where: { country, year, fromYear, kind: { in: ["TOTAL", "BANK", "SOURCE"] }, reversedAt: null } });
  if (old.length) await tx.openingEntry.updateMany({ where: { id: { in: old.map((e) => e.id) } }, data: { reversedAt: new Date(), reversedBy: actor.id } });
  return old;
}

export interface OpeningYearInput {
  fromYear: number;
  /** The year's balance, typed first (+ or −). */
  total: string;
  /** Where it is: must add up to the total. */
  banks: { bankId: string; amount: string }[];
  note?: string;
}

/**
 * Save an earlier year: its balance and the banks it is in (they must equal
 * the balance). The whole balance is Orbit profit (owner 2026-10-25). Saving
 * again replaces the year (the old lines are reversed and kept in the history).
 */
export async function saveOpeningYear(db: PrismaClient, actor: AuthzUser, scope: Scope, input: OpeningYearInput) {
  scoped(actor, scope);
  requirePermission(actor, "accounting:manage");
  await assertOpenFor(db, scope.country, { year: scope.year, date: yearStart(scope.year) });
  checkFromYear(scope, input.fromYear);
  const total = money2(input.total, "Enter the year's balance");
  if (total.isZero()) throw new ValidationError("Enter the year's balance");

  const active = await db.bank.findMany({ where: { active: true } });
  const banks = input.banks.map((b) => ({ bankId: b.bankId, amount: money2(b.amount, "Enter the amounts") })).filter((b) => !b.amount.isZero());
  if (banks.some((b) => !active.some((a) => a.id === b.bankId)) || new Set(banks.map((b) => b.bankId)).size !== banks.length) throw new ValidationError("Choose a bank");
  if (!sum(banks.map((b) => b.amount)).equals(total)) throw new ValidationError("The banks must add up to the year's balance");

  const note = input.note?.trim().slice(0, 300) || null;
  await db.$transaction(async (tx) => {
    const replaced = await reverseYearLines(tx, actor, scope.country, scope.year, input.fromYear);
    const base = { country: scope.country, year: scope.year, fromYear: input.fromYear, actorUserId: actor.id };
    await tx.openingEntry.createMany({
      data: [
        { ...base, kind: "TOTAL", amount: total, note },
        ...banks.map((b) => ({ ...base, kind: "BANK" as const, bankId: b.bankId, amount: b.amount })),
        { ...base, kind: "SOURCE", source: "PROFIT", amount: total },
      ],
    });
    await logAudit(tx, {
      actorUserId: actor.id,
      action: "accounting.opening_year",
      entityType: "OpeningEntry",
      metadata: { ...scope, fromYear: input.fromYear, total: total.toString(), banks: banks.map((b) => [b.bankId, b.amount.toString()]), replaced: replaced.length },
    });
  });
}

/** Take an earlier year's balance out (its lines are reversed and kept). */
export async function removeOpeningYear(db: PrismaClient, actor: AuthzUser, scope: Scope, fromYear: number) {
  scoped(actor, scope);
  requirePermission(actor, "accounting:manage");
  await assertOpenFor(db, scope.country, { year: scope.year, date: yearStart(scope.year) });
  checkFromYear(scope, fromYear);
  await db.$transaction(async (tx) => {
    const old = await reverseYearLines(tx, actor, scope.country, scope.year, fromYear);
    if (old.length) await logAudit(tx, { actorUserId: actor.id, action: "accounting.opening_year_remove", entityType: "OpeningEntry", metadata: { ...scope, fromYear } });
  });
}

/** A debt from an earlier year: money someone still owes us (not in the balance). */
export async function addOpeningDebt(db: PrismaClient, actor: AuthzUser, scope: Scope, input: { fromYear: number; amount: string; person: string; note?: string }) {
  scoped(actor, scope);
  requirePermission(actor, "accounting:manage");
  await assertOpenFor(db, scope.country, { year: scope.year, date: yearStart(scope.year) });
  checkFromYear(scope, input.fromYear);
  const amount = money2(input.amount, "Enter the amount");
  if (!amount.greaterThan(0)) throw new ValidationError("A debt owed to us is a positive amount");
  const person = input.person?.trim().slice(0, 160);
  if (!person) throw new ValidationError("Enter who owes the money");
  return db.$transaction(async (tx) => {
    const e = await tx.openingEntry.create({
      data: { country: scope.country, year: scope.year, fromYear: input.fromYear, kind: "DEBT", source: "DEBT", amount, person, note: input.note?.trim().slice(0, 300) || null, actorUserId: actor.id },
    });
    await logAudit(tx, { actorUserId: actor.id, action: "accounting.opening_debt", entityType: "OpeningEntry", entityId: e.id, metadata: { ...scope, fromYear: input.fromYear, amount: amount.toString() } });
    return { id: e.id };
  });
}

/** Correct an earlier-year debt: it is reversed (kept), never deleted. */
export async function reverseOpening(db: PrismaClient, actor: AuthzUser, id: string) {
  requireAccountingAccess(actor);
  requirePermission(actor, "accounting:manage");
  const e = await db.openingEntry.findUnique({ where: { id }, include: { returns: true } });
  if (!e || e.kind !== "DEBT") throw new ValidationError("Not found");
  // A carried debt belongs to the closed year; it changes only by reopening that year.
  if (e.carried) throw new ValidationError("A carried debt cannot be removed");
  requireScope(actor, { country: e.country, businessYear: e.year });
  if (e.reversedAt) return;
  await assertOpenFor(db, e.country, { year: e.year, date: yearStart(e.year) });
  if (e.returns.length) throw new ValidationError("This debt has returns; it cannot be removed");
  await db.$transaction(async (tx) => {
    await tx.openingEntry.update({ where: { id }, data: { reversedAt: new Date(), reversedBy: actor.id } });
    await logAudit(tx, { actorUserId: actor.id, action: "accounting.opening_reverse", entityType: "OpeningEntry", entityId: id });
  });
}

/** Shipments of the scope for the Out form (with stage dues and what is paid). */
export async function outFormOptions(db: PrismaClient, actor: AuthzUser, scope: Scope) {
  scoped(actor, scope);
  const [shipments, commissions, banks, partners] = await Promise.all([
    shipmentFacts(db, scope),
    listCommissions(db, actor, scope),
    db.bank.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    partnersProfit(db, actor, scope),
  ]);
  // Years before the system with a typed opening balance: what each still has
  // left. (A system year is finished before it is closed.)
  const years = await db.openingEntry.findMany({ where: { country: scope.country, year: scope.year, kind: "TOTAL", carried: false, fromYear: { lt: SYSTEM_START_YEAR }, reversedAt: null }, orderBy: { fromYear: "desc" } });
  const earlierYears = await Promise.all(years.map(async (y) => ({ fromYear: y.fromYear, left: s2(await earlierYearLeft(db, scope, y.fromYear)) })));
  return {
    year: scope.year,
    shipments: shipments.map((s) => ({ id: s.id, code: s.code, mode: s.mode, due: s.row.stages, paid: s.paid })),
    commissions: commissions.rows.filter((r) => r.payable && dec(r.due).greaterThan(0)),
    banks: banks.map((b) => ({ id: b.id, name: b.name })),
    partners: partners.applies ? { SOMALI_TRANSPORT: partners.somaliTransport.hold, MAHAD: partners.mahad.hold } : null,
    earlierYears,
  };
}
