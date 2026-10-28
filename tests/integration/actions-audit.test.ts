import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { resetPin, setPin } from "@/modules/accounting/pin";
import { hashPassword, verifyPassword } from "@/modules/auth/password";
import { createCustomer, getCustomer, updateCustomer } from "@/modules/customers/service";
import { uploadAdminDocument } from "@/modules/documents/admin";
import { getDocumentForDownload, softDeleteDocument } from "@/modules/documents/service";
import { changeOwnPassword } from "@/modules/settings/service";
import { searchCustomers, updateShipment } from "@/modules/shipments/manage";
import { createShipment } from "@/modules/shipments/service";
import { createEmployee, getEmployee, setEmployeeActive, type SaveEmployeeInput } from "@/modules/users/admin";
import { assertTestDatabase, prisma, resetDb, testPhone } from "./helpers";

/**
 * Action audit (owner request 2026-10-28): the actions that had no test of
 * their own. Each case checks who may do it, what lands in the database (and
 * where), what is refused, and that an audit row is written.
 */
beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;

async function role(key: string, perms: string[]) {
  const r = await prisma.role.upsert({ where: { key }, create: { key, name: key }, update: {} });
  for (const p of perms) {
    const permission = await prisma.permission.upsert({ where: { key: p }, create: { key: p }, update: {} });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: r.id, permissionId: permission.id } },
      create: { roleId: r.id, permissionId: permission.id },
      update: {},
    });
  }
  return r;
}

async function superAdmin(): Promise<AuthzUser> {
  const r = await role("super_admin", []);
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: r.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

async function staff(perms: string[], country: string | null = null): Promise<AuthzUser> {
  const r = await role(`role-${uniq()}`, perms);
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: r.id, country } });
  return (await loadAuthzUser(prisma, user.id))!;
}

async function customerPrincipal(): Promise<AuthzUser> {
  const c = await prisma.customer.create({ data: { ref: `OR-${4000 + seq++}`, name: "C", company: "C Co" } });
  const u = await prisma.user.create({ data: { email: `${uniq()}@shop.so`, status: "ACTIVE", customerId: c.id } });
  return (await loadAuthzUser(prisma, u.id))!;
}

const audits = (action: string, entityId?: string) => prisma.auditEvent.count({ where: { action, ...(entityId ? { entityId } : {}) } });

describe("Edit Shipment (updateShipment)", () => {
  it("saves dates, cities and the AWB into the right tables, with an audit row", async () => {
    const admin = await superAdmin();
    const air = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    const sea = await createShipment(prisma, admin, { mode: "SEA", originCountry: "India", businessYear: 2026 });
    const tr = await staff(["shipments:read", "shipments:write"], "Turkey");

    await updateShipment(prisma, tr, air.id, { shipDate: new Date("2026-10-01"), arrivalDate: new Date("2026-10-05"), originCity: " IST ", destCode: "MGQ", awb: "235-1234 5678" });
    const a = await prisma.shipment.findUniqueOrThrow({ where: { id: air.id }, include: { airDetail: true } });
    expect(a.originCity).toBe("IST"); // trimmed
    expect(a.destCode).toBe("MGQ");
    expect(a.airDetail?.awbNumber).toBe("235-1234 5678"); // air → AirDetail.awbNumber
    expect(await audits("shipment.update", air.id)).toBe(1);

    await updateShipment(prisma, admin, sea.id, { awb: "BL-778899" });
    expect((await prisma.seaDetail.findUniqueOrThrow({ where: { shipmentId: sea.id } })).blNumber).toBe("BL-778899"); // sea → SeaDetail.blNumber
  });

  it("refuses the wrong country, a customer, arrival before departure, and a closed year", async () => {
    const admin = await superAdmin();
    const air = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    const india = await staff(["shipments:read", "shipments:write"], "India");
    const reader = await staff(["shipments:read"], "Turkey");
    await expect(updateShipment(prisma, india, air.id, { destCode: "X" })).rejects.toThrow();
    await expect(updateShipment(prisma, reader, air.id, { destCode: "X" })).rejects.toThrow();
    await expect(updateShipment(prisma, await customerPrincipal(), air.id, { destCode: "X" })).rejects.toThrow();
    await expect(updateShipment(prisma, admin, air.id, { shipDate: new Date("2026-10-05"), arrivalDate: new Date("2026-10-01") })).rejects.toThrow(/before/);

    await prisma.periodClose.create({ data: { country: "Turkey", year: 2026, period: "YEAR", fromDate: new Date("2026-01-01"), toDate: new Date("2026-12-31T23:59:59Z") } });
    await expect(updateShipment(prisma, admin, air.id, { originCity: "X" })).rejects.toThrow();
    expect((await prisma.shipment.findUniqueOrThrow({ where: { id: air.id } })).originCity).toBeNull(); // nothing changed
    expect(await audits("shipment.update", air.id)).toBe(0);
  });
});

describe("Customer search in Shipments / Documents (searchCustomers)", () => {
  it("never shows a country-scoped staff member customers of other countries", async () => {
    const admin = await superAdmin();
    await prisma.customer.createMany({
      data: [
        { ref: "OR-3001", name: "Ali Turkey", company: "T", country: "Turkey" },
        { ref: "OR-3002", name: "Ali China", company: "C", country: "China" },
        { ref: "OR-3003", name: "Ali Unassigned", company: "U" },
        { ref: "OR-3004", name: "Ali Inactive", company: "I", country: "Turkey", status: "INACTIVE" },
      ],
    });
    const tr = await staff(["customers:read"], "Turkey");
    expect((await searchCustomers(prisma, tr, "ali")).map((c) => c.ref)).toEqual(["OR-3001", "OR-3003"]);
    expect((await searchCustomers(prisma, tr, "OR-3002")).map((c) => c.ref)).toEqual([]);
    expect((await searchCustomers(prisma, admin, "ali")).map((c) => c.ref)).toEqual(["OR-3001", "OR-3002", "OR-3003"]);
    await expect(searchCustomers(prisma, await customerPrincipal(), "ali")).rejects.toThrow();
    await expect(searchCustomers(prisma, await staff(["shipments:read"]), "ali")).rejects.toThrow();
  });
});

describe("Change my password (Settings)", () => {
  async function withPassword(pw: string) {
    const u = await staff([]);
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(pw) } });
    return u;
  }

  it("needs the current password, enforces the rules, then ends every other session", async () => {
    const u = await withPassword("OldPassw0rd!x");
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).sessionEpoch;
    await expect(changeOwnPassword(prisma, u, "wrong-one-123", "NewPassw0rd!x", "NewPassw0rd!x")).rejects.toThrow("Current password is wrong");
    await expect(changeOwnPassword(prisma, u, "OldPassw0rd!x", "short1", "short1")).rejects.toThrow();
    await expect(changeOwnPassword(prisma, u, "OldPassw0rd!x", "NewPassw0rd!x", "Different0!x")).rejects.toThrow();

    await changeOwnPassword(prisma, u, "OldPassw0rd!x", "NewPassw0rd!x", "NewPassw0rd!x");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await verifyPassword(after.passwordHash!, "NewPassw0rd!x")).toBe(true);
    expect(await verifyPassword(after.passwordHash!, "OldPassw0rd!x")).toBe(false);
    expect(after.sessionEpoch).toBe(before + 1); // other sessions are signed out
    expect(await audits("auth.password_change", u.id)).toBe(1);
  });

  it("stops guessing the current password after 5 wrong tries", async () => {
    const u = await withPassword("OldPassw0rd!x");
    for (let i = 0; i < 5; i++) {
      await expect(changeOwnPassword(prisma, u, `guess-${i}-xyz`, "NewPassw0rd!x", "NewPassw0rd!x")).rejects.toThrow("Current password is wrong");
    }
    // Even the right password is refused while the limit holds.
    await expect(changeOwnPassword(prisma, u, "OldPassw0rd!x", "NewPassw0rd!x", "NewPassw0rd!x")).rejects.toThrow(/too many/i);
    expect(await verifyPassword((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash!, "OldPassw0rd!x")).toBe(true);
  });
});

describe("Users & Team: open, suspend, reset PIN", () => {
  beforeEach(() => role("finance_staff", ["invoices:read", "payments:read", "customers:read"]));

  function emp(over: Partial<SaveEmployeeInput> = {}): SaveEmployeeInput {
    return {
      name: "Asha Ali",
      email: `${uniq()}@orbit.so`,
      phone: "+252 61 000",
      department: "FINANCE",
      roleKeys: ["finance_staff"],
      countries: ["Turkey"],
      access: {},
      accountingAccess: true,
      transferRole: "NONE",
      transferCountries: [],
      ...over,
    };
  }

  it("Edit opens what was saved; only users:read may open it", async () => {
    const admin = await superAdmin();
    const created = await createEmployee(prisma, admin, emp({ name: "Hodan" }));
    const detail = await getEmployee(prisma, admin, created.userId);
    expect(detail).toMatchObject({ name: "Hodan", department: "FINANCE", countries: ["Turkey"], accountingAccess: true });
    expect(detail.code).toMatch(/^EMP-\d+/);
    await expect(getEmployee(prisma, await staff(["customers:read"]), created.userId)).rejects.toThrow();
  });

  it("suspending signs the person out at once and leaves no permissions; nobody suspends themselves", async () => {
    const admin = await superAdmin();
    const created = await createEmployee(prisma, admin, emp());
    await prisma.user.update({ where: { id: created.userId }, data: { status: "ACTIVE" } });
    const epoch = (await prisma.user.findUniqueOrThrow({ where: { id: created.userId } })).sessionEpoch;

    await setEmployeeActive(prisma, admin, created.userId, false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: created.userId } })).sessionEpoch).toBe(epoch + 1);
    expect([...(await loadAuthzUser(prisma, created.userId))!.permissions]).toEqual(["self:read"]); // own profile only
    expect(await audits("employee.deactivate")).toBe(1);
    expect((await getEmployee(prisma, admin, created.userId)).status).toBe("SUSPENDED");

    await setEmployeeActive(prisma, admin, created.userId, true);
    expect((await loadAuthzUser(prisma, created.userId))!.permissions.size).toBeGreaterThan(0);

    await expect(setEmployeeActive(prisma, admin, admin.id, false)).rejects.toThrow(/own status/);
    const manager = await staff(["users:manage"]);
    const otherAdmin = await superAdmin();
    await expect(setEmployeeActive(prisma, manager, otherAdmin.id, false)).rejects.toThrow();
  });

  it("only a Super Admin resets an accounting PIN; the person then sets a new one", async () => {
    const admin = await superAdmin();
    const created = await createEmployee(prisma, admin, emp());
    const person = await (async () => {
      await prisma.user.update({ where: { id: created.userId }, data: { status: "ACTIVE" } });
      return (await loadAuthzUser(prisma, created.userId))!;
    })();
    await setPin(prisma, person, "482913", "482913");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: person.id } })).accountingPinHash).not.toBeNull();

    await expect(resetPin(prisma, await staff(["users:manage"]), person.id)).rejects.toThrow(/super admin/i);
    await resetPin(prisma, admin, person.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: person.id } })).accountingPinHash).toBeNull();
    expect(await audits("accounting.pin_reset", person.id)).toBe(1);
  });
});

describe("Customers: create / edit stay inside the staff member's countries", () => {
  it("can't open, edit or move a customer of another country, nor create one there", async () => {
    const admin = await superAdmin();
    const india = await createCustomer(prisma, admin, { name: "In", company: "In Co", phone: testPhone(), country: "India" });
    const open = await createCustomer(prisma, admin, { name: "Un", company: "Un Co", phone: testPhone() });
    const tr = await staff(["customers:read", "customers:write"], "Turkey");

    await expect(updateCustomer(prisma, tr, india.id, { name: "Hijacked" })).rejects.toThrow(/not found/i);
    expect(await getCustomer(prisma, tr, india.id)).toBeNull();
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: india.id } })).name).toBe("In");

    await updateCustomer(prisma, tr, open.id, { name: "Renamed", country: "Turkey" }); // unassigned → own country: fine
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: open.id } })).name).toBe("Renamed");
    await expect(updateCustomer(prisma, tr, open.id, { country: "India" })).rejects.toThrow(/scope/);
    await expect(createCustomer(prisma, tr, { name: "X", company: "X Co", phone: testPhone(), country: "India" })).rejects.toThrow(/scope/);
    await updateCustomer(prisma, admin, india.id, { name: "In 2" }); // a Super Admin reaches every country
  });
});

describe("Documents: a shipment's papers stay with the shipment's country", () => {
  it("staff of another country can't download or delete them by id", async () => {
    const admin = await superAdmin();
    const pdf = Buffer.from("%PDF-1.4 awb", "latin1");
    const inShip = await createShipment(prisma, admin, { mode: "AIR", originCountry: "India", businessYear: 2026 });
    const trShip = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    const up = (shipmentId: string) =>
      uploadAdminDocument(prisma, admin, { target: "shipment", shipmentId, part: "ORIGIN_AWB", file: { buffer: pdf, name: "awb.pdf", type: "application/pdf" } });
    const inDoc = await up(inShip.id);
    const trDoc = await up(trShip.id);
    const tr = await staff(["documents:manage"], "Turkey");

    await expect(getDocumentForDownload(prisma, tr, inDoc.id)).rejects.toThrow();
    await expect(softDeleteDocument(prisma, tr, inDoc.id)).rejects.toThrow();
    expect((await prisma.document.findUniqueOrThrow({ where: { id: inDoc.id } })).deletedAt).toBeNull();

    expect((await getDocumentForDownload(prisma, tr, trDoc.id))!.buffer).toEqual(pdf);
    await softDeleteDocument(prisma, tr, trDoc.id);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: trDoc.id } })).deletedAt).not.toBeNull(); // soft: row and file kept
    expect(await prisma.storedFile.count({ where: { key: trDoc.storageKey } })).toBe(1);
    expect(await getDocumentForDownload(prisma, tr, trDoc.id)).toBeNull();
    await expect(softDeleteDocument(prisma, tr, trDoc.id)).rejects.toThrow(/not found/i);
  });
});
