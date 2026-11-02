import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TransferRole } from "@prisma/client";
import { addOut, returnDebt, saveOpeningYear } from "@/modules/accounting/service";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { createCustomer } from "@/modules/customers/service";
import { addShipmentPayment, createShipmentInvoice } from "@/modules/finance/shipmentFinance";
import { addShipmentLine, createShipment } from "@/modules/shipments/service";
import { addReceive, deleteReceive, recordSend, setHanded } from "@/modules/transfer/money";
import { assertTestDatabase, prisma, resetDb, testPhone } from "./helpers";

/**
 * Security finding H3: Outs, Debt returns and Money Transfer under duplicate
 * submissions and simultaneous requests. Every case fires the requests at the
 * same moment and checks what the database holds afterwards: no second record
 * for one submission, never more paid out than allowed, and no row left in a
 * state the rules forbid.
 */
beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;
const TR = { country: "Turkey", year: 2026 };
const D = (s: string) => new Date(`${s}T12:00:00Z`);
const fulfilled = <T,>(rs: PromiseSettledResult<T>[]) => rs.filter((r): r is PromiseFulfilledResult<T> => r.status === "fulfilled").map((r) => r.value);
const rejected = (rs: PromiseSettledResult<unknown>[]) => rs.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => String(r.reason?.message ?? r.reason));

async function superAdmin(): Promise<AuthzUser> {
  const role = await prisma.role.upsert({ where: { key: "super_admin" }, create: { key: "super_admin", name: "Super Admin" }, update: {} });
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

/** Turkey air W-1 for Alpha (930) and Beta (400), both paid in full: partners hold a share. */
async function paidWorld() {
  const admin = await superAdmin();
  const a = await createCustomer(prisma, admin, { name: "Alpha", company: "Alpha", phone: testPhone() });
  const b = await createCustomer(prisma, admin, { name: "Beta", company: "Beta", phone: testPhone() });
  const w1 = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026, shipDate: D("2026-10-01") });
  await addShipmentLine(prisma, admin, w1.id, { customerId: a.id, packages: 4, chargeableWeightKg: "100", rate: "8", delivery: "10", fatura: "20" });
  await addShipmentLine(prisma, admin, w1.id, { customerId: b.id, packages: 2, chargeableWeightKg: "50", rate: "8" });
  const ia = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: a.id, billedMeasure: "100", baseRate: "8", agentName: "Hamar", agentRate: "1", fatura: "20", localDelivery: "10" });
  const ib = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: b.id, billedMeasure: "50", baseRate: "8" });
  const banks = await prisma.bank.findMany({ orderBy: { sortOrder: "asc" } });
  const salaam = banks[0]!;
  await addShipmentPayment(prisma, admin, { invoiceId: ia.id, amount: "930", bankId: salaam.id, receivedAt: D("2026-10-05") });
  await addShipmentPayment(prisma, admin, { invoiceId: ib.id, amount: "400", bankId: salaam.id, receivedAt: D("2026-10-05") });
  return { admin, salaam, cash: banks[3]! };
}

const expense = (bankId: string, key?: string) => ({ category: "EXPENSE" as const, amount: "25", bankId, paidAt: D("2026-10-10"), sentTo: "Office", idempotencyKey: key });
const outsCount = () => prisma.cashOut.count();
const outReceipts = () => prisma.receipt.count({ where: { direction: "OUT" } });

describe("Outs (H3)", () => {
  it("a resubmitted out with the same key returns the first one: one out, one receipt", async () => {
    const { admin, salaam } = await paidWorld();
    const key = randomUUID();
    const first = await addOut(prisma, admin, TR, expense(salaam.id, key));
    const again = await addOut(prisma, admin, TR, expense(salaam.id, key));
    expect(again).toEqual(first);
    expect([await outsCount(), await outReceipts()]).toEqual([1, 1]);
    // A different form (new key) is a new out.
    await addOut(prisma, admin, TR, expense(salaam.id, randomUUID()));
    expect(await outsCount()).toBe(2);
  });

  it("five identical submissions at the same moment save one out and one receipt", async () => {
    const { admin, salaam } = await paidWorld();
    const key = randomUUID();
    const rs = await Promise.allSettled(Array.from({ length: 5 }, () => addOut(prisma, admin, TR, expense(salaam.id, key))));
    const ok = fulfilled(rs);
    expect(rejected(rs)).toEqual([]);
    expect(new Set(ok.map((o) => o.id)).size).toBe(1);
    expect([await outsCount(), await outReceipts()]).toEqual([1, 1]);
  });

  it("someone else's key is refused, and a malformed key never reaches the database", async () => {
    const { admin, salaam } = await paidWorld();
    const key = randomUUID();
    await addOut(prisma, admin, TR, expense(salaam.id, key));
    const other = await superAdmin();
    await expect(addOut(prisma, other, TR, expense(salaam.id, key))).rejects.toThrow(/Invalid request/);
    await expect(addOut(prisma, admin, TR, expense(salaam.id, "not-a-uuid"))).rejects.toThrow(/Invalid request/);
    expect(await outsCount()).toBe(1);
    // The database refuses a non-UUID key too.
    const r = await prisma.receipt.create({ data: { number: "RCP-2026-9999", year: 2026, direction: "OUT", kind: "EXPENSE", amount: 1 } });
    await expect(prisma.cashOut.create({ data: { country: "Turkey", year: 2026, category: "EXPENSE", bankId: salaam.id, amount: 1, paidAt: D("2026-10-10"), receiptId: r.id, idempotencyKey: "x" } })).rejects.toThrow(/idempotencyKey_uuid/);
  });

  it("partner payouts at the same moment never pay out more than we hold", async () => {
    const { admin, salaam } = await paidWorld();
    // Mahad's share of W-1 is 80 (see accounting.test.ts): four payouts of 30 at once.
    const payout = () => addOut(prisma, admin, TR, { category: "PROFIT_PAYOUT", partner: "MAHAD", amount: "30", bankId: salaam.id, paidAt: D("2026-10-08"), sentTo: "Mahad", idempotencyKey: randomUUID() });
    const rs = await Promise.allSettled([payout(), payout(), payout(), payout()]);
    expect(fulfilled(rs)).toHaveLength(2); // 60 ≤ 80; a third would make 90
    expect(rejected(rs).every((m) => /more than what we hold/.test(m))).toBe(true);
    const paid = await prisma.cashOut.aggregate({ where: { category: "PROFIT_PAYOUT", partner: "MAHAD", reversedAt: null }, _sum: { amount: true } });
    expect(paid._sum.amount?.toString()).toBe("60");
  });

  it("outs for an earlier year at the same moment never take more than that year left", async () => {
    const { admin, salaam } = await paidWorld();
    await saveOpeningYear(prisma, admin, TR, { fromYear: 2025, total: "1000", banks: [{ bankId: salaam.id, amount: "1000" }] });
    const out = () => addOut(prisma, admin, TR, { category: "SHIPMENT_COST", amount: "400", bankId: salaam.id, paidAt: D("2026-10-12"), forYear: 2025, reference: "W-30", sentTo: "Agent", idempotencyKey: randomUUID() });
    const rs = await Promise.allSettled([out(), out(), out()]);
    expect(fulfilled(rs)).toHaveLength(2); // 800 ≤ 1000; a third would make 1200
    expect(rejected(rs).every((m) => /left from that year/.test(m))).toBe(true);
    const taken = await prisma.cashOut.aggregate({ where: { forYear: 2025, reversedAt: null }, _sum: { amount: true } });
    expect(taken._sum.amount?.toString()).toBe("800");
  });
});

describe("Debt returns (H3)", () => {
  async function debt() {
    const w = await paidWorld();
    const d = await addOut(prisma, w.admin, TR, { category: "DEBT", amount: "100", bankId: w.cash.id, paidAt: D("2026-10-06"), sentTo: "Ali" });
    return { ...w, debtId: d.id };
  }
  const back = (w: { admin: AuthzUser; cash: { id: string }; debtId: string }, amount: string, key?: string) =>
    returnDebt(prisma, w.admin, { debtId: w.debtId, amount, bankId: w.cash.id, returnedAt: D("2026-10-07"), idempotencyKey: key });

  it("a resubmitted return with the same key is saved once", async () => {
    const w = await debt();
    const key = randomUUID();
    const first = await back(w, "40", key);
    expect(await back(w, "40", key)).toEqual(first);
    expect(await prisma.debtReturn.count()).toBe(1);
  });

  it("five identical submissions at the same moment save one return and one receipt", async () => {
    const w = await debt();
    const key = randomUUID();
    const rs = await Promise.allSettled(Array.from({ length: 5 }, () => back(w, "40", key)));
    expect(rejected(rs)).toEqual([]);
    expect(new Set(fulfilled(rs).map((r) => r.id)).size).toBe(1);
    expect(await prisma.debtReturn.count()).toBe(1);
    expect(await prisma.receipt.count({ where: { kind: "DEBT_RETURN" } })).toBe(1);
  });

  it("returns at the same moment never exceed what is owed", async () => {
    const w = await debt();
    const rs = await Promise.allSettled([back(w, "40", randomUUID()), back(w, "40", randomUUID()), back(w, "40", randomUUID()), back(w, "40", randomUUID())]);
    expect(fulfilled(rs)).toHaveLength(2); // 80 ≤ 100; a third would make 120
    expect(rejected(rs).every((m) => /still owed/.test(m))).toBe(true);
    const sumBack = await prisma.debtReturn.aggregate({ _sum: { amount: true } });
    expect(sumBack._sum.amount?.toString()).toBe("80");
  });
});

describe("Money Transfer (H3)", () => {
  async function agent(transferRole: TransferRole): Promise<AuthzUser> {
    const e = await prisma.employee.create({ data: { code: `EMP-${uniq()}`, name: "Agent", department: "FINANCE", transferRole, transferCountries: ["Turkey"] } });
    const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE", employeeId: e.id } });
    return (await loadAuthzUser(prisma, user.id))!;
  }
  const receive = (key?: string) => ({ country: "Turkey", year: 2026, kind: "CUSTOMER" as const, receivedAt: "2026-10-05", amount: "1000", feePct: "1.5", currency: "USD", description: "to sina", tag: "CLOTHES" as const, idempotencyKey: key });
  const send = { sentAt: "2026-10-06", amount: "985", currency: "USD", status: "PAID" as const };

  it("a Money Receive submitted twice, or five times at once, is one row; another person's key is refused", async () => {
    const rec = await agent("RECEIVE");
    const key = randomUUID();
    const first = await addReceive(prisma, rec, receive(key));
    expect((await addReceive(prisma, rec, receive(key))).id).toBe(first.id);
    const key2 = randomUUID();
    const rs = await Promise.allSettled(Array.from({ length: 5 }, () => addReceive(prisma, rec, receive(key2))));
    expect(rejected(rs)).toEqual([]);
    expect(new Set(fulfilled(rs).map((r) => r.id)).size).toBe(1);
    expect(await prisma.moneyTransferRow.count()).toBe(2);
    await expect(addReceive(prisma, await agent("RECEIVE"), receive(key))).rejects.toThrow(/Invalid request/);
    expect(await prisma.moneyTransferRow.count()).toBe(2);
  });

  it("the Receiver turning a row back to orange and the Sender recording it at the same moment: never 'sent but not handed'", async () => {
    const rec = await agent("RECEIVE");
    const snd = await agent("SEND");
    for (let i = 0; i < 8; i++) {
      const row = await addReceive(prisma, rec, receive(randomUUID()));
      await setHanded(prisma, rec, row.id, true);
      const rs = await Promise.allSettled([recordSend(prisma, snd, row.id, send), setHanded(prisma, rec, row.id, false)]);
      expect(fulfilled(rs)).toHaveLength(1); // exactly one of them wins, the other is told why
      const after = await prisma.moneyTransferRow.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.sentAmount !== null && after.handedAt === null).toBe(false);
    }
  });

  it("the Receiver deleting a row and the Sender recording it at the same moment: never a deleted row with a transfer", async () => {
    const rec = await agent("RECEIVE");
    const snd = await agent("SEND");
    for (let i = 0; i < 8; i++) {
      const row = await addReceive(prisma, rec, receive(randomUUID()));
      await setHanded(prisma, rec, row.id, true);
      const rs = await Promise.allSettled([recordSend(prisma, snd, row.id, send), deleteReceive(prisma, rec, row.id)]);
      expect(fulfilled(rs)).toHaveLength(1);
      const after = await prisma.moneyTransferRow.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.deletedAt !== null && after.sentAmount !== null).toBe(false);
    }
  });
});
