import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { customerVolume, levelFromVolume } from "@/modules/customers/level";
import { createCustomer, listCustomers, updateCustomer } from "@/modules/customers/service";
import { buildSpecInvoice, lineMeasure, lineTotal } from "@/modules/finance/charges";
import { createSpecInvoice } from "@/modules/finance/invoices";
import { recordPayment } from "@/modules/finance/payments";
import { nextReceiptNumber } from "@/modules/finance/receipts";
import { addShipmentLine, changeShipmentStatus, createShipment } from "@/modules/shipments/service";
import { canTransition, statusSteps } from "@/modules/shipments/stateMachine";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;

async function superAdmin(): Promise<AuthzUser> {
  const role = await prisma.role.create({ data: { key: "super_admin", name: "Super Admin" } });
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

async function staff(perms: string[], country?: string): Promise<AuthzUser> {
  const role = await prisma.role.create({ data: { key: `role-${uniq()}`, name: "role" } });
  for (const p of perms) {
    const permission = await prisma.permission.upsert({ where: { key: p }, create: { key: p }, update: {} });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, country: country ?? null } });
  return (await loadAuthzUser(prisma, user.id))!;
}

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const cust = (admin: AuthzUser, extra: Record<string, string> = {}) =>
  createCustomer(prisma, admin, { name: `Cust ${uniq()}`, company: "Co", ...extra });

// --------------------------------------------------------------- statuses

describe("four statuses (ADR-017)", () => {
  it("Air goes At Origin Store → Departed → Transit → Arrived; Sea skips Transit", () => {
    expect(statusSteps("AIR")).toEqual(["AT_ORIGIN_STORE", "DEPARTED", "IN_TRANSIT", "ARRIVED"]);
    expect(statusSteps("SEA")).toEqual(["AT_ORIGIN_STORE", "DEPARTED", "ARRIVED"]);
    expect(canTransition("SEA", "DEPARTED", "IN_TRANSIT")).toBe(false);
    expect(canTransition("SEA", "DEPARTED", "ARRIVED")).toBe(true);
    expect(canTransition("AIR", "DEPARTED", "ARRIVED")).toBe(false);
    expect(canTransition("AIR", "ARRIVED", "DEPARTED")).toBe(false); // terminal
  });

  it("walks a Sea shipment to Arrived and refuses Transit", async () => {
    const admin = await superAdmin();
    const s = await createShipment(prisma, admin, { mode: "SEA", originCountry: "India", businessYear: 2026 });
    expect(s.status).toBe("AT_ORIGIN_STORE");
    await changeShipmentStatus(prisma, admin, s.id, "DEPARTED");
    await expect(changeShipmentStatus(prisma, admin, s.id, "IN_TRANSIT")).rejects.toThrow(/illegal transition/i);
    const arrived = await changeShipmentStatus(prisma, admin, s.id, "ARRIVED");
    expect(arrived.status).toBe("ARRIVED");
    expect(arrived.arrivedAt).toBeInstanceOf(Date);
  });
});

// --------------------------------------------------------------- shipments

describe("shipment creation (spec B6)", () => {
  it("defaults the destination to Mogadishu, stores AWB and dates, numbers W-1 per country", async () => {
    const admin = await superAdmin();
    const s = await createShipment(prisma, admin, {
      mode: "AIR",
      originCountry: "turkey", // case-insensitive, canonicalised
      originCity: "Istanbul",
      businessYear: 2026,
      awbNumber: "235-12345675",
      shipDate: new Date("2026-03-01"),
      arrivalDate: new Date("2026-03-05"),
    });
    expect(s.code).toBe("W-1");
    expect(s.originCountry).toBe("Turkey");
    expect([s.destCountry, s.destCity, s.destCode]).toEqual(["Somalia", "Mogadishu", "MGQ"]);
    const air = await prisma.airDetail.findUnique({ where: { shipmentId: s.id } });
    expect(air?.awbNumber).toBe("235-12345675");
    const india = await createShipment(prisma, admin, { mode: "AIR", originCountry: "India", businessYear: 2026 });
    // Numbering restarts per country; the stored code is made globally unique
    // with an @<ISO><year> suffix, and the UI shows the part before "@".
    expect(india.code.split("@")[0]).toBe("W-1");
  });

  it("rejects Road, unknown countries, inactive countries and years that weren't created", async () => {
    const admin = await superAdmin();
    await expect(createShipment(prisma, admin, { mode: "ROAD", originCountry: "Turkey", businessYear: 2026 })).rejects.toThrow(/road/i);
    await expect(createShipment(prisma, admin, { mode: "AIR", originCountry: "Narnia", businessYear: 2026 })).rejects.toThrow(/origin country/i);
    // Somalia is the destination, not an origin.
    await expect(createShipment(prisma, admin, { mode: "AIR", originCountry: "Somalia", businessYear: 2026 })).rejects.toThrow(/origin country/i);
    await prisma.country.update({ where: { iso2: "in" }, data: { active: false } });
    await expect(createShipment(prisma, admin, { mode: "AIR", originCountry: "India", businessYear: 2026 })).rejects.toThrow(/inactive/i);
    await expect(createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2027 })).rejects.toThrow(/2027/);
  });

  it("stacks several entries for one customer and validates measures by mode", async () => {
    const admin = await superAdmin();
    const c = await cust(admin);
    const air = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    await addShipmentLine(prisma, admin, air.id, { customerId: c.id, packages: 10, mixCount: 2, chargeableWeightKg: "120.5", mixKg: "4.5" });
    await addShipmentLine(prisma, admin, air.id, { customerId: c.id, packages: 1, chargeableWeightKg: "5" });
    expect(await prisma.shipmentLine.count({ where: { shipmentId: air.id, customerId: c.id } })).toBe(2);

    await expect(addShipmentLine(prisma, admin, air.id, { customerId: c.id, volumeCbm: 1 })).rejects.toThrow(/KG/);
    await expect(addShipmentLine(prisma, admin, air.id, { customerId: c.id, chargeableWeightKg: "-1" })).rejects.toThrow(/negative/i);
    await expect(addShipmentLine(prisma, admin, air.id, { customerId: c.id, packages: 1.5 })).rejects.toThrow(/whole number/i);
    const sea = await createShipment(prisma, admin, { mode: "SEA", originCountry: "Turkey", businessYear: 2026 });
    await expect(addShipmentLine(prisma, admin, sea.id, { customerId: c.id, chargeableWeightKg: 10 })).rejects.toThrow(/CBM/);
  });
});

// --------------------------------------------------------------- customers

describe("customers (spec A1/B5)", () => {
  it("assigns OR-3000 onwards and requires a company", async () => {
    const admin = await superAdmin();
    const a = await cust(admin);
    const b = await cust(admin);
    expect([a.ref, b.ref]).toEqual(["OR-3000", "OR-3001"]);
    await expect(createCustomer(prisma, admin, { name: "No Co" })).rejects.toThrow(/company is required/i);
    await expect(createCustomer(prisma, admin, { name: "  ", company: "X" })).rejects.toThrow(/name is required/i);
  });

  it("rejects a duplicate email (any case) and a duplicate phone (any formatting)", async () => {
    const admin = await superAdmin();
    await cust(admin, { email: "Amina@Shop.so", phone: "+252 61-555 0100" });
    await expect(cust(admin, { email: "amina@shop.so" })).rejects.toThrow(/email already exists/i);
    await expect(cust(admin, { phone: "252615550100" })).rejects.toThrow(/phone number already exists/i);
    const other = await cust(admin, { email: "other@shop.so" });
    await expect(updateCustomer(prisma, admin, other.id, { email: "AMINA@shop.so" })).rejects.toThrow(/email already exists/i);
    // Updating a customer to its own contact details is fine.
    await expect(updateCustomer(prisma, admin, other.id, { email: "other@shop.so" })).resolves.toBeTruthy();
  });

  it("enforces uniqueness in the database too (concurrent creates)", async () => {
    const admin = await superAdmin();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => cust(admin, { email: "race@shop.so" })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.customer.count({ where: { email: "race@shop.so" } })).toBe(1);
  });

  it("a search never widens a country-scoped staff member's view", async () => {
    const admin = await superAdmin();
    await cust(admin, { country: "India" } as Record<string, string>);
    await prisma.customer.updateMany({ data: { country: "India", name: "Findme Trading" } });
    const turkeyStaff = await staff(["customers:read"], "Turkey");
    const page = await listCustomers(prisma, turkeyStaff, { query: "Findme" });
    expect(page.total).toBe(0);
  });
});

// --------------------------------------------------------------- level

describe("customer level (ADR-014)", () => {
  it("takes the higher of the air-KG and sea-CBM tiers", () => {
    expect(levelFromVolume(0, 0)).toBe("D");
    expect(levelFromVolume(99.9, 0)).toBe("D");
    expect(levelFromVolume(100, 0)).toBe("C");
    expect(levelFromVolume(300, 0)).toBe("B");
    expect(levelFromVolume(1000, 0)).toBe("A");
    expect(levelFromVolume(150, 4)).toBe("B"); // sea tier wins
    expect(levelFromVolume(0, 10)).toBe("A");
  });

  it("counts MIX KG and only the selected year", async () => {
    const admin = await superAdmin();
    await prisma.businessYear.create({ data: { year: 2025 } });
    const c = await cust(admin);
    const s26 = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    const s25 = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2025 });
    await addShipmentLine(prisma, admin, s26.id, { customerId: c.id, chargeableWeightKg: "280", mixKg: "20" });
    await addShipmentLine(prisma, admin, s25.id, { customerId: c.id, chargeableWeightKg: "5000" });
    const v = await customerVolume(prisma, c.id, 2026);
    expect(v.airKg.toString()).toBe("300");
    expect(v.level).toBe("B");
    expect((await customerVolume(prisma, c.id, 2025)).level).toBe("A");
  });
});

// --------------------------------------------------------------- charges

describe("line totals (ADR-013)", () => {
  it("measure = KG + MIX KG for Air, CBM for Sea", () => {
    expect(lineMeasure("AIR", { chargeableWeightKg: "100.5", mixKg: "2.25" }).toString()).toBe("102.75");
    expect(lineMeasure("SEA", { volumeCbm: "3.4", chargeableWeightKg: "999" }).toString()).toBe("3.4");
  });

  it("computes measure×rate + quality + brand + fatura + delivery + other − discount in Decimal", () => {
    const total = lineTotal("AIR", {
      chargeableWeightKg: "100",
      mixKg: "0.1", // measure 100.1
      rate: "6.5",
      qualityRate: "0.5",
      brandPcs: 3,
      brandRate: "2.10",
      fatura: "15",
      delivery: "10",
      other: "0.1",
      discount: "5.2",
    });
    // 100.1×6.5 = 650.65; 100.1×0.5 = 50.05; 3×2.10 = 6.30; +15 +10 +0.1 − 5.2 = 726.90
    expect(total.toString()).toBe("726.9");
    // 0.335 × 0.015 = 0.005025 → 0.01; 0.333 × 0.015 = 0.004995 → 0.00 (HALF_UP)
    expect(lineTotal("SEA", { volumeCbm: "0.335", rate: "0.015" }).toString()).toBe("0.01");
    expect(lineTotal("SEA", { volumeCbm: "0.333", rate: "0.015" }).toString()).toBe("0");
  });

  it("rejects negative inputs and a discount larger than the charges", () => {
    expect(() => lineTotal("AIR", { chargeableWeightKg: "1", rate: "-1" })).toThrow(/negative/i);
    expect(() => lineTotal("AIR", { chargeableWeightKg: "1", rate: "1", discount: "2" })).toThrow(/discount/i);
  });
});

describe("spec invoice (B9 / A6)", () => {
  it("shows one combined rate, only entered extras, discount before total, and computes commission", () => {
    const inv = buildSpecInvoice({
      actualMeasure: "98",
      billedMeasure: "100",
      baseRate: "6",
      qualityRate: "0.5",
      agentRate: "1",
      agentName: "Agent Co",
      fatura: "20",
      localDelivery: "0", // not entered → no line
      discount: "10",
    });
    expect(inv.combinedRate.toString()).toBe("7.5");
    expect(inv.lines.map((l) => l.category)).toEqual(["FREIGHT", "FATURA"]);
    expect(inv.subtotal.toString()).toBe("770");
    expect(inv.total.toString()).toBe("760");
    expect(inv.commissionAmount.toString()).toBe("100");
    expect(inv.extraMeasure.toString()).toBe("2");
  });

  it("refuses zero billed measure, zero rate and an oversize discount", () => {
    expect(() => buildSpecInvoice({ actualMeasure: 1, billedMeasure: 0, baseRate: 5 })).toThrow(/billed/i);
    expect(() => buildSpecInvoice({ actualMeasure: 1, billedMeasure: 1, baseRate: 0 })).toThrow(/rate/i);
    expect(() => buildSpecInvoice({ actualMeasure: 1, billedMeasure: 1, baseRate: 5, discount: 6 })).toThrow(/discount/i);
  });

  it("persists the invoice; payments move it Unpaid → Partial → Paid against the discounted total", async () => {
    const admin = await superAdmin();
    const c = await cust(admin);
    const s = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    const inv = await createSpecInvoice(prisma, admin, {
      customerId: c.id,
      shipmentId: s.id,
      businessYear: 2026,
      actualMeasure: "50",
      billedMeasure: "50",
      baseRate: "6",
      agentRate: "1",
      discount: "50",
    });
    expect(inv.total.toString()).toBe("300"); // 50×7 − 50
    expect(inv.discount.toString()).toBe("50");
    expect(inv.commissionAmount.toString()).toBe("50");

    await recordPayment(prisma, admin, { customerId: c.id, amount: "100", method: "CASH", allocations: [{ invoiceId: inv.id, amount: "100" }] });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PARTIAL");
    await recordPayment(prisma, admin, { customerId: c.id, amount: "200", method: "CASH", allocations: [{ invoiceId: inv.id, amount: "200" }] });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PAID");
    await expect(
      recordPayment(prisma, admin, { customerId: c.id, amount: "1", method: "CASH", allocations: [{ invoiceId: inv.id, amount: "1" }] }),
    ).rejects.toThrow(/balance/i);
  });
});

// --------------------------------------------------------------- receipts

describe("receipts (every money movement)", () => {
  it("issues RCP-<year>-1001, 1002… for payments, with the bank recorded", async () => {
    const admin = await superAdmin();
    const c = await cust(admin);
    const salaam = await prisma.bank.findUniqueOrThrow({ where: { name: "Salaam Bank" } });
    const p1 = await recordPayment(prisma, admin, { customerId: c.id, amount: "10", method: "BANK_TRANSFER", bankId: salaam.id, receivedAt: new Date("2026-04-02T10:00:00Z") });
    const p2 = await recordPayment(prisma, admin, { customerId: c.id, amount: "20", method: "CASH", receivedAt: new Date("2026-04-03T10:00:00Z") });
    const r1 = await prisma.receipt.findUniqueOrThrow({ where: { paymentId: p1.id } });
    const r2 = await prisma.receipt.findUniqueOrThrow({ where: { paymentId: p2.id } });
    expect([r1.number, r2.number]).toEqual(["RCP-2026-1001", "RCP-2026-1002"]);
    expect(r1.bankId).toBe(salaam.id);
    expect(r1.amount.toString()).toBe("10");
    expect([r1.direction, r1.kind, r1.customerId]).toEqual(["IN", "PAYMENT", c.id]);
  });

  it("numbers per year and never hands out the same number under concurrency", async () => {
    const admin = await superAdmin();
    const c = await cust(admin);
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        recordPayment(prisma, admin, { customerId: c.id, amount: String(i + 1), method: "CASH", receivedAt: new Date("2026-06-01T00:00:00Z") }),
      ),
    );
    const numbers = (await prisma.receipt.findMany({ select: { number: true } })).map((r) => r.number).sort();
    expect(new Set(numbers).size).toBe(12);
    expect(numbers[0]).toBe("RCP-2026-1001");
    expect(numbers[11]).toBe("RCP-2026-1012");
    const next2027 = await prisma.$transaction((tx) => nextReceiptNumber(tx, 2027));
    expect(next2027).toBe("RCP-2027-1001");
  });

  it("a failed payment leaves no receipt and burns no number", async () => {
    const admin = await superAdmin();
    const c = await cust(admin);
    const inactive = await prisma.bank.update({ where: { name: "Premier Bank" }, data: { active: false } });
    await expect(recordPayment(prisma, admin, { customerId: c.id, amount: "5", method: "BANK_TRANSFER", bankId: inactive.id })).rejects.toThrow(/bank/i);
    await expect(
      recordPayment(prisma, admin, { customerId: c.id, amount: "5", method: "CASH", allocations: [{ invoiceId: "nope", amount: "5" }] }),
    ).rejects.toThrow(/invoice not found/i);
    expect(await prisma.receipt.count()).toBe(0);
    const ok = await recordPayment(prisma, admin, { customerId: c.id, amount: "5", method: "CASH", receivedAt: new Date("2026-07-01T00:00:00Z") });
    expect((await prisma.receipt.findUniqueOrThrow({ where: { paymentId: ok.id } })).number).toBe("RCP-2026-1001");
  });

  it("the database refuses a non-positive receipt", async () => {
    await expect(
      prisma.receipt.create({ data: { number: "RCP-2026-9999", year: 2026, direction: "OUT", kind: "EXPENSE", amount: D(0) } }),
    ).rejects.toThrow();
  });
});

describe("reference data", () => {
  it("seeds the four banks with account numbers, the origin countries and 2026 as current", async () => {
    const banks = await prisma.bank.findMany({ orderBy: { sortOrder: "asc" } });
    expect(banks.map((b) => [b.name, b.accountNumber])).toEqual([
      ["Salaam Bank", "37215407"],
      ["Dahabshiil Bank", "365258411"],
      ["Premier Bank", "25687140"],
      ["Cash", null],
    ]);
    const origins = await prisma.country.findMany({ where: { isOrigin: true }, orderBy: { name: "asc" } });
    expect(origins.map((c) => c.name)).toEqual(["India", "Turkey"]);
    const current = await prisma.businessYear.findMany({ where: { isCurrent: true } });
    expect(current.map((y) => y.year)).toEqual([2026]);
  });

  it("allows only one current year", async () => {
    await expect(prisma.businessYear.create({ data: { year: 2027, isCurrent: true } })).rejects.toThrow();
  });
});
