import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { can, loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { computeCost } from "@/modules/accounting/calc";
import { setPin, signUnlock, unlockWithPin, verifyUnlock } from "@/modules/accounting/pin";
import {
  addOpeningDebt,
  addOut,
  closePeriod,
  incomeAndOut,
  listCommissions,
  listDebts,
  listOpening,
  listReceipts,
  listShipmentCosts,
  outFormOptions,
  overview,
  partnersProfit,
  reopenPeriod,
  returnDebt,
  removeOpeningYear,
  reverseOpening,
  reverseOut,
  saveCashCount,
  saveCostSheet,
  saveOpeningYear,
} from "@/modules/accounting/service";
import { createCustomer } from "@/modules/customers/service";
import { addShipmentPayment, createShipmentInvoice } from "@/modules/finance/shipmentFinance";
import { dec } from "@/modules/finance/money";
import { addShipmentLine, createShipment } from "@/modules/shipments/service";
import { createEmployee } from "@/modules/users/admin";
import { assertTestDatabase, prisma, resetDb, testPhone } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;
const TR = { country: "Turkey", year: 2026 };
const D = (s: string) => new Date(`${s}T12:00:00Z`);

async function superAdmin(): Promise<AuthzUser> {
  const role = await prisma.role.upsert({ where: { key: "super_admin" }, create: { key: "super_admin", name: "Super Admin" }, update: {} });
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

/** Turkey air W-1: 100 kg at $8 (+$1 agent) for Alpha, 50 kg at $8 for Beta. */
async function world() {
  const admin = await superAdmin();
  const a = await createCustomer(prisma, admin, { name: "Alpha", company: "Alpha", phone: testPhone() });
  const b = await createCustomer(prisma, admin, { name: "Beta", company: "Beta", phone: testPhone() });
  const w1 = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026, shipDate: D("2026-10-01") });
  await addShipmentLine(prisma, admin, w1.id, { customerId: a.id, packages: 4, chargeableWeightKg: "100", rate: "8", delivery: "10", fatura: "20" });
  await addShipmentLine(prisma, admin, w1.id, { customerId: b.id, packages: 2, chargeableWeightKg: "50", rate: "8" });
  const ia = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: a.id, billedMeasure: "100", baseRate: "8", agentName: "Hamar", agentRate: "1", fatura: "20", localDelivery: "10" }); // 900 + 30 = 930
  const ib = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: b.id, billedMeasure: "50", baseRate: "8" }); // 400
  const banks = await prisma.bank.findMany({ orderBy: { sortOrder: "asc" } });
  return { admin, a, b, w1, ia, ib, salaam: banks[0]!, cash: banks[3]! };
}

/** A closed year, written directly (for tests of the lock, not of closing). */
async function lockYear(scope: { country: string; year: number }) {
  await prisma.periodClose.create({
    data: { country: scope.country, year: scope.year, period: "YEAR", fromDate: D(`${scope.year}-01-01`), toDate: new Date(`${scope.year}-12-31T23:59:59.999Z`) },
  });
}

/** Pay out what stops the year from closing: shipment costs stage by stage, then the partners. */
async function settle(admin: AuthzUser, scope: { country: string; year: number }, bankId: string, paidAt: Date) {
  for (const r of (await listShipmentCosts(prisma, admin, scope)).rows) {
    for (const st of ["ORIGIN", "TRANSIT", "ARRIVED"] as const) {
      const left = Number(r.row.stages[st]) - Number(r.paid[st]);
      if (left > 0) await addOut(prisma, admin, scope, { category: "SHIPMENT_COST", shipmentId: r.id, stage: st, amount: left.toFixed(2), bankId, paidAt });
    }
  }
  for (const b of (await overview(prisma, admin, scope)).yearCheck!.blockers) {
    if (b.key === "som" || b.key === "mah") {
      await addOut(prisma, admin, scope, { category: "PROFIT_PAYOUT", partner: b.key === "som" ? "SOMALI_TRANSPORT" : "MAHAD", amount: b.amount, bankId, paidAt });
    }
  }
  expect((await overview(prisma, admin, scope)).yearCheck!.blockers).toEqual([]);
}

/** A user with the given permissions and no Super Admin role. */
async function staffWith(perms: string[]): Promise<AuthzUser> {
  const r = await prisma.role.create({ data: { key: `s-${uniq()}`, name: "s" } });
  for (const k of perms) {
    const p = await prisma.permission.upsert({ where: { key: k }, create: { key: k }, update: {} });
    await prisma.rolePermission.create({ data: { roleId: r.id, permissionId: p.id } });
  }
  const u = await prisma.user.create({ data: { email: `${uniq()}@o.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: u.id, roleId: r.id } });
  return (await loadAuthzUser(prisma, u.id))!;
}

/** Run with the clock set to a day (dates in the future are refused). */
async function at<T>(iso: string, fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${iso}T12:00:00Z`));
  try {
    return await fn();
  } finally {
    vi.useRealTimers();
  }
}

describe("access and PIN", () => {
  it("only employees with the Accounting switch get in; the PIN unlocks one session", async () => {
    const admin = await superAdmin();
    await prisma.role.upsert({ where: { key: "finance_admin" }, create: { key: "finance_admin", name: "Finance Admin" }, update: {} });
    const base = { name: "X", phone: "", department: "FINANCE" as const, roleKeys: ["finance_admin"], countries: [], access: {}, transferRole: "NONE" as const, transferCountries: [] };
    const off = await createEmployee(prisma, admin, { ...base, email: `${uniq()}@o.so`, accountingAccess: false });
    const on = await createEmployee(prisma, admin, { ...base, email: `${uniq()}@o.so`, accountingAccess: true });
    await prisma.user.updateMany({ data: { status: "ACTIVE" } });
    const uOff = (await loadAuthzUser(prisma, off.userId))!;
    const uOn = (await loadAuthzUser(prisma, on.userId))!;
    expect(can(uOff, "accounting:read")).toBe(false);
    expect(can(uOn, "accounting:write")).toBe(true);
    expect(can(uOn, "accounting:manage")).toBe(false);
    await expect(setPin(prisma, uOff, "1234", "1234")).rejects.toThrow(/No access/);

    await expect(setPin(prisma, uOn, "12", "12")).rejects.toThrow(/4 to 8/);
    await setPin(prisma, uOn, "4321", "4321");
    await expect(unlockWithPin(prisma, uOn, "0000")).rejects.toThrow(/Wrong PIN/);
    const token = await unlockWithPin(prisma, uOn, "4321");
    expect(verifyUnlock(uOn, token)).toBe(true);
    expect(verifyUnlock({ ...uOn, sessionEpoch: uOn.sessionEpoch + 1 }, token)).toBe(false); // logout / reset kills it
    expect(verifyUnlock(uOn, signUnlock(uOn, Date.now() - 9 * 3600_000))).toBe(false); // expired
    expect(verifyUnlock(uOn, token.slice(0, -2) + "xx")).toBe(false); // tampered
    for (let i = 0; i < 4; i++) await expect(unlockWithPin(prisma, uOn, "9999")).rejects.toThrow();
    await expect(unlockWithPin(prisma, uOn, "4321")).rejects.toThrow(/Too many/); // rate-limited
  });
});

describe("cost sheets and profit", () => {
  it("matches the design's formulas for an air shipment (Turkey split)", () => {
    const r = computeCost(
      { mode: "AIR", quantity: dec(100), localDelivery: dec(10), invoiceCharge: dec(20), collected: dec(1330), commission: dec(100) },
      { rate: "3", awbCost: "50", custom: "30", deliveryPackaging: "20", brandedCharges: "0", transferPercent: "2", transferMoney: "40" },
      { qualityControlRate: "0.5", airportHandlingRate: "0.3", mgqCustomRate: "0.2", trpr: "15", loader: "5", extra: "0", transitCountry: "Kenya", transitCost: "60" },
      [43, 50, 7],
    );
    // base = 3×100 + 50 + 30 + 20 + 20 + 0 = 420; fee = (420 + 10) × 2% = 8.6
    expect([r.transferFee, r.originCost]).toEqual(["8.6", "438.6"]);
    // MGQ net = (0.5+0.3+0.2)×100 + 15 + 5 = 120; + transit 60
    expect([r.mgqNet, r.mgqTotal, r.totalCost]).toEqual(["120", "180", "618.6"]);
    // income = 1330 − 100 commission − 40 transfer money = 1190; profit = 571.4
    expect([r.totalIncome, r.profit]).toEqual(["1190", "571.4"]);
    expect([r.orbit, r.somaliTransport, r.mahad]).toEqual(["245.7", "325.7", "40"]); // 43% / 50% + transfer money 40 / 7%
    expect(r.stages).toEqual({ ORIGIN: "438.6", TRANSIT: "60", ARRIVED: "120" });
  });

  it("each sheet has its own editor and nothing changes in a closed period", async () => {
    const { admin, w1 } = await world();
    const role = await prisma.role.create({ data: { key: `r-${uniq()}`, name: "r" } });
    for (const k of ["accounting:read", "costorigin:write"]) {
      const p = await prisma.permission.upsert({ where: { key: k }, create: { key: k }, update: {} });
      await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: p.id } });
    }
    const u = await prisma.user.create({ data: { email: `${uniq()}@o.so`, status: "ACTIVE" } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    const originStaff = (await loadAuthzUser(prisma, u.id))!;
    await saveCostSheet(prisma, originStaff, w1.id, "origin", { rate: "3" });
    // The spreadsheet saves one cell at a time: fields merge, "" clears one.
    await saveCostSheet(prisma, originStaff, w1.id, "origin", { awbCost: "50" });
    expect((await prisma.shipmentCostSheet.findUnique({ where: { shipmentId: w1.id } }))!.origin).toEqual({ rate: "3", awbCost: "50" });
    await saveCostSheet(prisma, originStaff, w1.id, "origin", { awbCost: "" });
    const row = (await listShipmentCosts(prisma, admin, TR, "AIR")).rows.find((r) => r.id === w1.id)!.row;
    expect([row.freight, row.originCost]).toEqual(["450", "480"]); // 3 × 150 kg; + 20 fatura + 10 delivery
    await expect(saveCostSheet(prisma, originStaff, w1.id, "mgq", { trpr: "10" })).rejects.toThrow(/permission/i);
    await expect(saveCostSheet(prisma, admin, w1.id, "origin", { rate: "abc" })).rejects.toThrow(/fields/);

    await lockYear(TR);
    await expect(saveCostSheet(prisma, admin, w1.id, "origin", { rate: "4" })).rejects.toThrow(/closed/);
  });
});

describe("Income & Out", () => {
  it("balance = collections − outs, per-bank count must match, and every out has a receipt", async () => {
    const { admin, w1, ia, salaam, cash } = await world();
    await addShipmentPayment(prisma, admin, { invoiceId: ia.id, amount: "930", bankId: salaam.id, receivedAt: D("2026-10-05") });
    await saveCostSheet(prisma, admin, w1.id, "origin", { rate: "2" }); // origin = 2 × 150 kg + 20 fatura + 10 delivery = 330
    const o = await addOut(prisma, admin, TR, { category: "SHIPMENT_COST", shipmentId: w1.id, stage: "ORIGIN", amount: "200", bankId: cash.id, paidAt: D("2026-10-06"), sentTo: "Istanbul agent", sentVia: "EVC Plus", sentAccount: "615123456" });
    expect(o.receiptNo).toMatch(/^RCP-2026-\d+$/);
    // Who it went to and how: kept apart, and printed on the voucher.
    const voucher = (await listReceipts(prisma, admin, TR, {})).find((r) => r.number === o.receiptNo)!;
    expect([voucher.party, voucher.via]).toEqual(["Istanbul agent", "EVC Plus 615123456"]);
    expect((await incomeAndOut(prisma, admin, TR)).outs.find((x) => x.receiptNo === o.receiptNo)).toMatchObject({ sentTo: "Istanbul agent", sentVia: "EVC Plus", sentAccount: "615123456" });
    await addOut(prisma, admin, TR, { category: "EXPENSE", amount: "30", bankId: salaam.id, paidAt: D("2026-10-07"), note: "Office" });

    let io = await incomeAndOut(prisma, admin, TR);
    expect(io.balance).toBe("700"); // 930 − 200 − 30
    expect(io.composition.reduce((a, r) => a + Number(r.remaining), 0)).toBeCloseTo(700, 2);
    const cost = io.composition.find((r) => r.key === "cost")!;
    expect([cost.in, cost.out]).toEqual(["330", "200"]);
    expect(io.composition.find((r) => r.key === "commission")!.in).toBe("100"); // invoice paid in full

    const all = await prisma.bank.findMany();
    await saveCashCount(prisma, admin, TR, all.map((b) => ({ bankId: b.id, amount: b.id === salaam.id ? "900" : "0" })));
    io = await incomeAndOut(prisma, admin, TR);
    expect(io.countMismatch).toBe(true); // 900 counted ≠ 700 balance
    await saveCashCount(prisma, admin, TR, all.map((b) => ({ bankId: b.id, amount: b.id === salaam.id ? "700" : "0" })));
    expect((await incomeAndOut(prisma, admin, TR)).countMismatch).toBe(false);

    const costs = await listShipmentCosts(prisma, admin, TR, "AIR");
    expect(costs.rows[0]!.paid.ORIGIN).toBe("200");
    await expect(addOut(prisma, admin, TR, { category: "SHIPMENT_COST", shipmentId: w1.id, amount: "1", bankId: cash.id, paidAt: D("2026-10-08") })).rejects.toThrow(/stage/);

    await reverseOut(prisma, admin, o.id);
    expect((await incomeAndOut(prisma, admin, TR)).balance).toBe("900");
    const rc = await listReceipts(prisma, admin, TR, { kind: "SHIPMENT_COST" });
    expect(rc[0]!.reversed).toBe(true);
  });

  it("commission is payable only once the customer paid in full, and never twice", async () => {
    const { admin, ia, salaam } = await world();
    await addShipmentPayment(prisma, admin, { invoiceId: ia.id, amount: "500", bankId: salaam.id, receivedAt: D("2026-10-05") });
    const pay = { category: "COMMISSION" as const, amount: "100", bankId: salaam.id, paidAt: D("2026-10-06"), sentTo: "Hamar", commissions: [{ invoiceId: ia.id, amount: "100" }] };
    await expect(addOut(prisma, admin, TR, pay)).rejects.toThrow(/paid in full/);
    await addShipmentPayment(prisma, admin, { invoiceId: ia.id, amount: "430", bankId: salaam.id, receivedAt: D("2026-10-06") });
    await addOut(prisma, admin, TR, { ...pay, amount: "60", commissions: [{ invoiceId: ia.id, amount: "60" }] });
    let c = (await listCommissions(prisma, admin, TR)).rows[0]!;
    expect([c.paid, c.status]).toEqual(["60", "Partial"]);
    await expect(addOut(prisma, admin, TR, { ...pay, amount: "50", commissions: [{ invoiceId: ia.id, amount: "50" }] })).rejects.toThrow(/still owed/);
    await addOut(prisma, admin, TR, { ...pay, amount: "40", commissions: [{ invoiceId: ia.id, amount: "40" }] });
    c = (await listCommissions(prisma, admin, TR)).rows[0]!;
    expect(c.status).toBe("Paid");
  });

  it("debts: lent → returned posts to income; partners are paid only from what we hold", async () => {
    const { admin, ia, ib, salaam, cash } = await world();
    await addShipmentPayment(prisma, admin, { invoiceId: ia.id, amount: "930", bankId: salaam.id, receivedAt: D("2026-10-05") });
    await addShipmentPayment(prisma, admin, { invoiceId: ib.id, amount: "400", bankId: salaam.id, receivedAt: D("2026-10-05") });
    const debt = await addOut(prisma, admin, TR, { category: "DEBT", amount: "100", bankId: cash.id, paidAt: D("2026-10-06"), sentTo: "Ali" });
    await expect(addOut(prisma, admin, TR, { category: "DEBT", amount: "5", bankId: cash.id, paidAt: D("2026-10-06") })).rejects.toThrow(/who took/);
    await returnDebt(prisma, admin, { debtId: debt.id, amount: "40", bankId: cash.id, returnedAt: D("2026-10-07") });
    await expect(returnDebt(prisma, admin, { debtId: debt.id, amount: "61", bankId: cash.id, returnedAt: D("2026-10-08") })).rejects.toThrow(/still owed/);
    const d = await listDebts(prisma, admin, TR);
    expect([d.rows[0]!.owed, d.rows[0]!.status, d.totals.returned]).toEqual(["60", "Partial", "40"]);
    expect((await incomeAndOut(prisma, admin, TR)).totals.debtReturned).toBe("40");

    // No sheets yet: cost = line fatura + delivery (30); profit = 1330 − 100 commission − 30 = 1200; split 43/50/7.
    const p = await partnersProfit(prisma, admin, TR);
    expect(p.applies).toBe(true);
    expect([p.somaliTransport.earned, p.mahad.earned]).toEqual(["600", "84"]);
    await expect(addOut(prisma, admin, TR, { category: "PROFIT_PAYOUT", partner: "MAHAD", amount: "100", bankId: salaam.id, paidAt: D("2026-10-08") })).rejects.toThrow(/hold/);
    await addOut(prisma, admin, TR, { category: "PROFIT_PAYOUT", partner: "MAHAD", amount: "80", bankId: salaam.id, paidAt: D("2026-10-08") });
    expect((await partnersProfit(prisma, admin, TR)).mahad.hold).toBe("4"); // 84 − 80
  });
});

describe("period closing", () => {
  it("the year closes only when everything is paid out; then nothing of it changes, whatever the date", async () => {
    const { admin, a, w1, ia, ib, salaam } = await world();
    await addShipmentPayment(prisma, admin, { invoiceId: ia.id, amount: "100", bankId: salaam.id, receivedAt: D("2026-10-05") });
    const writer = await staffWith(["accounting:read", "accounting:write"]);
    await expect(closePeriod(prisma, writer, TR, "YEAR")).rejects.toThrow(/permission/i);

    // W-1's cost (fatura + delivery = 30) is not paid, and what was collected for it is still held.
    const check = (await overview(prisma, admin, TR)).yearCheck!;
    expect(check.blockers.map((b) => b.key)).toEqual(["costDue", "cost"]);
    expect(check.blockers[0]!.detail).toEqual([{ code: "W-1", amount: "30" }]);
    expect(check.customersOwe).toEqual({ count: 2, amount: "1230" }); // 830 + 400 — not a stop
    await expect(closePeriod(prisma, admin, TR, "YEAR")).rejects.toThrow(/only Orbit profit/);
    await expect(closePeriod(prisma, admin, TR, "H2")).rejects.toThrow(/full year/);

    // W-48 style: the year is finished in January of the next year, still as 2026.
    await at("2027-01-20", async () => {
      await settle(admin, TR, salaam.id, D("2027-01-10"));
      await closePeriod(prisma, admin, TR, "YEAR");
    });
    await expect(closePeriod(prisma, admin, TR, "YEAR")).rejects.toThrow(/already closed/);

    // Locked, whatever the date: outs, payments, invoices, shipments, cost sheets.
    await at("2027-02-01", async () => {
      await expect(addOut(prisma, admin, TR, { category: "EXPENSE", amount: "5", bankId: salaam.id, paidAt: D("2027-01-25") })).rejects.toThrow(/year is closed/);
      await expect(addShipmentPayment(prisma, admin, { invoiceId: ib.id, amount: "10", bankId: salaam.id, receivedAt: D("2027-01-25") })).rejects.toThrow(/Accounting → Debts/);
    });
    await expect(saveCostSheet(prisma, admin, w1.id, "origin", { rate: "4" })).rejects.toThrow(/closed/);
    await expect(addShipmentLine(prisma, admin, w1.id, { customerId: a.id, packages: 1, chargeableWeightKg: "5", rate: "8" })).rejects.toThrow(/year is closed/);
    await expect(createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026, shipDate: D("2026-12-20") })).rejects.toThrow(/year is closed/);

    // 2027 opens with Orbit profit only, and the customers who still owe as debts.
    const next = { country: "Turkey", year: 2027 };
    const lines = await prisma.openingEntry.findMany({ where: { ...next, reversedAt: null } });
    expect(lines.every((e) => e.carried && e.fromYear === 2026)).toBe(true);
    const balance = (await incomeAndOut(prisma, admin, TR)).balance;
    const total = (k: string) => lines.filter((e) => e.kind === k).reduce((s, e) => s + Number(e.amount), 0).toFixed(2);
    expect([total("TOTAL"), total("BANK"), total("SOURCE")]).toEqual([Number(balance).toFixed(2), Number(balance).toFixed(2), Number(balance).toFixed(2)]);
    expect(lines.filter((e) => e.kind === "SOURCE").map((e) => e.source)).toEqual(["PROFIT"]);
    const owed = (await listDebts(prisma, admin, next)).rows;
    expect(owed.map((d) => [d.person.split(" — ")[1], d.note, d.owed]).sort()).toEqual([
      ["Alpha", `W-1 · ${ia.number}`, "830"],
      ["Beta", `W-1 · ${ib.number}`, "400"],
    ]);
    // The customer pays in 2027: the money is 2027's, the closed year is untouched.
    const beta = owed.find((d) => d.note?.includes(ib.number))!;
    await at("2027-02-01", () => returnDebt(prisma, admin, { debtId: beta.id, amount: "400", bankId: salaam.id, returnedAt: D("2027-01-30") }));
    expect((await incomeAndOut(prisma, admin, next)).balance).toBe(String(Number(balance) + 400));
    expect((await incomeAndOut(prisma, admin, TR)).balance).toBe(balance);
    await expect(reverseOpening(prisma, admin, beta.id)).rejects.toThrow(/carried/);
  });

  it("only a Super Admin reopens, from 2026 on; reopening the year takes back what it carried", async () => {
    const { admin, ib, salaam } = await world();
    await settle(admin, TR, salaam.id, D("2026-10-10"));
    await closePeriod(prisma, admin, TR, "YEAR");
    const manager = await staffWith(["accounting:read", "accounting:write", "accounting:manage"]);
    await expect(reopenPeriod(prisma, manager, TR, "YEAR")).rejects.toThrow(/Super Admin/);
    await expect(reopenPeriod(prisma, admin, { country: "Turkey", year: 2025 }, "YEAR")).rejects.toThrow(/before 2026/);
    await expect(closePeriod(prisma, admin, { country: "Turkey", year: 2025 }, "H1")).rejects.toThrow(/before 2026/);
    await expect(reopenPeriod(prisma, admin, TR, "H1")).rejects.toThrow(/not closed/);
    expect((await overview(prisma, manager, TR)).canReopen).toBe(false);
    expect((await overview(prisma, admin, TR)).canReopen).toBe(true);

    // A debt carried into 2027 that was already paid back stops the reopen.
    const next = { country: "Turkey", year: 2027 };
    const debt = (await listDebts(prisma, admin, next)).rows[0]!;
    await at("2027-02-01", () => returnDebt(prisma, admin, { debtId: debt.id, amount: "1", bankId: salaam.id, returnedAt: D("2027-01-30") }));
    await expect(reopenPeriod(prisma, admin, TR, "YEAR")).rejects.toThrow(/already returned/);
    await prisma.debtReturn.deleteMany({});

    await reopenPeriod(prisma, admin, TR, "YEAR");
    expect(await prisma.openingEntry.count({ where: { ...next, reversedAt: null } })).toBe(0);
    expect(await prisma.periodClose.count({ where: { reopenedAt: { not: null }, reopenedBy: admin.id } })).toBe(1);
    await addShipmentPayment(prisma, admin, { invoiceId: ib.id, amount: "400", bankId: salaam.id, receivedAt: D("2026-10-20") });
    await settle(admin, TR, salaam.id, D("2026-10-21")); // Beta's money makes partners' shares to pay out
    // Closed again: the carry is written anew from the corrected year.
    await closePeriod(prisma, admin, TR, "YEAR");
    const carried = await prisma.openingEntry.findMany({ where: { ...next, reversedAt: null, kind: "DEBT" } });
    expect(carried.map((e) => e.note)).toEqual([expect.stringContaining("W-1")]); // only Alpha still owes
  });
});

describe("opening balance from earlier years", () => {
  it("a year's balance first, then the banks that must equal it; it is Orbit profit and adds to the company balance", async () => {
    const { admin, salaam, cash } = await world();
    const writer = await (async () => {
      const r = await prisma.role.create({ data: { key: `w-${uniq()}`, name: "w" } });
      for (const k of ["accounting:read", "accounting:write"]) {
        const p = await prisma.permission.upsert({ where: { key: k }, create: { key: k }, update: {} });
        await prisma.rolePermission.create({ data: { roleId: r.id, permissionId: p.id } });
      }
      const u = await prisma.user.create({ data: { email: `${uniq()}@o.so`, status: "ACTIVE" } });
      await prisma.userRole.create({ data: { userId: u.id, roleId: r.id } });
      return (await loadAuthzUser(prisma, u.id))!;
    })();
    const y2025 = {
      fromYear: 2025,
      total: "1000",
      banks: [
        { bankId: salaam.id, amount: "700" },
        { bankId: cash.id, amount: "300" },
      ],
    };
    await expect(saveOpeningYear(prisma, writer, TR, y2025)).rejects.toThrow(/permission/i);
    await expect(saveOpeningYear(prisma, admin, TR, { ...y2025, fromYear: 2026 })).rejects.toThrow(/year/);
    await expect(saveOpeningYear(prisma, admin, TR, { ...y2025, total: "0" })).rejects.toThrow(/balance/);
    await expect(saveOpeningYear(prisma, admin, TR, { ...y2025, banks: [{ bankId: salaam.id, amount: "700" }] })).rejects.toThrow(/banks must add up/);

    await saveOpeningYear(prisma, admin, TR, y2025);
    await saveOpeningYear(prisma, admin, TR, { fromYear: 2024, total: "-200", banks: [{ bankId: cash.id, amount: "-200" }] });

    let op = await listOpening(prisma, admin, TR);
    const y = op.years.find((x) => x.fromYear === 2025)!;
    expect(y.total).toBe("1000");
    expect(y.banks.map((b) => b.amount).sort()).toEqual(["300", "700"]); // only what was typed
    // The whole balance is Orbit profit (owner 2026-10-25).
    expect(op.history.filter((h) => h.fromYear === 2025 && h.kind === "SOURCE").map((h) => [h.source, h.amount])).toEqual([["PROFIT", "1000"]]);

    let io = await incomeAndOut(prisma, admin, TR);
    expect(io.opening).toBe("800"); // 1000 − 200
    expect(io.balance).toBe("800");
    expect(io.perBank.find((b) => b.bankId === salaam.id)!.opening).toBe("700");
    expect(io.perBank.find((b) => b.bankId === cash.id)!.opening).toBe("100");
    const row = (k: string) => io.composition.find((r) => r.key === k)!;
    expect([row("transfer").opening, row("orbit").opening, row("mah").opening]).toEqual(["0", "800", "0"]);
    expect((await partnersProfit(prisma, admin, TR)).mahad.hold).toBe("0");

    // Saving the year again replaces it; the old lines stay, reversed.
    await saveOpeningYear(prisma, admin, TR, { ...y2025, total: "1200", banks: [{ bankId: salaam.id, amount: "1200" }] });
    op = await listOpening(prisma, admin, TR);
    expect(op.years.find((x) => x.fromYear === 2025)!.banks).toHaveLength(1);
    expect(op.history.filter((h) => h.fromYear === 2025 && h.reversed)).toHaveLength(4);
    expect((await incomeAndOut(prisma, admin, TR)).balance).toBe("1000");

    // Remove a year: it stops counting, history kept.
    await removeOpeningYear(prisma, admin, TR, 2024);
    expect((await incomeAndOut(prisma, admin, TR)).balance).toBe("1200");
    expect((await listOpening(prisma, admin, TR)).years.map((x) => x.fromYear)).toEqual([2025]);

    // A debt from an earlier year: listed in Debts, repaid as income.
    await expect(addOpeningDebt(prisma, admin, TR, { fromYear: 2025, amount: "-5", person: "Ali" })).rejects.toThrow(/positive/);
    await expect(addOpeningDebt(prisma, admin, TR, { fromYear: 2025, amount: "50", person: "" })).rejects.toThrow(/who owes/);
    const debt = await addOpeningDebt(prisma, admin, TR, { fromYear: 2025, amount: "80", person: "Ali Hassan" });
    expect((await incomeAndOut(prisma, admin, TR)).balance).toBe("1200"); // not money in hand
    const d = (await listDebts(prisma, admin, TR)).rows.find((r) => r.id === debt.id)!;
    expect([d.fromYear, d.owed]).toEqual([2025, "80"]);
    await returnDebt(prisma, admin, { debtId: debt.id, amount: "30", bankId: cash.id, returnedAt: D("2026-10-10") });
    io = await incomeAndOut(prisma, admin, TR);
    expect(io.balance).toBe("1230");
    expect(io.perBank.find((b) => b.bankId === cash.id)!.in).toBe("30");
    await expect(reverseOpening(prisma, admin, debt.id)).rejects.toThrow(/returns/);

    // Locked once the first half of the year is closed.
    await closePeriod(prisma, admin, TR, "H1");
    expect((await listOpening(prisma, admin, TR)).locked).toBe(true);
    await expect(saveOpeningYear(prisma, admin, TR, y2025)).rejects.toThrow(/closed/);
  });

  it("closing a year carries its balance, banks, Orbit profit and open debts into the next", async () => {
    const { admin, ia, salaam } = await world();
    await addShipmentPayment(prisma, admin, { invoiceId: ia.id, amount: "100", bankId: salaam.id, receivedAt: D("2026-10-05") });
    await saveOpeningYear(prisma, admin, TR, { fromYear: 2025, total: "50", banks: [{ bankId: salaam.id, amount: "50" }] });
    await addOpeningDebt(prisma, admin, TR, { fromYear: 2025, amount: "20", person: "Omar" });
    await settle(admin, TR, salaam.id, D("2026-10-06"));
    const balance = (await incomeAndOut(prisma, admin, TR)).balance;
    await closePeriod(prisma, admin, TR, "YEAR");
    const next = await listOpening(prisma, admin, { country: "Turkey", year: 2027 });
    const y = next.years.find((x) => x.fromYear === 2026)!;
    expect([y.total, y.carried]).toEqual([balance, true]);
    expect(y.banks).toEqual([expect.objectContaining({ bankId: salaam.id, amount: balance })]);
    expect(next.history.filter((h) => h.fromYear === 2026 && h.kind === "SOURCE").map((h) => [h.source, h.amount])).toEqual([["PROFIT", balance]]);
    expect(y.debts.map((x) => x.person)).toEqual(expect.arrayContaining(["Omar", expect.stringContaining("Alpha"), expect.stringContaining("Beta")]));
    expect((await incomeAndOut(prisma, admin, { country: "Turkey", year: 2027 })).balance).toBe(balance);
    // A carried year is not typed: it can't be added, edited or paid "for" from 2027.
    await expect(saveOpeningYear(prisma, admin, { country: "Turkey", year: 2027 }, { fromYear: 2026, total: "1", banks: [{ bankId: salaam.id, amount: "1" }] })).rejects.toThrow(/carried automatically/);
    expect((await outFormOptions(prisma, admin, { country: "Turkey", year: 2027 })).earlierYears).toEqual([]);
  });

  it("an out paid now for an earlier year comes out of that year's Orbit profit, once, with its receipt", async () => {
    const { admin, salaam } = await world();
    await saveOpeningYear(prisma, admin, TR, { fromYear: 2025, total: "1000", banks: [{ bankId: salaam.id, amount: "1000" }] });
    const out = (x: Partial<Parameters<typeof addOut>[3]>) => addOut(prisma, admin, TR, { category: "SHIPMENT_COST", amount: "300", bankId: salaam.id, paidAt: D("2026-10-12"), forYear: 2025, ...x });
    await expect(out({ reference: "" })).rejects.toThrow(/W-30/);
    await expect(out({ amount: "1000.01", reference: "W-30" })).rejects.toThrow(/left from that year/);
    await expect(out({ forYear: 2024, reference: "W-30" })).rejects.toThrow(/no opening balance/);
    await expect(out({ category: "DEBT", sentTo: "Ali", reference: "x" })).rejects.toThrow(/cannot belong/);
    await expect(out({ category: "PROFIT_PAYOUT", partner: "MAHAD", amount: "100" })).rejects.toThrow(/cannot belong/);
    const w30 = await out({ reference: "W-30", sentTo: "Istanbul agent" });
    await out({ category: "TRANSFER", amount: "600", sentTo: "Hodan" });
    await expect(out({ category: "EXPENSE", amount: "100.01" })).rejects.toThrow(/left from that year/);

    // One deduction, from Orbit profit: this year's parts are untouched.
    const io = await incomeAndOut(prisma, admin, TR);
    expect(io.balance).toBe("100"); // 1000 − 300 − 600
    const r = (k: string) => io.composition.find((x) => x.key === k)!;
    expect([r("cost").out, r("cost").remaining, r("transfer").remaining]).toEqual(["0", "0", "0"]);
    expect([r("orbit").opening, r("orbit").out, r("orbit").remaining]).toEqual(["1000", "900", "100"]);
    expect(io.outs.find((o) => o.id === w30.id)).toMatchObject({ forYear: 2025, reference: "W-30" });

    // The year shows what was paid for it, with the receipts, and what is left.
    const y = (await listOpening(prisma, admin, TR)).years.find((x) => x.fromYear === 2025)!;
    expect(y.paidAfter.map((p) => [p.what, p.amount, p.receiptNo])).toEqual([
      ["W-30", "300", w30.receiptNo],
      [null, "600", expect.stringMatching(/^RCP-2026-/)],
    ]);
    expect([y.paidTotal, y.left]).toEqual(["900", "100"]);
    const rc = (await listReceipts(prisma, admin, TR, {})).find((r) => r.number === w30.receiptNo)!;
    expect(rc.note).toContain("For 2025 · W-30");
    expect((await outFormOptions(prisma, admin, TR)).earlierYears).toEqual([{ fromYear: 2025, left: "100" }]);
  });

  it("an earlier-year out is only for a typed year before 2026, with the shipment typed in", async () => {
    const { admin, w1, salaam } = await world();
    await saveOpeningYear(prisma, admin, TR, { fromYear: 2025, total: "100", banks: [{ bankId: salaam.id, amount: "100" }] });
    const base = { category: "SHIPMENT_COST" as const, amount: "10", bankId: salaam.id, paidAt: D("2026-10-12") };
    await expect(addOut(prisma, admin, TR, { ...base, forYear: 2025, shipmentId: w1.id, stage: "ORIGIN", reference: "W-1" })).rejects.toThrow(/Shipment not found/);
    await expect(addOut(prisma, admin, TR, { ...base, forYear: 2026, reference: "W-1" })).rejects.toThrow(/year it belongs to/);
    await addOut(prisma, admin, TR, { ...base, forYear: 2025, reference: "W-30" });
  });
});
