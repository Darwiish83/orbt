import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withCustomerDb } from "@/db/client";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { createCustomer, listCustomers } from "@/modules/customers/service";
import { getDocumentForDownload, listDocuments, uploadDocument } from "@/modules/documents/service";
import { listInvoices } from "@/modules/finance/invoices";
import { recordPayment } from "@/modules/finance/payments";
import { getInvoiceDocument, getPaymentReceipt } from "@/modules/finance/shipmentFinance";
import { getNotificationImage } from "@/modules/notifications/announcements";
import { listNotificationsForUser } from "@/modules/notifications/service";
import { createShipment, getShipmentForActor, listShipments } from "@/modules/shipments/service";
import { getTransferReceipt } from "@/modules/transfer/receipts";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

/**
 * Account isolation (owner requirement 2026-10-27): nobody sees another
 * person's data or acts through another person's account. Customer B tries
 * every customer-facing read on customer A's records — each must fail or come
 * back empty — while A still sees their own. Customers also can't call staff
 * operations directly (hand-built requests to server actions end here).
 */
beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

async function principal(customerId: string, email: string): Promise<AuthzUser> {
  const u = await prisma.user.create({ data: { email, status: "ACTIVE", customerId } });
  return (await loadAuthzUser(prisma, u.id))!;
}

async function world() {
  const custA = await prisma.customer.create({ data: { ref: "OR-3001", name: "A", company: "A Co", phone: "+252 61 111 1111", phoneKey: "252611111111" } });
  const custB = await prisma.customer.create({ data: { ref: "OR-3002", name: "B", company: "B Co", phone: "+252 61 222 2222", phoneKey: "252612222222" } });
  const A = await principal(custA.id, "a@shop.so");
  const B = await principal(custB.id, "b@shop.so");

  const shipment = await prisma.shipment.create({ data: { code: "W-1", mode: "AIR", originCountry: "Turkey", businessYear: 2026 } });
  await prisma.shipmentLine.create({ data: { shipmentId: shipment.id, customerId: custA.id, packages: 2, chargeableWeightKg: 10 } });
  const invoice = await prisma.invoice.create({ data: { number: "INV-2026-0001", customerId: custA.id, shipmentId: shipment.id, total: 70, businessYear: 2026 } });
  const payment = await prisma.payment.create({ data: { customerId: custA.id, amount: 20, method: "CASH" } });
  await prisma.receipt.create({ data: { number: "RCP-2026-1001", year: 2026, direction: "IN", kind: "PAYMENT", amount: 20, customerId: custA.id, paymentId: payment.id } });
  const document = await prisma.document.create({
    data: { kind: "CARGO_DOC", storageKey: "isolation-test-key", contentType: "application/pdf", size: 10, customerId: custA.id, visibility: "CUSTOMER_VISIBLE" },
  });
  const transfer = await prisma.transferReceipt.create({
    data: { year: 2026, number: 5000, country: "Turkey", customerId: custA.id, receivedFrom: "A", receivedAt: new Date("2026-10-01"), amount: 100, description: "TO A", actorUserId: A.id },
  });
  const notice = await prisma.notification.create({ data: { audience: "CUSTOMER", customerId: custA.id, title: "Private to A", message: "x", status: "SENT", sentAt: new Date() } });
  return { A, B, custA, custB, shipment, invoice, payment, document, transfer, notice };
}

describe("customer B cannot reach customer A's data", () => {
  it("shipments: A's shipment is invisible and can't be opened by id", async () => {
    const w = await world();
    expect((await listShipments(prisma, w.B, {})).total).toBe(0);
    await expect(getShipmentForActor(prisma, w.B, w.shipment.id)).rejects.toThrow();
    expect((await listShipments(prisma, w.A, {})).total).toBe(1); // control
  });

  it("invoices: not listed, and the printable invoice is refused", async () => {
    const w = await world();
    expect((await listInvoices(prisma, w.B, {})).items).toHaveLength(0);
    expect((await listInvoices(prisma, w.A, {})).items).toHaveLength(1); // control
    await expect(getInvoiceDocument(prisma, w.B, w.invoice.id)).rejects.toThrow();
  });

  it("payments: A's receipt can't be opened", async () => {
    const w = await world();
    await expect(getPaymentReceipt(prisma, w.B, w.payment.id)).rejects.toThrow();
  });

  it("documents: not listed and can't be downloaded by id", async () => {
    const w = await world();
    expect((await listDocuments(prisma, w.B, {})).total).toBe(0);
    await expect(getDocumentForDownload(prisma, w.B, w.document.id)).rejects.toThrow();
    expect((await listDocuments(prisma, w.A, {})).total).toBe(1); // control
  });

  it("transfer receipts: only the owner can open theirs", async () => {
    const w = await world();
    await expect(getTransferReceipt(prisma, w.B, w.transfer.id)).rejects.toThrow();
    await expect(getTransferReceipt(prisma, w.A, w.transfer.id)).resolves.toBeTruthy(); // control
  });

  it("notifications: A's private notice is not in B's list, nor its image", async () => {
    const w = await world();
    const forB = await listNotificationsForUser(prisma, w.B, {});
    expect(forB.items.map((n) => n.id)).not.toContain(w.notice.id);
    const forA = await listNotificationsForUser(prisma, w.A, {});
    expect(forA.items.map((n) => n.id)).toContain(w.notice.id); // control
    await expect(getNotificationImage(prisma, w.B, w.notice.id)).rejects.toThrow();
  });

  it("customer records: B only ever sees B", async () => {
    const w = await world();
    const page = await listCustomers(prisma, w.B, { query: "OR-3001" });
    expect(page.items.map((c) => c.ref)).toEqual([]);
    expect((await listCustomers(prisma, w.B, {})).items.map((c) => c.ref)).toEqual(["OR-3002"]);
  });
});

describe("a customer can't use staff operations, even with hand-built requests", () => {
  it("can't create customers or shipments, or record payments", async () => {
    const w = await world();
    await expect(createCustomer(prisma, w.B, { name: "X", company: "X", phone: "61 333 3333" })).rejects.toThrow();
    await expect(createShipment(prisma, w.B, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 })).rejects.toThrow();
    await expect(recordPayment(prisma, w.B, { customerId: w.custB.id, amount: "10", method: "CASH" })).rejects.toThrow();
    expect(await prisma.customer.count()).toBe(2);
    expect(await prisma.payment.count()).toBe(1);
  });
});

describe("the customer pages work through the customer's own database connection (RLS)", () => {
  it("A's pages show A's records; B's connection gets none of them", async () => {
    const w = await world();
    const asA = await withCustomerDb(w.custA.id, async (db) => ({
      shipments: (await listShipments(db, w.A, {})).total,
      invoices: (await listInvoices(db, w.A, {})).items.length,
      documents: (await listDocuments(db, w.A, {})).total,
      transfer: (await getTransferReceipt(db, w.A, w.transfer.id)).id,

      notices: (await listNotificationsForUser(db, w.A, {})).items.map((n) => n.id),
    }));
    expect(asA).toMatchObject({ shipments: 1, invoices: 1, documents: 1, transfer: w.transfer.id });
    expect(asA.notices).toContain(w.notice.id);

    await withCustomerDb(w.custB.id, async (db) => {
      expect((await listShipments(db, w.B, {})).total).toBe(0);
      expect((await listInvoices(db, w.B, {})).items).toHaveLength(0);
      // Row-Level Security hides the row itself: the route answers 404.
      await expect(getDocumentForDownload(db, w.B, w.document.id)).resolves.toBeNull();
      await expect(getTransferReceipt(db, w.B, w.transfer.id)).rejects.toThrow();
      // Another customer's invoice paper: "not found", never a hint it exists.
      await expect(getInvoiceDocument(db, w.B, w.invoice.id)).rejects.toThrow(/not found/i);
    });
    // The owner downloads / prints their own invoice (owner 2026-10-28).
    expect((await withCustomerDb(w.custA.id, (db) => getInvoiceDocument(db, w.A, w.invoice.id))).number).toBe("INV-2026-0001");
  });

  it("a customer uploads and downloads their own document", async () => {
    const w = await world();
    const pdf = Buffer.from("%PDF-1.4\nhello orbit\n", "latin1");
    const doc = await withCustomerDb(w.custB.id, (db) => uploadDocument(db, w.B, { buffer: pdf, filename: "b.pdf", declaredType: "application/pdf", kind: "OTHER" }));
    expect(doc.customerId).toBe(w.custB.id);
    await expect(withCustomerDb(w.custB.id, (db) => getDocumentForDownload(db, w.B, doc.id))).resolves.toBeTruthy();
    await expect(withCustomerDb(w.custA.id, (db) => getDocumentForDownload(db, w.A, doc.id))).resolves.toBeNull();
    expect(await prisma.auditEvent.count({ where: { entityId: doc.id } })).toBeGreaterThan(0);
  });
});
