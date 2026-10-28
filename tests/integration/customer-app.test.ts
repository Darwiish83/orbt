import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withUserDb } from "@/db/scoped";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { createCustomer } from "@/modules/customers/service";
import { addShipmentPayment, createShipmentInvoice } from "@/modules/finance/shipmentFinance";
import { myFinance, myInvoiceDocument, myPaymentReceipt, myProfile, myRecords, myShipment, myShipments, myYears, updateMyProfile } from "@/modules/portal/customerApp";
import { listAdminShipments } from "@/modules/shipments/manage";
import { addShipmentLine, createShipment } from "@/modules/shipments/service";
import { assertTestDatabase, prisma, resetDb, testPhone } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;
const D = (s: string) => new Date(`${s}T00:00:00Z`);

async function superAdmin(): Promise<AuthzUser> {
  const role = await prisma.role.upsert({ where: { key: "super_admin" }, create: { key: "super_admin", name: "Super Admin" }, update: {} });
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

async function signedIn(customerId: string): Promise<AuthzUser> {
  const u = await prisma.user.create({ data: { email: `${uniq()}@cust.so`, status: "ACTIVE", customerId } });
  return (await loadAuthzUser(prisma, u.id))!;
}

/** Two customers sharing one air shipment; A also has a sea shipment, an invoice and a payment. */
async function world() {
  const admin = await superAdmin();
  const a = await createCustomer(prisma, admin, { name: "Alpha Trading", company: "Alpha", phone: testPhone() });
  const b = await createCustomer(prisma, admin, { name: "Beta Market", company: "Beta", phone: testPhone() });
  const air = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026, shipDate: D("2026-10-01") });
  const sea = await createShipment(prisma, admin, { mode: "SEA", originCountry: "Turkey", businessYear: 2026, shipDate: D("2026-09-01") });
  await addShipmentLine(prisma, admin, air.id, { customerId: a.id, packages: 4, chargeableWeightKg: "100", mixCount: 1, mixKg: "5", rate: "8" });
  await addShipmentLine(prisma, admin, air.id, { customerId: b.id, packages: 2, chargeableWeightKg: "50", rate: "8" });
  await addShipmentLine(prisma, admin, sea.id, { customerId: a.id, packages: 10, volumeCbm: "2.5", rate: "300" });
  const ia = await createShipmentInvoice(prisma, admin, { shipmentId: air.id, customerId: a.id, billedMeasure: "100", baseRate: "8" }); // 800
  const ib = await createShipmentInvoice(prisma, admin, { shipmentId: air.id, customerId: b.id, billedMeasure: "50", baseRate: "8" }); // 400
  const bank = (await prisma.bank.findFirst({ orderBy: { sortOrder: "asc" } }))!;
  const pa = await addShipmentPayment(prisma, admin, { invoiceId: ia.id, amount: "300", bankId: bank.id, receivedAt: D("2026-10-05") });
  const pb = await addShipmentPayment(prisma, admin, { invoiceId: ib.id, amount: "400", bankId: bank.id, receivedAt: D("2026-10-05") });
  return { admin, a, b, air, sea, ia, ib, pa, pb, A: await signedIn(a.id), B: await signedIn(b.id) };
}

describe("Customer App: a customer sees only their own data", () => {
  it("shipments show only the customer's own goods, never another customer's", async () => {
    const { A, B, air, sea } = await world();
    const mine = await withUserDb(A, (db) => myShipments(db, A, 2026));
    expect(mine.map((s) => s.id).sort()).toEqual([air.id, sea.id].sort());
    const a = mine.find((s) => s.id === air.id)!;
    // A's goods weigh 100 kg + 5 MIX kg (not B's 50), but A's invoice bills 100 kg:
    // the customer sees the same KG on the shipment as on the invoice.
    expect([a.mode, a.measure, a.packages, a.mixCount]).toEqual(["AIR", "100", 4, 1]);
    expect((await withUserDb(B, (db) => myShipments(db, B, 2026)))[0]!.measure).toBe("50");
    expect(mine.find((s) => s.id === sea.id)!.measure).toBe("2.5");
    expect((await withUserDb(B, (db) => myShipments(db, B, 2026))).map((s) => s.id)).toEqual([air.id]);
    await expect(withUserDb(B, (db) => myShipment(db, B, sea.id))).rejects.toThrow(/not found/);
    expect(await withUserDb(A, (db) => myYears(db, A))).toContain(2026);
  });

  it("invoices, payments and receipts are the customer's own; another's are refused", async () => {
    const { admin, A, B, ia, ib, pa, pb } = await world();
    const fin = await withUserDb(A, (db) => myFinance(db, A, 2026));
    expect(fin.totals).toEqual({ invoices: 1, invoiced: "800", paid: "300", balance: "500" });
    expect(fin.invoices.map((i) => i.id)).toEqual([ia.id]);
    expect(fin.payments.map((p) => [p.amount, p.invoiceNo])).toEqual([["300", ia.number]]);
    expect((await withUserDb(A, (db) => myInvoiceDocument(db, A, ia.id))).number).toBe(ia.number);
    await expect(withUserDb(A, (db) => myInvoiceDocument(db, A, ib.id))).rejects.toThrow(/not found/);
    expect((await withUserDb(A, (db) => myPaymentReceipt(db, A, pa.id))).balance).toBe("500.00");
    await expect(withUserDb(A, (db) => myPaymentReceipt(db, A, pb.id))).rejects.toThrow(/not found/);
    // A later payment doesn't change what an older receipt says was owed then.
    const bank = (await prisma.bank.findFirst({ orderBy: { sortOrder: "asc" } }))!;
    const later = await addShipmentPayment(prisma, admin, { invoiceId: ia.id, amount: "200", bankId: bank.id, receivedAt: D("2026-10-09") });
    const first = await withUserDb(A, (db) => myPaymentReceipt(db, A, pa.id));
    expect([first.invoiceTotal, first.paidToDate, first.balance, first.mode]).toEqual(["800.00", "300.00", "500.00", "AIR"]);
    expect(first.inWords).toBe("Three hundred US dollars only");
    const second = await withUserDb(A, (db) => myPaymentReceipt(db, A, later.id));
    expect([second.paidToDate, second.balance]).toEqual(["500.00", "300.00"]);
    expect((await withUserDb(B, (db) => myFinance(db, B, 2026))).totals.balance).toBe("0");
    const rec = await withUserDb(A, (db) => myRecords(db, A, 2026));
    expect(rec.find((r) => r.invoice)!.invoice!.number).toBe(ia.number);
  });

  it("customers know a shipment only by its random SH- code, never W-n / C-n", async () => {
    const { admin, A, air, sea, ia, pa } = await world();
    const codes = await prisma.shipment.findMany({ where: { id: { in: [air.id, sea.id] } }, select: { id: true, code: true, publicCode: true } });
    for (const c of codes) expect(c.publicCode).toMatch(/^SH-\d{5}$/);
    expect(new Set(codes.map((c) => c.publicCode)).size).toBe(2);
    const pub = (id: string) => codes.find((c) => c.id === id)!.publicCode;

    const mine = await withUserDb(A, (db) => myShipments(db, A, 2026));
    expect(mine.map((x) => x.code).sort()).toEqual([pub(air.id), pub(sea.id)].sort());
    expect((await withUserDb(A, (db) => myFinance(db, A, 2026))).invoices[0]!.shipment).toBe(pub(air.id));
    expect((await withUserDb(A, (db) => myInvoiceDocument(db, A, ia.id))).shipmentCode).toBe(pub(air.id));
    expect((await withUserDb(A, (db) => myPaymentReceipt(db, A, pa.id))).shipmentCode).toBe(pub(air.id));
    // Nothing a customer reads mentions the staff code.
    const seen = JSON.stringify([mine, await withUserDb(A, (db) => myFinance(db, A, 2026)), await withUserDb(A, (db) => myRecords(db, A, 2026))]);
    expect(seen).not.toMatch(/"W-\d|"C-\d/);
    // Staff still work with W-n and can find a shipment by the customer's SH- code.
    const list = await listAdminShipments(prisma, admin, { country: "Turkey", year: 2026 }, { mode: "AIR", q: pub(air.id) });
    expect(list.rows.map((r) => [r.code, r.publicCode])).toEqual([["W-1", pub(air.id)]]);
  });

  it("staff can't use the Customer App reads; a customer edits only their own profile", async () => {
    const { admin, A, a, b } = await world();
    await expect(myShipments(prisma, admin)).rejects.toThrow(/Customers only/);
    await expect(withUserDb(A, (db) => updateMyProfile(db, A, { name: "", company: "x", location: "", cargoCategory: "" }))).rejects.toThrow(/required/);
    await withUserDb(A, (db) => updateMyProfile(db, A, { name: "Alpha Trading Co", company: "Alpha", location: "Bakaaro", cargoCategory: "Clothes" }));
    expect((await withUserDb(A, (db) => myProfile(db, A))).name).toBe("Alpha Trading Co");
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: b.id } })).name).toBe("Beta Market");
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: a.id } })).location).toBe("Bakaaro");
  });
});
