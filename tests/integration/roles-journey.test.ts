import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withCustomerDb } from "@/db/client";
import { incomeAndOut } from "@/modules/accounting/service";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { createCustomer } from "@/modules/customers/service";
import { getDocumentForDownload, listDocuments } from "@/modules/documents/service";
import { uploadAdminDocument } from "@/modules/documents/admin";
import { listInvoices } from "@/modules/finance/invoices";
import { addShipmentPayment, createShipmentInvoice, deleteShipmentPayment, getInvoiceDocument, getPaymentReceipt, myPaymentReceipts } from "@/modules/finance/shipmentFinance";
import { listNotificationsForUser } from "@/modules/notifications/service";
import { addShipmentLine, changeShipmentStatus, createShipment, listShipments } from "@/modules/shipments/service";
import { setShipmentLinePricing } from "@/modules/shipments/manage";
import { assertTestDatabase, prisma, resetDb, testPhone } from "./helpers";

/**
 * One shipment's whole life, each person doing only their own part (owner
 * request 2026-10-28: "check every employee's work and every customer
 * service"). After every step the test looks where the result must land —
 * the right table, the right customer, the accounting figures, the customer's
 * own pages (through the customer's database connection) — and that the
 * other customer and the other roles see or do nothing.
 */
beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;
const D = (s: string) => new Date(`${s}T12:00:00Z`);
const TR = { country: "Turkey", year: 2026 };
const PDF = Buffer.from("%PDF-1.4 cargo papers", "latin1");

async function superAdmin(): Promise<AuthzUser> {
  const role = await prisma.role.upsert({ where: { key: "super_admin" }, create: { key: "super_admin", name: "Super Admin" }, update: {} });
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

async function staff(perms: string[], country: string | null = "Turkey"): Promise<AuthzUser> {
  const role = await prisma.role.create({ data: { key: `role-${uniq()}`, name: "role" } });
  for (const p of perms) {
    const permission = await prisma.permission.upsert({ where: { key: p }, create: { key: p }, update: {} });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, country } });
  return (await loadAuthzUser(prisma, user.id))!;
}

async function customerUser(customerId: string): Promise<AuthzUser> {
  const u = await prisma.user.create({ data: { email: `${uniq()}@shop.so`, status: "ACTIVE", customerId } });
  return (await loadAuthzUser(prisma, u.id))!;
}

/** What a customer sees on their own pages, read through their own connection (RLS). */
const portalView = (c: AuthzUser) =>
  withCustomerDb(c.customerId!, async (db) => ({
    shipments: (await listShipments(db, c, {})).items.map((s) => ({ id: s.id, status: s.status })),
    invoices: (await listInvoices(db, c, {})).items.map((i) => ({ number: i.number, status: i.status, total: i.total.toString() })),
    documents: (await listDocuments(db, c, {})).items.map((d) => d.id),
    notices: (await listNotificationsForUser(db, c, {})).items.map((n) => n.type),
  }));

describe("a shipment's life, each role doing its own part", () => {
  it("operations → finance → customer → accounting, every result where it belongs", async () => {
    const admin = await superAdmin();
    const ops = await staff(["shipments:read", "shipments:write", "shipments:status", "customers:read"]);
    const fin = await staff(["invoices:manage", "payments:manage", "customers:read", "shipments:read"]);
    const docs = await staff(["documents:write", "documents:read", "customers:read"]);
    const pricer = await staff(["pricing:write", "shipments:read"]);
    const india = await staff(["shipments:read", "shipments:write", "shipments:status", "invoices:manage", "payments:manage"], "India");
    const salaam = await prisma.bank.findUniqueOrThrow({ where: { name: "Salaam Bank" } });

    const alpha = await createCustomer(prisma, admin, { name: "Alpha", company: "Alpha Co", phone: testPhone() });
    const beta = await createCustomer(prisma, admin, { name: "Beta", company: "Beta Co", phone: testPhone() });
    const A = await customerUser(alpha.id);
    const B = await customerUser(beta.id);

    // 1. Operations creates W-1 and adds Alpha's cargo; pricing staff set the rate (ADR-036).
    const w1 = await createShipment(prisma, ops, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    await expect(addShipmentLine(prisma, ops, w1.id, { customerId: alpha.id, packages: 10, chargeableWeightKg: "100", rate: "6" })).rejects.toThrow(/pricing staff/);
    const cargo = await addShipmentLine(prisma, ops, w1.id, { customerId: alpha.id, packages: 10, chargeableWeightKg: "100" });
    expect(await prisma.shipmentLine.count({ where: { shipmentId: w1.id, customerId: alpha.id } })).toBe(1);
    expect((await portalView(A)).shipments).toEqual([]); // not priced yet
    await setShipmentLinePricing(prisma, pricer, cargo.id, { rate: "6" });
    expect((await portalView(A)).shipments).toEqual([{ id: w1.id, status: "AT_ORIGIN_STORE" }]);
    expect((await portalView(B)).shipments).toEqual([]);
    // Operations can't bill; another country's staff can't touch W-1.
    await expect(createShipmentInvoice(prisma, ops, { shipmentId: w1.id, customerId: alpha.id, billedMeasure: "100", baseRate: "6" })).rejects.toThrow();
    await expect(addShipmentLine(prisma, india, w1.id, { customerId: beta.id, packages: 1, chargeableWeightKg: "5", rate: "6" })).rejects.toThrow();

    // 2. Finance invoices Alpha: 100 kg × 6 = 600, computed on the server.
    const invoice = await createShipmentInvoice(prisma, fin, { shipmentId: w1.id, customerId: alpha.id, billedMeasure: "100", baseRate: "6" });
    expect(invoice.customerId).toBe(alpha.id);
    expect(invoice.total.toString()).toBe("600");
    expect((await portalView(A)).invoices).toEqual([{ number: invoice.number, status: "UNPAID", total: "600" }]);
    expect((await portalView(B)).invoices).toEqual([]);
    // Billing a customer who has no cargo on W-1 is refused.
    await expect(createShipmentInvoice(prisma, fin, { shipmentId: w1.id, customerId: beta.id, billedMeasure: "1", baseRate: "6" })).rejects.toThrow();

    // 3. Finance records 200 from Alpha into Salaam Bank.
    const p1 = await addShipmentPayment(prisma, fin, { invoiceId: invoice.id, amount: "200", bankId: salaam.id, receivedAt: D("2026-10-05") });
    const receipt = await prisma.receipt.findUniqueOrThrow({ where: { paymentId: p1.id } });
    expect(receipt).toMatchObject({ number: "RCP-2026-1001", direction: "IN", kind: "PAYMENT", customerId: alpha.id, bankId: salaam.id });
    expect(receipt.amount.toString()).toBe("200");
    expect((await prisma.paymentAllocation.findFirstOrThrow({ where: { paymentId: p1.id } })).invoiceId).toBe(invoice.id);
    expect((await getPaymentReceipt(prisma, fin, p1.id)).receiptNo).toBe("RCP-2026-1001");
    let seenA = await portalView(A);
    expect(seenA.invoices[0]!.status).toBe("PARTIAL");
    expect(seenA.notices).toContain("payment");
    expect((await portalView(B)).notices).not.toContain("payment");

    // Accounting: the 200 is income, in Salaam Bank, for Turkey 2026 only.
    let io = await incomeAndOut(prisma, admin, TR);
    expect(io.balance).toBe("200");
    expect(io.perBank.find((b) => b.bankId === salaam.id)!.in).toBe("200");
    expect(io.totals.collections).toBe("200");
    expect((await incomeAndOut(prisma, admin, { country: "India", year: 2026 })).balance).toBe("0");

    // Over-paying is refused; the rest pays the invoice in full.
    await expect(addShipmentPayment(prisma, fin, { invoiceId: invoice.id, amount: "401", bankId: salaam.id, receivedAt: D("2026-10-06") })).rejects.toThrow();
    await addShipmentPayment(prisma, fin, { invoiceId: invoice.id, amount: "400", bankId: salaam.id, receivedAt: D("2026-10-06") });
    expect((await portalView(A)).invoices[0]!.status).toBe("PAID");
    io = await incomeAndOut(prisma, admin, TR);
    expect(io.balance).toBe("600");
    expect(await prisma.receipt.count({ where: { customerId: alpha.id, kind: "PAYMENT" } })).toBe(2);

    // The customer downloads / prints their own invoice and receipts — through
    // their own connection — and never anyone else's.
    const paper = await withCustomerDb(alpha.id, (db) => getInvoiceDocument(db, A, invoice.id));
    expect(paper).toMatchObject({ number: invoice.number, total: "600", paid: "600", balance: "0", customerName: "Alpha" });
    await expect(withCustomerDb(beta.id, (db) => getInvoiceDocument(db, B, invoice.id))).rejects.toThrow(/not found/i);
    const mine = await withCustomerDb(alpha.id, (db) => myPaymentReceipts(db, A));
    expect(mine.map((r) => r.receiptNo).sort()).toEqual(["RCP-2026-1001", "RCP-2026-1002"]);
    expect(mine.every((r) => r.invoiceId === invoice.id)).toBe(true);
    expect((await withCustomerDb(alpha.id, (db) => getPaymentReceipt(db, A, p1.id))).receiptNo).toBe("RCP-2026-1001");
    await expect(withCustomerDb(beta.id, (db) => getPaymentReceipt(db, B, p1.id))).rejects.toThrow(/not found/i);
    expect(await withCustomerDb(beta.id, (db) => myPaymentReceipts(db, B))).toEqual([]);
    await expect(myPaymentReceipts(prisma, fin)).rejects.toThrow(); // a customer list, not a staff one
    // A payment Finance deletes (reversed) is no longer the customer's receipt.
    await deleteShipmentPayment(prisma, fin, p1.id);
    await expect(withCustomerDb(alpha.id, (db) => getPaymentReceipt(db, A, p1.id))).rejects.toThrow(/not found/i);
    expect((await withCustomerDb(alpha.id, (db) => myPaymentReceipts(db, A))).map((r) => r.receiptNo)).toEqual(["RCP-2026-1002"]);
    expect((await portalView(A)).invoices[0]!.status).toBe("PARTIAL");
    await addShipmentPayment(prisma, fin, { invoiceId: invoice.id, amount: "200", bankId: salaam.id, receivedAt: D("2026-10-07") });

    // 4. Documents staff files Alpha's cargo papers; only Alpha sees and downloads them.
    const doc = await uploadAdminDocument(prisma, docs, { target: "customer", customerId: alpha.id, reference: "PL-1", file: { buffer: PDF, name: "packing.pdf", type: "application/pdf" } });
    expect(await prisma.storedFile.count({ where: { key: doc.storageKey } })).toBe(1); // bytes in the database
    expect((await portalView(A)).documents).toContain(doc.id);
    expect((await portalView(B)).documents).toEqual([]);
    expect((await withCustomerDb(alpha.id, (db) => getDocumentForDownload(db, A, doc.id)))!.buffer).toEqual(PDF);
    // Turkey's documents staff can't file papers for a customer of another country.
    const gamma = await prisma.customer.update({ where: { id: (await createCustomer(prisma, admin, { name: "Gamma", company: "Gamma Co", phone: testPhone() })).id }, data: { country: "India" } });
    await expect(uploadAdminDocument(prisma, docs, { target: "customer", customerId: gamma.id, file: { buffer: PDF, name: "g.pdf", type: "application/pdf" } })).rejects.toThrow(/scope/);
    expect(await withCustomerDb(beta.id, (db) => getDocumentForDownload(db, B, doc.id))).toBeNull();

    // 5. Operations moves W-1 on; every customer in it is told, nobody else.
    await changeShipmentStatus(prisma, ops, w1.id, "DEPARTED", { notifyCustomers: true });
    seenA = await portalView(A);
    expect(seenA.shipments).toEqual([{ id: w1.id, status: "DEPARTED" }]);
    expect(seenA.notices).toContain("status");
    expect((await portalView(B)).notices).not.toContain("status");
    expect(await prisma.shipmentEvent.count({ where: { shipmentId: w1.id, status: "DEPARTED" } })).toBe(1);
    // Finance can't move shipments; India can't either.
    await expect(changeShipmentStatus(prisma, fin, w1.id, "IN_TRANSIT")).rejects.toThrow();
    await expect(changeShipmentStatus(prisma, india, w1.id, "IN_TRANSIT")).rejects.toThrow();

    // Every step left its audit row, signed by the person who did it.
    const trail = await prisma.auditEvent.findMany({ select: { action: true, actorUserId: true } });
    const by = (action: string) => trail.filter((t) => t.action === action).map((t) => t.actorUserId);
    expect(by("shipment.create")).toEqual([ops.id]);
    expect(by("shipment.status_change")).toEqual([ops.id]);
    expect(by("document.upload")).toEqual([docs.id]);
    expect(trail.some((t) => t.action.startsWith("invoice.") && t.actorUserId === fin.id)).toBe(true);
    expect(trail.some((t) => t.action.startsWith("payment.") && t.actorUserId === fin.id)).toBe(true);
  });

  it("a customer can't do any staff work, whatever they send", async () => {
    const admin = await superAdmin();
    const alpha = await createCustomer(prisma, admin, { name: "Alpha", company: "Alpha Co", phone: testPhone() });
    const A = await customerUser(alpha.id);
    const w1 = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    await addShipmentLine(prisma, admin, w1.id, { customerId: alpha.id, packages: 1, chargeableWeightKg: "10", rate: "6" });
    const invoice = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: alpha.id, billedMeasure: "10", baseRate: "6" });
    const salaam = await prisma.bank.findUniqueOrThrow({ where: { name: "Salaam Bank" } });

    await expect(createShipment(prisma, A, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 })).rejects.toThrow();
    await expect(addShipmentLine(prisma, A, w1.id, { customerId: alpha.id, packages: 1, chargeableWeightKg: "1", rate: "1" })).rejects.toThrow();
    await expect(createShipmentInvoice(prisma, A, { shipmentId: w1.id, customerId: alpha.id, billedMeasure: "1", baseRate: "1" })).rejects.toThrow();
    await expect(addShipmentPayment(prisma, A, { invoiceId: invoice.id, amount: "60", bankId: salaam.id, receivedAt: D("2026-10-05") })).rejects.toThrow();
    await expect(changeShipmentStatus(prisma, A, w1.id, "DEPARTED")).rejects.toThrow();
    await expect(incomeAndOut(prisma, A, TR)).rejects.toThrow();
    await expect(uploadAdminDocument(prisma, A, { target: "customer", customerId: alpha.id, file: { buffer: PDF, name: "x.pdf", type: "application/pdf" } })).rejects.toThrow();

    expect(await prisma.payment.count()).toBe(0);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: w1.id } })).status).toBe("AT_ORIGIN_STORE");
    expect(await prisma.invoice.count()).toBe(1);
  });
});
