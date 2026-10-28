import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withCustomerDb } from "@/db/client";
import { assertLeastPrivilege } from "@/db/roleCheck";
import { loadAuthzUser } from "@/modules/authz/core";
import { changeShipmentStatus } from "@/modules/shipments/service";
import { dbStorage } from "@/modules/documents/storage";
import { assertTestDatabase, ownerDb, prisma, resetDb } from "./helpers";

/**
 * Database guards (ADR-029). These tests skip the app entirely and send SQL
 * straight to PostgreSQL with the app's own credentials, as someone holding
 * the code or the connection string would. The database itself must refuse.
 *
 *  - `prisma` is orbit_runtime (DATABASE_URL), the app's connection.
 *  - `portal` is orbit_portal (PORTAL_DATABASE_URL), used for customer requests.
 */
const portal = new PrismaClient({ datasources: { db: { url: process.env.PORTAL_DATABASE_URL } } });

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(async () => {
  await prisma.$disconnect();
  await portal.$disconnect();
});

const PERMISSION = /permission denied|must be owner|not allowed|insufficient|can only|can't change|only move forward|illegal|closed/i;

async function world() {
  const custA = await prisma.customer.create({ data: { ref: "OR-3001", name: "A", company: "A Co", phone: "+252 61 111 1111", phoneKey: "252611111111" } });
  const custB = await prisma.customer.create({ data: { ref: "OR-3002", name: "B", company: "B Co", phone: "+252 61 222 2222", phoneKey: "252612222222" } });
  const shipment = await prisma.shipment.create({ data: { code: "W-1", mode: "AIR", originCountry: "Turkey", businessYear: 2026 } });
  await prisma.shipmentLine.create({ data: { shipmentId: shipment.id, customerId: custA.id, packages: 2, chargeableWeightKg: 10 } });
  const invoice = await prisma.invoice.create({ data: { number: "INV-2026-0001", customerId: custA.id, shipmentId: shipment.id, total: 70, businessYear: 2026 } });
  const line = await prisma.chargeLineItem.create({ data: { parentType: "INVOICE", invoiceId: invoice.id, category: "FREIGHT", unitPrice: 70, amount: 70 } });
  const payment = await prisma.payment.create({ data: { customerId: custA.id, amount: 20, method: "CASH" } });
  const receipt = await prisma.receipt.create({ data: { number: "RCP-2026-1001", year: 2026, direction: "IN", kind: "PAYMENT", amount: 20, customerId: custA.id, paymentId: payment.id } });
  const audit = await prisma.auditEvent.create({ data: { action: "test.event" } });
  const bank = await prisma.bank.findFirstOrThrow();
  return { custA, custB, shipment, invoice, line, payment, receipt, audit, bank };
}

describe("the app's connection can't change the database itself", () => {
  it.each([
    [`DROP TABLE "AuditEvent"`],
    [`TRUNCATE "Receipt" CASCADE`],
    [`ALTER TABLE "Customer" ADD COLUMN "evil" int`],
    [`ALTER TABLE "Invoice" DISABLE TRIGGER ALL`],
    [`ALTER TABLE "Invoice" DISABLE ROW LEVEL SECURITY`],
    [`CREATE TABLE "evil" ("id" int)`],
    [`DROP FUNCTION orbit_forbid() CASCADE`],
    [`SET session_replication_role = replica`],
    [`SET ROLE orbit_owner`],
    [`CREATE ROLE evil LOGIN SUPERUSER`],
    [`SELECT * FROM "_prisma_migrations"`],
    [`COPY "User" TO PROGRAM 'whoami'`],
  ])("refuses: %s", async (sql) => {
    await expect(prisma.$executeRawUnsafe(sql)).rejects.toThrow(PERMISSION);
  });
});

describe("history can't be erased or rewritten, even with direct SQL", () => {
  it("the audit log is append-only", async () => {
    const w = await world();
    await expect(prisma.$executeRaw`UPDATE "AuditEvent" SET "action" = 'nothing' WHERE "id" = ${w.audit.id}`).rejects.toThrow(PERMISSION);
    await expect(prisma.$executeRaw`DELETE FROM "AuditEvent"`).rejects.toThrow(PERMISSION);
    await expect(prisma.auditEvent.deleteMany({})).rejects.toThrow(PERMISSION);
    expect(await prisma.auditEvent.count()).toBe(1);
  });

  it.each(["Invoice", "Payment", "Receipt", "PaymentAllocation", "CashOut", "TransferReceipt", "PeriodClose", "InvoiceRevision", "ShipmentEvent", "DebtReturn", "StoredFile"])(
    "rows of %s are never deleted",
    async (table) => {
      await world();
      await expect(prisma.$executeRawUnsafe(`DELETE FROM "${table}"`)).rejects.toThrow(PERMISSION);
    },
  );

  it("a receipt's amount can't change; it can be reversed once, and not un-reversed", async () => {
    const w = await world();
    await expect(prisma.receipt.update({ where: { id: w.receipt.id }, data: { amount: 1 } })).rejects.toThrow(PERMISSION);
    await expect(prisma.receipt.update({ where: { id: w.receipt.id }, data: { customerId: w.custB.id } })).rejects.toThrow(PERMISSION);
    await prisma.receipt.update({ where: { id: w.receipt.id }, data: { reversedAt: new Date() } }); // allowed: the reversal
    await expect(prisma.receipt.update({ where: { id: w.receipt.id }, data: { reversedAt: null } })).rejects.toThrow(PERMISSION);
    expect((await prisma.receipt.findUniqueOrThrow({ where: { id: w.receipt.id } })).amount.toString()).toBe("20");
  });

  it("a payment's amount and customer can't change", async () => {
    const w = await world();
    await expect(prisma.payment.update({ where: { id: w.payment.id }, data: { amount: 2000 } })).rejects.toThrow(PERMISSION);
    await expect(prisma.payment.update({ where: { id: w.payment.id }, data: { customerId: w.custB.id } })).rejects.toThrow(PERMISSION);
  });

  it("an invoice can't be moved to another customer or renumbered", async () => {
    const w = await world();
    await expect(prisma.invoice.update({ where: { id: w.invoice.id }, data: { customerId: w.custB.id } })).rejects.toThrow(PERMISSION);
    await expect(prisma.invoice.update({ where: { id: w.invoice.id }, data: { number: "INV-2026-9999" } })).rejects.toThrow(PERMISSION);
  });

  it("receipt numbers can't be wound back to be issued twice", async () => {
    await prisma.receiptSequence.create({ data: { year: 2026, next: 1005 } });
    await expect(prisma.receiptSequence.update({ where: { year: 2026 }, data: { next: 1001 } })).rejects.toThrow(PERMISSION);
    await prisma.receiptSequence.update({ where: { year: 2026 }, data: { next: 1006 } }); // forward is fine
  });
});

describe("a shipment only moves along its real path", () => {
  it("can't jump, go backwards or change mode", async () => {
    const w = await world();
    await expect(prisma.shipment.update({ where: { id: w.shipment.id }, data: { status: "ARRIVED" } })).rejects.toThrow(PERMISSION);
    await expect(prisma.shipment.update({ where: { id: w.shipment.id }, data: { mode: "SEA" } })).rejects.toThrow(PERMISSION);
    await prisma.shipment.update({ where: { id: w.shipment.id }, data: { status: "DEPARTED" } });
    await expect(prisma.shipment.update({ where: { id: w.shipment.id }, data: { status: "AT_ORIGIN_STORE" } })).rejects.toThrow(PERMISSION);
    await prisma.shipment.update({ where: { id: w.shipment.id }, data: { status: "IN_TRANSIT" } });
    await prisma.shipment.update({ where: { id: w.shipment.id }, data: { status: "ARRIVED" } });
    await expect(prisma.shipment.update({ where: { id: w.shipment.id }, data: { status: "DEPARTED" } })).rejects.toThrow(PERMISSION);
  });
});

describe("a closed year can't be written to", () => {
  it("no outs, invoices or invoice lines once Turkey 2026 is closed", async () => {
    const w = await world();
    await prisma.periodClose.create({
      data: { country: "Turkey", year: 2026, period: "YEAR", fromDate: new Date("2026-01-01"), toDate: new Date("2026-12-31T23:59:59Z") },
    });
    await expect(prisma.invoice.update({ where: { id: w.invoice.id }, data: { total: 1 } })).rejects.toThrow(PERMISSION);
    await expect(prisma.chargeLineItem.update({ where: { id: w.line.id }, data: { amount: 1 } })).rejects.toThrow(PERMISSION);
    await expect(prisma.chargeLineItem.delete({ where: { id: w.line.id } })).rejects.toThrow(PERMISSION);
    const r = await prisma.receipt.create({ data: { number: "RCP-2026-1002", year: 2026, direction: "OUT", kind: "EXPENSE", amount: 5 } });
    await expect(
      prisma.cashOut.create({ data: { country: "Turkey", year: 2026, category: "EXPENSE", bankId: w.bank.id, amount: 5, paidAt: new Date("2026-10-01"), receiptId: r.id } }),
    ).rejects.toThrow(PERMISSION);
    // Another country's year is still open.
    const other = await prisma.shipment.create({ data: { code: "W-2", mode: "SEA", originCountry: "China", businessYear: 2026 } });
    await prisma.invoice.create({ data: { number: "INV-2026-0002", customerId: w.custB.id, shipmentId: other.id, total: 10, businessYear: 2026 } });
  });
});

describe("a closed year stays closed; only a Super Admin reopens it (ADR-031)", () => {
  async function person(superAdmin: boolean) {
    const r = superAdmin
      ? await prisma.role.upsert({ where: { key: "super_admin" }, create: { key: "super_admin", name: "Super Admin" }, update: {} })
      : await prisma.role.create({ data: { key: `mgr-${Date.now()}-${Math.random()}`, name: "Accounting manager" } });
    const u = await prisma.user.create({ data: { email: `${Date.now()}-${Math.random()}@orbit.so`, status: "ACTIVE" } });
    await prisma.userRole.create({ data: { userId: u.id, roleId: r.id } });
    return (await loadAuthzUser(prisma, u.id))!;
  }
  const closeYear = () =>
    prisma.periodClose.create({ data: { country: "Turkey", year: 2026, period: "YEAR", fromDate: new Date("2026-01-01"), toDate: new Date("2026-12-31T23:59:59Z") } });

  it("no status change, edit, new cargo line, new shipment or delete in the closed year", async () => {
    const w = await world();
    const admin = await person(true);
    await closeYear();
    await expect(changeShipmentStatus(prisma, admin, w.shipment.id, "DEPARTED")).rejects.toThrow(/closed/); // the app says no
    await expect(prisma.shipment.update({ where: { id: w.shipment.id }, data: { status: "DEPARTED" } })).rejects.toThrow(PERMISSION); // so does the database
    await expect(prisma.shipment.update({ where: { id: w.shipment.id }, data: { destCode: "XXX" } })).rejects.toThrow(PERMISSION);
    await expect(prisma.shipmentLine.create({ data: { shipmentId: w.shipment.id, customerId: w.custB.id, packages: 1, chargeableWeightKg: 1 } })).rejects.toThrow(PERMISSION);
    await expect(prisma.shipmentLine.updateMany({ where: { shipmentId: w.shipment.id }, data: { packages: 99 } })).rejects.toThrow(PERMISSION);
    await expect(prisma.shipment.create({ data: { code: "W-9", mode: "AIR", originCountry: "Turkey", businessYear: 2026 } })).rejects.toThrow(PERMISSION);
    await expect(prisma.$executeRaw`DELETE FROM "Shipment" WHERE "id" = ${w.shipment.id}`).rejects.toThrow(PERMISSION);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: w.shipment.id } })).status).toBe("AT_ORIGIN_STORE");
    // Another country's 2026 is not affected.
    await prisma.shipment.create({ data: { code: "W-2", mode: "SEA", originCountry: "India", businessYear: 2026 } });
  });

  it("the database refuses a reopen recorded under anyone but an active Super Admin", async () => {
    await world();
    const manager = await person(false);
    const admin = await person(true);
    const close = await closeYear();
    await expect(prisma.periodClose.update({ where: { id: close.id }, data: { reopenedAt: new Date(), reopenedBy: manager.id } })).rejects.toThrow(/only a Super Admin/);
    await expect(prisma.periodClose.update({ where: { id: close.id }, data: { reopenedAt: new Date(), reopenedBy: null } })).rejects.toThrow(/only a Super Admin/);
    await prisma.user.update({ where: { id: admin.id }, data: { status: "SUSPENDED" } });
    await expect(prisma.periodClose.update({ where: { id: close.id }, data: { reopenedAt: new Date(), reopenedBy: admin.id } })).rejects.toThrow(/only a Super Admin/);
    await prisma.user.update({ where: { id: admin.id }, data: { status: "ACTIVE" } });
    await prisma.periodClose.update({ where: { id: close.id }, data: { reopenedAt: new Date(), reopenedBy: admin.id } });
    // Open again: work continues.
    const w = await prisma.shipment.findFirstOrThrow({ where: { code: "W-1" } });
    await changeShipmentStatus(prisma, admin, w.id, "DEPARTED");
  });

  it("only Orbit profit (and debts owed to us) can be carried into a new year", async () => {
    const base = { country: "Turkey", year: 2027, fromYear: 2026, carried: true };
    for (const source of ["COMMISSION", "TRANSFER", "SOMALI_TRANSPORT", "MAHAD", "SHIPMENT_COST", "OTHER"] as const) {
      await expect(prisma.openingEntry.createMany({ data: [{ ...base, kind: "SOURCE", source, amount: 100 }] })).rejects.toThrow(/only_profit_carries/);
    }
    await expect(prisma.openingEntry.createMany({ data: [{ ...base, kind: "DEBT", source: "DEBT", amount: -5 }] })).rejects.toThrow(/only_profit_carries/);
    await prisma.openingEntry.createMany({ data: [{ ...base, kind: "SOURCE", source: "PROFIT", amount: 100 }, { ...base, kind: "TOTAL", amount: 100 }] });
    expect(await prisma.openingEntry.count()).toBe(2);
  });
});

describe("customer connection (Row-Level Security)", () => {
  it("sees nothing at all until the signed-in customer is set", async () => {
    await world();
    expect(await portal.customer.count()).toBe(0);
    expect(await portal.invoice.count()).toBe(0);
    expect(await portal.receipt.count()).toBe(0);
    expect(await portal.shipment.count()).toBe(0);
    expect(await portal.$queryRaw<unknown[]>`SELECT * FROM "Payment"`).toHaveLength(0);
  });

  it("customer B sees only B, even with a query that forgets every filter", async () => {
    const w = await world();
    const seen = await withCustomerDb(w.custB.id, async (db) => ({
      customers: await db.customer.findMany(),
      invoices: await db.invoice.findMany(),
      invoiceById: await db.invoice.findUnique({ where: { id: w.invoice.id } }),
      receipts: await db.$queryRaw<unknown[]>`SELECT * FROM "Receipt"`,
      shipments: await db.shipment.findMany(),
      lines: await db.chargeLineItem.findMany(),
    }));
    expect(seen.customers.map((c) => c.ref)).toEqual(["OR-3002"]);
    expect(seen.invoices).toHaveLength(0);
    expect(seen.invoiceById).toBeNull();
    expect(seen.receipts).toHaveLength(0);
    expect(seen.shipments).toHaveLength(0);
    expect(seen.lines).toHaveLength(0);

    // Control: A sees A's own records.
    const own = await withCustomerDb(w.custA.id, async (db) => ({
      invoices: await db.invoice.count(),
      shipments: await db.shipment.count(),
      lines: await db.chargeLineItem.count(),
    }));
    expect(own).toEqual({ invoices: 1, shipments: 1, lines: 1 });
  });

  it("file bytes (ADR-030): a customer reads only the files of their own documents, and can't change any", async () => {
    const w = await world();
    const pdf = Buffer.from("%PDF-1.4 private to A", "latin1");
    const key = await dbStorage(prisma).put(pdf);
    await prisma.document.create({ data: { kind: "OTHER", storageKey: key, contentType: "application/pdf", size: pdf.length, customerId: w.custA.id } });
    expect(await portal.storedFile.count()).toBe(0); // no customer set
    expect(await withCustomerDb(w.custB.id, (db) => db.storedFile.findMany())).toHaveLength(0);
    await expect(withCustomerDb(w.custB.id, (db) => dbStorage(db).get(key))).rejects.toThrow(/not found/i);
    expect(await withCustomerDb(w.custA.id, (db) => dbStorage(db).get(key))).toEqual(pdf);
    await expect(withCustomerDb(w.custA.id, (db) => db.$executeRaw`DELETE FROM "StoredFile"`)).rejects.toThrow(/permission denied/i);
    await expect(withCustomerDb(w.custA.id, (db) => db.$executeRaw`UPDATE "StoredFile" SET "size" = 1`)).rejects.toThrow(/permission denied/i);
  });

  it("can't read accounts, passwords, sessions or the audit log", async () => {
    await world();
    for (const table of ["User", "LoginAttempt", "OtpCode", "AuditEvent", "Employee", "CashOut", "PeriodClose"]) {
      await expect(portal.$queryRawUnsafe(`SELECT * FROM "${table}" LIMIT 1`)).rejects.toThrow(/permission denied|does not exist/i);
    }
  });

  it("can't change anything, and can only file documents under the signed-in customer", async () => {
    const w = await world();
    await expect(
      withCustomerDb(w.custA.id, (db) => db.$executeRaw`UPDATE "Invoice" SET "total" = 0 WHERE "id" = ${w.invoice.id}`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withCustomerDb(w.custA.id, (db) => db.payment.create({ data: { customerId: w.custA.id, amount: 1000, method: "CASH" } })),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withCustomerDb(w.custB.id, (db) =>
        db.document.create({ data: { kind: "OTHER", storageKey: "planted", contentType: "application/pdf", size: 1, customerId: w.custA.id } }),
      ),
    ).rejects.toThrow(/row-level security/i);
    expect(await prisma.document.count()).toBe(0);
  });
});

describe("production boot guard", () => {
  it("accepts the app's and the customer's roles, and refuses to run as the table owner", async () => {
    await expect(assertLeastPrivilege(prisma, "DATABASE_URL")).resolves.toBeUndefined();
    await expect(assertLeastPrivilege(portal, "PORTAL_DATABASE_URL")).resolves.toBeUndefined();
    await expect(assertLeastPrivilege(ownerDb, "DATABASE_URL")).rejects.toThrow(/owns \d+ tables/);
  });
});
