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
  partnersProfit,
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
import { assertTestDatabase, prisma, resetDb } from "./helpers";

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
  const a = await createCustomer(prisma, admin, { name: "Alpha", company: "Alpha" });
  const b = await createCustomer(prisma, admin, { name: "Beta", company: "Beta" });
  const w1 = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026, shipDate: D("2026-10-01") });
  await addShipmentLine(prisma, admin, w1.id, { customerId: a.id, packages: 4, chargeableWeightKg: "100", rate: "8", delivery: "10", fatura: "20" });
  await addShipmentLine(prisma, admin, w1.id, { customerId: b.id, packages: 2, chargeableWeightKg: "50", rate: "8" });
  const ia = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: a.id, billedMeasure: "100", baseRate: "8", agentName: "Hamar", agentRate: "1", fatura: "20", localDelivery: "10" }); // 900 + 30 = 930
  const ib = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: b.id, billedMeasure: "50", baseRate: "8" }); // 400
  const banks = await prisma.bank.findMany({ orderBy: { sortOrder: "asc" } });
  return { admin, a, b, w1, ia, ib, salaam: banks[0]!, cash: banks[3]! };
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

    await closePeriod(prisma, admin, TR, "H2");
    await expect(saveCostSheet(prisma, admin, w1.id, "origin", { rate: "4" })).rejects.toThrow(/closed/);
  });
});

describe("Income & Out", () => {
  it("balance = collections − outs, per-bank count must match, and every out has a receipt", async () => {
    const { admin, w1, ia, salaam, cash } = await world();
    await addShipmentPayment(prisma, admin, { invoiceId: ia.id, amount: "930", bankId: salaam.id, receivedAt: D("2026-10-05") });
    await saveCostSheet(prisma, admin, w1.id, "origin", { rate: "2" }); // origin = 2 × 150 kg + 20 fatura + 10 delivery = 330
    const o = await addOut(prisma, admin, TR, { category: "SHIPMENT_COST", shipmentId: w1.id, stage: "ORIGIN", amount: "200", bankId: cash.id, paidAt: D("2026-10-06"), sentTo: "Istanbul agent" });
    expect(o.receiptNo).toMatch(/^RCP-2026-\d+$/);
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
  it("locks Finance and Accounting in the period and carries the year balance forward", async () => {
    const { admin, ia, ib, salaam } = await world();
    await addShipmentPayment(prisma, admin, { invoiceId: ia.id, amount: "100", bankId: salaam.id, receivedAt: D("2026-10-05") });
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
    await expect(closePeriod(prisma, writer, TR, "YEAR")).rejects.toThrow(/permission/i);
    await closePeriod(prisma, admin, TR, "YEAR");
    await expect(closePeriod(prisma, admin, TR, "YEAR")).rejects.toThrow(/already closed/);
    await expect(addShipmentPayment(prisma, admin, { invoiceId: ib.id, amount: "10", bankId: salaam.id, receivedAt: D("2026-10-20") })).rejects.toThrow(/closed/);
    await expect(addOut(prisma, admin, TR, { category: "EXPENSE", amount: "5", bankId: salaam.id, paidAt: D("2026-10-21") })).rejects.toThrow(/closed/);
    // 2027 opens with 2026's balance; its banks and parts each add up to it.
    const next = await prisma.openingEntry.findMany({ where: { country: "Turkey", year: 2027 } });
    expect(next.every((e) => e.carried && e.fromYear === 2026)).toBe(true);
    const total = (k: string) => next.filter((e) => e.kind === k).reduce((a, e) => a + Number(e.amount), 0);
    expect([total("TOTAL"), total("BANK"), total("SOURCE")]).toEqual([100, 100, 100]);
    expect((await incomeAndOut(prisma, admin, { country: "Turkey", year: 2027 })).balance).toBe("100");
  });
});

describe("opening balance from earlier years", () => {
  it("a year's balance first, then banks and parts that must equal it; it adds to the company balance", async () => {
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
      parts: [
        { source: "TRANSFER" as const, amount: "600" },
        { source: "PROFIT" as const, amount: "350" },
        { source: "MAHAD" as const, amount: "50" },
      ],
    };
    await expect(saveOpeningYear(prisma, writer, TR, y2025)).rejects.toThrow(/permission/i);
    await expect(saveOpeningYear(prisma, admin, TR, { ...y2025, fromYear: 2026 })).rejects.toThrow(/year/);
    await expect(saveOpeningYear(prisma, admin, TR, { ...y2025, total: "0" })).rejects.toThrow(/balance/);
    await expect(saveOpeningYear(prisma, admin, TR, { ...y2025, banks: [{ bankId: salaam.id, amount: "700" }] })).rejects.toThrow(/banks must add up/);
    await expect(saveOpeningYear(prisma, admin, TR, { ...y2025, parts: [{ source: "TRANSFER", amount: "600" }] })).rejects.toThrow(/parts must add up/);
    await expect(saveOpeningYear(prisma, admin, TR, { ...y2025, parts: [{ source: "DEBT", amount: "1000" }] })).rejects.toThrow(/came from/);
    // Partners' parts only where the country splits profit.
    await expect(saveOpeningYear(prisma, admin, { country: "India", year: 2026 }, { ...y2025, banks: [{ bankId: salaam.id, amount: "1000" }], parts: [{ source: "MAHAD", amount: "1000" }] })).rejects.toThrow();

    await saveOpeningYear(prisma, admin, TR, y2025);
    await saveOpeningYear(prisma, admin, TR, { fromYear: 2024, total: "-200", banks: [{ bankId: cash.id, amount: "-200" }], parts: [{ source: "TRANSFER", amount: "-200" }] });

    let op = await listOpening(prisma, admin, TR);
    const y = op.years.find((x) => x.fromYear === 2025)!;
    expect(y.total).toBe("1000");
    expect(y.banks.map((b) => b.amount).sort()).toEqual(["300", "700"]); // only what was typed
    expect(y.parts.map((p) => p.source).sort()).toEqual(["MAHAD", "PROFIT", "TRANSFER"]);
    expect(op.parts).toContain("SOMALI_TRANSPORT");

    let io = await incomeAndOut(prisma, admin, TR);
    expect(io.opening).toBe("800"); // 1000 − 200
    expect(io.balance).toBe("800");
    expect(io.perBank.find((b) => b.bankId === salaam.id)!.opening).toBe("700");
    expect(io.perBank.find((b) => b.bankId === cash.id)!.opening).toBe("100");
    const row = (k: string) => io.composition.find((r) => r.key === k)!;
    expect([row("transfer").opening, row("orbit").opening, row("mah").opening]).toEqual(["400", "350", "50"]);
    expect((await partnersProfit(prisma, admin, TR)).mahad.hold).toBe("50");

    // Saving the year again replaces it; the old lines stay, reversed.
    await saveOpeningYear(prisma, admin, TR, { ...y2025, total: "1200", banks: [{ bankId: salaam.id, amount: "1200" }], parts: [{ source: "PROFIT", amount: "1200" }] });
    op = await listOpening(prisma, admin, TR);
    expect(op.years.find((x) => x.fromYear === 2025)!.banks).toHaveLength(1);
    expect(op.history.filter((h) => h.fromYear === 2025 && h.reversed)).toHaveLength(6);
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

  it("closing a year carries its balance, banks, parts and open debts into the next", async () => {
    const { admin, ia, salaam } = await world();
    await addShipmentPayment(prisma, admin, { invoiceId: ia.id, amount: "100", bankId: salaam.id, receivedAt: D("2026-10-05") });
    await saveOpeningYear(prisma, admin, TR, { fromYear: 2025, total: "50", banks: [{ bankId: salaam.id, amount: "50" }], parts: [{ source: "PROFIT", amount: "50" }] });
    await addOpeningDebt(prisma, admin, TR, { fromYear: 2025, amount: "20", person: "Omar" });
    await closePeriod(prisma, admin, TR, "YEAR");
    const next = await listOpening(prisma, admin, { country: "Turkey", year: 2027 });
    const y = next.years.find((x) => x.fromYear === 2026)!;
    expect([y.total, y.carried]).toEqual(["150", true]);
    expect(y.banks).toEqual([expect.objectContaining({ bankId: salaam.id, amount: "150" })]);
    expect(y.parts.reduce((a, p) => a + Number(p.amount), 0)).toBe(150);
    expect(y.debts.map((x) => [x.person, x.amount])).toEqual([["Omar", "20"]]);
    expect((await incomeAndOut(prisma, admin, { country: "Turkey", year: 2027 })).balance).toBe("150");
  });

  it("an out paid now for an earlier year comes out of what that year left, once, with its receipt", async () => {
    const { admin, salaam } = await world();
    await saveOpeningYear(prisma, admin, TR, {
      fromYear: 2025,
      total: "1000",
      banks: [{ bankId: salaam.id, amount: "1000" }],
      parts: [
        { source: "SHIPMENT_COST", amount: "400" },
        { source: "TRANSFER", amount: "500" },
        { source: "MAHAD", amount: "100" },
      ],
    });
    const out = (x: Partial<Parameters<typeof addOut>[3]>) => addOut(prisma, admin, TR, { category: "SHIPMENT_COST", amount: "300", bankId: salaam.id, paidAt: D("2026-10-12"), forYear: 2025, ...x });
    await expect(out({ reference: "" })).rejects.toThrow(/W-30/);
    await expect(out({ amount: "500", reference: "W-30" })).rejects.toThrow(/left from that year/);
    await expect(out({ forYear: 2024, reference: "W-30" })).rejects.toThrow(/no opening balance/);
    await expect(out({ category: "DEBT", sentTo: "Ali", reference: "x" })).rejects.toThrow(/cannot belong/);
    const w30 = await out({ reference: "W-30", sentTo: "Istanbul agent" });
    await out({ category: "PROFIT_PAYOUT", partner: "MAHAD", amount: "100" });
    await expect(out({ category: "PROFIT_PAYOUT", partner: "MAHAD", amount: "1" })).rejects.toThrow(/left from that year/);

    // One deduction: the balance and the shipment-cost row drop once.
    const io = await incomeAndOut(prisma, admin, TR);
    expect(io.balance).toBe("600"); // 1000 − 300 − 100
    const cost = io.composition.find((r) => r.key === "cost")!;
    expect([cost.opening, cost.out, cost.remaining]).toEqual(["400", "300", "100"]);
    expect(io.composition.find((r) => r.key === "mah")!.remaining).toBe("0");
    expect(io.outs.find((o) => o.id === w30.id)).toMatchObject({ forYear: 2025, reference: "W-30" });

    // The year shows what was paid for it, with the receipts, and what is left.
    const y = (await listOpening(prisma, admin, TR)).years.find((x) => x.fromYear === 2025)!;
    expect(y.parts.find((p) => p.source === "SHIPMENT_COST")).toMatchObject({ paid: "300", left: "100" });
    expect(y.paidAfter.map((p) => [p.what, p.amount, p.receiptNo])).toEqual([
      ["W-30", "300", w30.receiptNo],
      [null, "100", expect.stringMatching(/^RCP-2026-/)],
    ]);
    expect(y.paidTotal).toBe("400");
    const rc = (await listReceipts(prisma, admin, TR, {})).find((r) => r.number === w30.receiptNo)!;
    expect(rc.note).toContain("For 2025 · W-30");
    expect((await outFormOptions(prisma, admin, TR)).earlierYears[0]!.parts.find((p) => p.source === "SHIPMENT_COST")!.left).toBe("100");
  });

  it("a shipment of a closed year that is in the system can be paid the next year", async () => {
    const { admin, ia, w1, salaam } = await world();
    await addShipmentPayment(prisma, admin, { invoiceId: ia.id, amount: "100", bankId: salaam.id, receivedAt: D("2026-10-05") });
    await closePeriod(prisma, admin, TR, "YEAR");
    const next = { country: "Turkey", year: 2027 };
    const left = (await listOpening(prisma, admin, next)).years[0]!.parts.find((p) => p.source === "SHIPMENT_COST")!.amount;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-01-15T12:00:00Z"));
    try {
      await addOut(prisma, admin, next, { category: "SHIPMENT_COST", amount: left, bankId: salaam.id, paidAt: D("2027-01-10"), forYear: 2026, shipmentId: w1.id, stage: "ORIGIN" });
    } finally {
      vi.useRealTimers();
    }
    expect((await listShipmentCosts(prisma, admin, TR, "AIR")).rows.find((r) => r.id === w1.id)!.paid.ORIGIN).toBe(left);
    expect((await incomeAndOut(prisma, admin, next)).balance).toBe(String(100 - Number(left)));
    expect((await incomeAndOut(prisma, admin, TR)).balance).toBe("100"); // the closed year is not touched
  });
});
