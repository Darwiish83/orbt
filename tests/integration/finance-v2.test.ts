import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { resolveAdminScope } from "@/modules/authz/adminScope";
import { createCustomer } from "@/modules/customers/service";
import {
  approveDemurrage,
  buildStatement,
  listDemurrage,
  listDueInvoices,
  listExtraMeasure,
  listInvoiceRevisions,
  markCargoCollected,
  sendDemurrageWarning,
  sendPaymentReminders,
  setExtraFreeDays,
} from "@/modules/finance/ledger";
import {
  addShipmentPayment,
  createShipmentInvoice,
  deleteShipmentInvoice,
  deleteShipmentPayment,
  editShipmentPayment,
  getInvoiceDocument,
  listFinanceShipments,
  shipmentCustomers,
  shipmentPayments,
  updateShipmentInvoice,
} from "@/modules/finance/shipmentFinance";
import { addShipmentLine, createShipment, listShipments } from "@/modules/shipments/service";
import { assertTestDatabase, prisma, resetDb, testPhone } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;
const TR = { country: "Turkey", year: 2026 };

async function superAdmin(): Promise<AuthzUser> {
  const role = await prisma.role.upsert({ where: { key: "super_admin" }, create: { key: "super_admin", name: "Super Admin" }, update: {} });
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

async function staff(perms: string[], country: string | null = null): Promise<AuthzUser> {
  const role = await prisma.role.create({ data: { key: `role-${uniq()}`, name: "role" } });
  for (const p of perms) {
    const permission = await prisma.permission.upsert({ where: { key: p }, create: { key: p }, update: {} });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, country } });
  return (await loadAuthzUser(prisma, user.id))!;
}

const FIN = ["invoices:manage", "payments:manage"];

/** Turkey W-1: customer A (120 kg + 8 kg MIX, rate 6, quality 0.5, fatura 20) and B (50 kg). */
async function world() {
  const admin = await superAdmin();
  const a = await createCustomer(prisma, admin, { name: "Alpha Co", company: "Alpha Co", phone: testPhone() });
  const b = await createCustomer(prisma, admin, { name: "Beta Co", company: "Beta Co", phone: testPhone() });
  const w1 = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
  await addShipmentLine(prisma, admin, w1.id, { customerId: a.id, packages: 10, chargeableWeightKg: "120", rate: "6", qualityRate: "0.5", fatura: "20" });
  await addShipmentLine(prisma, admin, w1.id, { customerId: a.id, mixCount: 2, mixKg: "8" });
  await addShipmentLine(prisma, admin, w1.id, { customerId: b.id, packages: 3, chargeableWeightKg: "50", rate: "6" });
  const salaam = await prisma.bank.findUniqueOrThrow({ where: { name: "Salaam Bank" } });
  const cash = await prisma.bank.findUniqueOrThrow({ where: { name: "Cash" } });
  return { admin, a, b, w1, salaam, cash };
}

const inv = (billed: string, extra: Record<string, unknown> = {}) => ({ billedMeasure: billed, baseRate: "6", qualityRate: "0.5", fatura: "20", ...extra });

// ------------------------------------------------------------------ scope

describe("admin Year + Country scope", () => {
  it("defaults to the current year and the first allowed country, and ignores what the user may not use", async () => {
    const admin = await superAdmin();
    const s = await resolveAdminScope(prisma, admin, {});
    expect(s.year).toBe(2026);
    expect(s.countries.map((c) => c.name)).toEqual(["Turkey", "India"]);
    expect((await resolveAdminScope(prisma, admin, { country: "india", year: 1999 })).country).toBe("India");

    const indiaOnly = await staff(["invoices:read"], "India");
    const r = await resolveAdminScope(prisma, indiaOnly, { country: "Turkey" });
    expect(r.country).toBe("India");
    expect(r.countries.map((c) => c.name)).toEqual(["India"]);
  });

  it("a country filter can no longer widen a staff member's shipment scope", async () => {
    const { w1 } = await world();
    const indiaOnly = await staff(["shipments:read"], "India");
    await expect(listShipments(prisma, indiaOnly, { country: "Turkey" })).rejects.toThrow(/scope/i);
    const own = await listShipments(prisma, indiaOnly, {});
    expect(own.items.map((s) => s.id)).not.toContain(w1.id);
  });
});

// ------------------------------------------------------------------ invoices

describe("shipment invoices (spec B9)", () => {
  it("groups MIX entries per customer and offers the line values as defaults", async () => {
    const { admin, w1, a } = await world();
    const rows = await shipmentCustomers(prisma, admin, w1.id);
    const alpha = rows.find((r) => r.customerId === a.id)!;
    expect(alpha.defaults.actualMeasure).toBe("128");
    expect(alpha.packages).toBe(12);
    expect(alpha.defaults.baseRate).toBe("6");
    expect(alpha.defaults.fatura).toBe("20");
    const list = await listFinanceShipments(prisma, admin, TR, { mode: "AIR" });
    expect(list[0]).toMatchObject({ code: "W-1", measure: "178", packages: 15 });
  });

  it("computes the invoice on the server: combined rate, quality line, commission kept apart", async () => {
    const { admin, w1, a } = await world();
    const i = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: a.id, ...inv("130", { agentName: "Hamar", agentRate: "1", discount: "10" }) });
    // 130 × (6 + 1) + 130 × 0.5 + 20 − 10
    expect(i.total.toString()).toBe("985");
    expect(i.actualMeasure!.toString()).toBe("128");
    expect(i.commissionAmount.toString()).toBe("130");
    const doc = await getInvoiceDocument(prisma, admin, i.id);
    expect(doc.lines.map((l) => [l.category, l.unitPrice])).toEqual([
      ["FREIGHT", "7"],
      ["QUALITY", "0.5"],
      ["FATURA", "20"],
    ]);
  });

  it("allows one live invoice per customer per shipment and only for customers in it", async () => {
    const { admin, w1, a } = await world();
    const stranger = await createCustomer(prisma, admin, { name: "Gamma", company: "Gamma", phone: testPhone() });
    await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: a.id, ...inv("128") });
    await expect(createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: a.id, ...inv("128") })).rejects.toThrow(/already has an invoice/);
    await expect(createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: stranger.id, ...inv("10") })).rejects.toThrow(/not in the shipment/);
  });

  it("enforces permission and country scope on every invoice action", async () => {
    const { w1, a } = await world();
    const reader = await staff(["invoices:read"]);
    await expect(createShipmentInvoice(prisma, reader, { shipmentId: w1.id, customerId: a.id, ...inv("128") })).rejects.toThrow(/permission/i);
    const indiaFinance = await staff(FIN, "India");
    await expect(createShipmentInvoice(prisma, indiaFinance, { shipmentId: w1.id, customerId: a.id, ...inv("128") })).rejects.toThrow(/scope/i);
    await expect(shipmentCustomers(prisma, indiaFinance, w1.id)).rejects.toThrow(/scope/i);
  });

  it("logs each changed field in Invoice History and refuses a total below what was paid", async () => {
    const { admin, w1, a, salaam } = await world();
    const i = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: a.id, ...inv("128") });
    await addShipmentPayment(prisma, admin, { invoiceId: i.id, amount: "500", bankId: salaam.id, receivedAt: new Date("2026-10-10T12:00:00Z") });

    const updated = await updateShipmentInvoice(prisma, admin, i.id, inv("130", { baseRate: "6.5", discount: "5" }));
    expect(updated.total.toString()).toBe(String(130 * 6.5 + 65 + 20 - 5));
    expect(updated.status).toBe("PARTIAL");
    const revs = await listInvoiceRevisions(prisma, admin, TR, { invoiceId: i.id });
    expect(revs.map((r) => r.field).sort()).toEqual(["Discount (USD)", "Quantity", "Rate (USD)", "Total Amount (USD)"].sort());
    expect(revs.find((r) => r.field === "Rate (USD)")).toMatchObject({ before: "6", after: "6.5" });

    await expect(updateShipmentInvoice(prisma, admin, i.id, inv("10", { qualityRate: "0", fatura: "0" }))).rejects.toThrow(/below the amount already paid/);
  });

  it("delete = void, only without payments, and the row's Create Invoice comes back", async () => {
    const { admin, w1, a, b, cash } = await world();
    const i = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: a.id, ...inv("128") });
    const j = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: b.id, billedMeasure: "50", baseRate: "6" });
    await addShipmentPayment(prisma, admin, { invoiceId: j.id, amount: "10", bankId: cash.id, receivedAt: new Date() });
    await expect(deleteShipmentInvoice(prisma, admin, j.id)).rejects.toThrow(/payments/);

    const finStaff = await staff(["invoices:write"]);
    await expect(deleteShipmentInvoice(prisma, finStaff, i.id)).rejects.toThrow(/permission/i);
    await deleteShipmentInvoice(prisma, admin, i.id);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: i.id } })).status).toBe("VOID");
    const rows = await shipmentCustomers(prisma, admin, w1.id);
    expect(rows.find((r) => r.customerId === a.id)!.invoice).toBeNull();
    // and a fresh invoice can be created again
    await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: a.id, ...inv("128") });
  });
});

// ------------------------------------------------------------------ payments

describe("shipment payments", () => {
  it("moves Unpaid → Partial → Paid, issues a receipt and notifies the customer", async () => {
    const { admin, w1, b, salaam } = await world();
    const i = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: b.id, billedMeasure: "50", baseRate: "6" });
    await addShipmentPayment(prisma, admin, { invoiceId: i.id, amount: "100", bankId: salaam.id, receivedAt: new Date("2026-10-11T12:00:00Z") });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: i.id } })).status).toBe("PARTIAL");
    await addShipmentPayment(prisma, admin, { invoiceId: i.id, amount: "200", bankId: salaam.id, receivedAt: new Date("2026-10-12T12:00:00Z") });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: i.id } })).status).toBe("PAID");

    const pays = await shipmentPayments(prisma, admin, w1.id);
    expect(pays.map((p) => [p.receiptNo, p.bank, p.amount])).toEqual([
      ["RCP-2026-1001", "Salaam Bank", "100"],
      ["RCP-2026-1002", "Salaam Bank", "200"],
    ]);
    const notes = await prisma.notification.findMany({ where: { customerId: b.id, type: "payment" } });
    expect(notes).toHaveLength(2);
    expect(notes.every((n) => n.status === "SENT" && n.title === "Payment received ✓")).toBe(true);
  });

  it("is idempotent on a double submit and refuses over-payment, a missing bank and a future date", async () => {
    const { admin, w1, b, salaam } = await world();
    const i = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: b.id, billedMeasure: "50", baseRate: "6" });
    const key = crypto.randomUUID();
    const p1 = await addShipmentPayment(prisma, admin, { invoiceId: i.id, amount: "50", bankId: salaam.id, receivedAt: new Date(), idempotencyKey: key });
    const p2 = await addShipmentPayment(prisma, admin, { invoiceId: i.id, amount: "50", bankId: salaam.id, receivedAt: new Date(), idempotencyKey: key });
    expect(p2.id).toBe(p1.id);
    expect(await prisma.payment.count()).toBe(1);

    await expect(addShipmentPayment(prisma, admin, { invoiceId: i.id, amount: "251", bankId: salaam.id, receivedAt: new Date() })).rejects.toThrow(/balance/);
    await expect(addShipmentPayment(prisma, admin, { invoiceId: i.id, amount: "1", bankId: "nope", receivedAt: new Date() })).rejects.toThrow(/bank/i);
    await expect(addShipmentPayment(prisma, admin, { invoiceId: i.id, amount: "1", bankId: salaam.id, receivedAt: new Date(Date.now() + 5 * 86_400_000) })).rejects.toThrow(/future/);
  });

  it("concurrent payments can never push an invoice past its total", async () => {
    const { admin, w1, b, cash } = await world();
    const i = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: b.id, billedMeasure: "50", baseRate: "6" }); // 300
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => addShipmentPayment(prisma, admin, { invoiceId: i.id, amount: "100", bankId: cash.id, receivedAt: new Date() })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: i.id } });
    expect(after.amountAllocated.toString()).toBe("300");
    expect(after.status).toBe("PAID");
  });

  it("edit = reverse + re-record in one step; delete = reverse; both keep the history", async () => {
    const { admin, w1, b, salaam, cash } = await world();
    const i = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: b.id, billedMeasure: "50", baseRate: "6" });
    const p = await addShipmentPayment(prisma, admin, { invoiceId: i.id, amount: "100", bankId: salaam.id, receivedAt: new Date() });

    const writer = await staff(["payments:write", "invoices:read"]);
    await expect(editShipmentPayment(prisma, writer, p.id, { amount: "120", bankId: cash.id, receivedAt: new Date() })).rejects.toThrow(/permission/i);

    const p2 = await editShipmentPayment(prisma, admin, p.id, { amount: "120", bankId: cash.id, receivedAt: new Date() });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: i.id } })).amountAllocated.toString()).toBe("120");
    const oldReceipt = await prisma.receipt.findUniqueOrThrow({ where: { paymentId: p.id } });
    expect(oldReceipt.reversedAt).not.toBeNull();
    await expect(editShipmentPayment(prisma, admin, p.id, { amount: "1", bankId: cash.id, receivedAt: new Date() })).rejects.toThrow(/already changed/);

    await deleteShipmentPayment(prisma, admin, p2.id);
    const inv0 = await prisma.invoice.findUniqueOrThrow({ where: { id: i.id } });
    expect([inv0.amountAllocated.toString(), inv0.status]).toEqual(["0", "UNPAID"]);
    expect(await prisma.payment.count()).toBe(2); // nothing hard-deleted
    expect(await shipmentPayments(prisma, admin, w1.id)).toHaveLength(0);
  });
});

// ------------------------------------------------------------------ statement & history

describe("statement and invoice history", () => {
  it("lists invoices as debit and payments as credit with a running balance, scoped by country", async () => {
    const { admin, w1, a, b, salaam } = await world();
    const ia = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: a.id, ...inv("128") }); // 768 + 64 + 20 = 852
    const ib = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: b.id, billedMeasure: "50", baseRate: "6" });
    await addShipmentPayment(prisma, admin, { invoiceId: ia.id, amount: "52", bankId: salaam.id, receivedAt: new Date(Date.now() + 3600_000) });

    const st = await buildStatement(prisma, admin, TR);
    expect(st.rows.map((r) => [r.kind, r.debit, r.credit])).toEqual([
      ["INVOICE", "852", "0"],
      ["INVOICE", "300", "0"],
      ["PAYMENT", "0", "52"],
    ]);
    expect(st.rows.at(-1)!.balance).toBe("1100");
    expect([st.totalInvoiced, st.totalPaid, st.balanceDue]).toEqual(["1152", "52", "1100"]);
    expect((await buildStatement(prisma, admin, TR, { customerId: ib.customerId })).rows).toHaveLength(1);
    expect((await buildStatement(prisma, admin, { country: "India", year: 2026 })).rows).toHaveLength(0);

    const indiaOnly = await staff(["invoices:read", "payments:read"], "India");
    await expect(buildStatement(prisma, indiaOnly, TR)).rejects.toThrow(/scope/i);
  });

  it("reports KG added (billed above actual) with the extra earned", async () => {
    const { admin, w1, a, b } = await world();
    await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: a.id, ...inv("130", { discount: "2" }) });
    await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: b.id, billedMeasure: "50", baseRate: "6" });
    const rows = await listExtraMeasure(prisma, admin, TR);
    expect(rows).toHaveLength(1);
    // 2 kg × (6 + 0.5) − 2
    expect(rows[0]).toMatchObject({ actual: "128", billed: "130", added: "2", extraEarned: "11" });
  });
});

// ------------------------------------------------------------------ reminders & demurrage

describe("reminders and demurrage", () => {
  it("a payment reminder only notifies; it never changes the invoice", async () => {
    const { admin, w1, b } = await world();
    const i = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: b.id, billedMeasure: "50", baseRate: "6" });
    expect((await listDueInvoices(prisma, admin, TR)).map((r) => r.invoiceNo)).toEqual([i.number]);
    await sendPaymentReminders(prisma, admin, TR, [i.id]);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: i.id } });
    expect(after.total.toString()).toBe("300");
    expect((await listDueInvoices(prisma, admin, TR))[0]!.lastReminderAt).not.toBeNull();
    expect(await prisma.notification.count({ where: { customerId: b.id, type: "payment_reminder" } })).toBe(1);
    await expect(sendPaymentReminders(prisma, admin, { country: "India", year: 2026 }, [i.id])).rejects.toThrow(/scope/);
  });

  it("demurrage is charged only after a finance manager approves it, and only the new part", async () => {
    const { admin, w1, b } = await world();
    const i = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: b.id, billedMeasure: "50", baseRate: "6" });
    const now = new Date("2026-10-20T12:00:00Z");
    await prisma.shipment.update({ where: { id: w1.id }, data: { status: "ARRIVED", arrivedAt: new Date("2026-10-10T12:00:00Z") } });

    const cfg = { freeDays: 3, ratePerDay: "5" };
    let row = (await listDemurrage(prisma, admin, TR, cfg, now)).find((r) => r.customerId === b.id)!;
    expect(row).toMatchObject({ daysWaiting: 10, overFreeDays: 7, fee: "35", charged: "0" });

    await sendDemurrageWarning(prisma, admin, { shipmentId: w1.id, customerId: b.id, ...cfg }, now);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: i.id } })).total.toString()).toBe("300");

    const writer = await staff(["invoices:write"]);
    await expect(approveDemurrage(prisma, writer, { shipmentId: w1.id, customerId: b.id, ...cfg }, now)).rejects.toThrow(/permission/i);

    await setExtraFreeDays(prisma, admin, { shipmentId: w1.id, customerId: b.id, days: 2 });
    const r1 = await approveDemurrage(prisma, admin, { shipmentId: w1.id, customerId: b.id, ...cfg }, now);
    expect(r1.added).toBe("25"); // (10 − 3 − 2) × 5
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: i.id } })).total.toString()).toBe("325");
    await expect(approveDemurrage(prisma, admin, { shipmentId: w1.id, customerId: b.id, ...cfg }, now)).rejects.toThrow(/Nothing new/);

    const later = new Date("2026-10-22T12:00:00Z");
    const r2 = await approveDemurrage(prisma, admin, { shipmentId: w1.id, customerId: b.id, ...cfg }, later);
    expect(r2.added).toBe("10");
    const doc = await getInvoiceDocument(prisma, admin, i.id);
    expect(doc.lines.filter((l) => l.category === "DEMURRAGE")).toEqual([expect.objectContaining({ quantity: "7", amount: "35" })]);
    expect(doc.total).toBe("335");
    // edits keep the approved demurrage
    await updateShipmentInvoice(prisma, admin, i.id, { billedMeasure: "50", baseRate: "6.2" });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: i.id } })).total.toString()).toBe("345");

    await markCargoCollected(prisma, admin, { shipmentId: w1.id, customerId: b.id });
    row = (await listDemurrage(prisma, admin, TR, cfg, later)).find((r) => r.customerId === b.id)!;
    expect(row).toBeUndefined();
  });
});
