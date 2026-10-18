import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

beforeAll(() => {
  assertTestDatabase();
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function makeCustomer(ref = "OR-3000") {
  return prisma.customer.create({ data: { ref, name: "Acme Imports" } });
}

describe("unique constraints", () => {
  it("rejects a duplicate customer ref", async () => {
    await makeCustomer("OR-3000");
    await expect(makeCustomer("OR-3000")).rejects.toThrow();
  });

  it("rejects a duplicate shipment event idempotency key", async () => {
    const s = await prisma.shipment.create({
      data: { code: "W-1", mode: "AIR", originCountry: "Turkey", businessYear: 2026 },
    });
    await prisma.shipmentEvent.create({
      data: { shipmentId: s.id, type: "SCAN", idempotencyKey: "evt-1" },
    });
    await expect(
      prisma.shipmentEvent.create({
        data: { shipmentId: s.id, type: "SCAN", idempotencyKey: "evt-1" },
      }),
    ).rejects.toThrow();
  });
});

describe("CHECK constraints", () => {
  it("rejects a non-positive payment amount", async () => {
    const c = await makeCustomer();
    await expect(
      prisma.payment.create({
        data: { customerId: c.id, amount: new Prisma.Decimal(0), method: "CASH" },
      }),
    ).rejects.toThrow();
  });

  it("rejects a user linked to both an employee and a customer", async () => {
    const c = await makeCustomer();
    const e = await prisma.employee.create({
      data: { code: "EMP-001", name: "Mohamed", department: "MANAGEMENT" },
    });
    await expect(
      prisma.user.create({
        data: { email: "x@orbit.so", employeeId: e.id, customerId: c.id },
      }),
    ).rejects.toThrow();
  });

  it("rejects an invoice over-allocation (allocated > total)", async () => {
    const c = await makeCustomer();
    await expect(
      prisma.invoice.create({
        data: {
          number: "INV-1",
          customerId: c.id,
          total: new Prisma.Decimal("100.00"),
          amountAllocated: new Prisma.Decimal("150.00"),
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a negative shipment line weight", async () => {
    const c = await makeCustomer();
    const s = await prisma.shipment.create({
      data: { code: "W-2", mode: "AIR", originCountry: "Turkey", businessYear: 2026 },
    });
    await expect(
      prisma.shipmentLine.create({
        data: { shipmentId: s.id, customerId: c.id, chargeableWeightKg: new Prisma.Decimal("-1.5") },
      }),
    ).rejects.toThrow();
  });
});

describe("referential integrity", () => {
  it("prevents deleting a customer that has an invoice (onDelete: Restrict)", async () => {
    const c = await makeCustomer();
    await prisma.invoice.create({
      data: { number: "INV-2", customerId: c.id, total: new Prisma.Decimal("10.00") },
    });
    await expect(prisma.customer.delete({ where: { id: c.id } })).rejects.toThrow();
  });
});

describe("decimal money integrity", () => {
  it("stores and returns exact 2-decimal amounts (no float drift)", async () => {
    const c = await makeCustomer();
    const inv = await prisma.invoice.create({
      data: { number: "INV-3", customerId: c.id, total: new Prisma.Decimal("1234567.89") },
    });
    const read = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(read.total.toString()).toBe("1234567.89");
    expect(read.currency).toBe("USD");
  });
});

describe("append-only audit", () => {
  it("records an audit event with actor and metadata", async () => {
    const event = await prisma.auditEvent.create({
      data: {
        action: "customer.create",
        entityType: "Customer",
        entityId: "OR-3000",
        metadata: { via: "integration-test" },
      },
    });
    const read = await prisma.auditEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(read.action).toBe("customer.create");
    expect(read.createdAt).toBeInstanceOf(Date);
  });
});
