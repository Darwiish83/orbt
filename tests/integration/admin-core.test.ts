import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { can, loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { createCustomer } from "@/modules/customers/service";
import { deleteCustomer, getCustomerDetails, listAdminCustomers, setCustomerStatus } from "@/modules/customers/admin";
import { listAdminDocuments, uploadAdminDocument } from "@/modules/documents/admin";
import { listDocuments } from "@/modules/documents/service";
import { createShipmentInvoice } from "@/modules/finance/shipmentFinance";
import { createAnnouncement, getNotificationImage, listNotificationsAdmin, publishDueAnnouncements } from "@/modules/notifications/announcements";
import { getAdminReport, getReport } from "@/modules/reporting/service";
import { addCountry, createYear, getSettings, removeCountry, saveSettings, setCurrentYear } from "@/modules/settings/service";
import {
  deleteShipment,
  deleteShipmentLine,
  getAdminShipment,
  listOperations,
  notifyShipmentLine,
  setAwbKg,
  updateShipmentLine,
} from "@/modules/shipments/manage";
import { addShipmentLine, changeShipmentStatus, createShipment } from "@/modules/shipments/service";
import { createEmployee, setRoleModule, updateEmployee, type SaveEmployeeInput } from "@/modules/users/admin";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082", "hex");

async function superAdmin(): Promise<AuthzUser> {
  const role = await prisma.role.upsert({ where: { key: "super_admin" }, create: { key: "super_admin", name: "Super Admin" }, update: {} });
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

async function role(key: string, perms: string[]) {
  const r = await prisma.role.upsert({ where: { key }, create: { key, name: key }, update: {} });
  for (const p of perms) {
    const permission = await prisma.permission.upsert({ where: { key: p }, create: { key: p }, update: {} });
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: r.id, permissionId: permission.id } }, create: { roleId: r.id, permissionId: permission.id }, update: {} });
  }
  return r;
}

async function staff(perms: string[], country: string | null = null): Promise<AuthzUser> {
  const r = await role(`role-${uniq()}`, perms);
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: r.id, country } });
  return (await loadAuthzUser(prisma, user.id))!;
}

const reload = async (u: AuthzUser) => (await loadAuthzUser(prisma, u.id))!;

function emp(over: Partial<SaveEmployeeInput> = {}): SaveEmployeeInput {
  return {
    name: "Asha Ali",
    email: `${uniq()}@orbit.so`,
    phone: "+252 61 000",
    department: "FINANCE",
    roleKeys: ["finance_staff"],
    countries: [],
    access: {},
    accountingAccess: false,
    transferRole: "NONE",
    transferCountries: [],
    ...over,
  };
}

async function activate(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
  return (await loadAuthzUser(prisma, userId))!;
}

// ------------------------------------------------------------------ users & access

describe("Users & Team: access control enforced on the server", () => {
  it("module overrides: No access removes, View only keeps read, Full grants all", async () => {
    const admin = await superAdmin();
    await role("finance_staff", ["invoices:read", "invoices:write", "payments:read", "payments:write", "customers:read"]);
    const { userId, code } = await createEmployee(prisma, admin, emp());
    expect(code).toMatch(/^EMP-\d+/);
    let u = await activate(userId);
    expect([can(u, "invoices:write"), can(u, "customers:read"), can(u, "customers:write")]).toEqual([true, true, false]);

    await updateEmployee(prisma, admin, userId, emp({ email: u.email, access: { finance: "VIEW", customers: "NONE", documents: "EDIT" } }));
    u = await reload(u);
    expect(can(u, "invoices:read")).toBe(true);
    expect(can(u, "invoices:write")).toBe(false);
    expect(can(u, "payments:write")).toBe(false);
    expect(can(u, "customers:read")).toBe(false);
    expect(can(u, "documents:manage")).toBe(true);
  });

  it("an access window in the past or an inactive employee leaves no permissions", async () => {
    const admin = await superAdmin();
    await role("finance_staff", ["invoices:read"]);
    const { userId } = await createEmployee(prisma, admin, emp({ accessUntil: new Date(Date.now() - 86_400_000) }));
    const u = await activate(userId);
    expect(can(u, "invoices:read")).toBe(false);
    expect(u.scopes).toHaveLength(0);
  });

  it("responsible countries narrow every role scope", async () => {
    const admin = await superAdmin();
    await role("finance_staff", ["invoices:read"]);
    const { userId } = await createEmployee(prisma, admin, emp({ countries: ["India"] }));
    const u = await activate(userId);
    expect(u.scopes.map((s) => s.country)).toEqual(["India"]);
  });

  it("guards privilege escalation", async () => {
    const admin = await superAdmin();
    await role("finance_staff", []);
    const manager = await staff(["users:manage"]);
    await expect(createEmployee(prisma, manager, emp({ roleKeys: ["super_admin"] }))).rejects.toThrow(/super admin/);
    await expect(updateEmployee(prisma, manager, manager.id, emp())).rejects.toThrow(/own access/);
    await expect(setRoleModule(prisma, manager, "finance_staff", "finance", "EDIT")).rejects.toThrow(/super admin/);
    await setRoleModule(prisma, admin, "finance_staff", "finance", "VIEW");
    const perms = await prisma.rolePermission.findMany({ where: { role: { key: "finance_staff" } }, include: { permission: true } });
    expect(perms.map((p) => p.permission.key).sort()).toEqual(["invoices:read", "payments:read", "quotes:read"]);
  });
});

// ------------------------------------------------------------------ shipments & operations

async function world() {
  const admin = await superAdmin();
  const a = await createCustomer(prisma, admin, { name: "Alpha", company: "Alpha" });
  const b = await createCustomer(prisma, admin, { name: "Beta", company: "Beta" });
  const w1 = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
  const la = await addShipmentLine(prisma, admin, w1.id, { customerId: a.id, packages: 4, chargeableWeightKg: "100", rate: "6" });
  await addShipmentLine(prisma, admin, w1.id, { customerId: b.id, packages: 2, chargeableWeightKg: "50", rate: "6" });
  return { admin, a, b, w1, la };
}

describe("Shipments and Operations", () => {
  it("AWB KG gives the difference against Total KG", async () => {
    const { admin, w1 } = await world();
    await setAwbKg(prisma, admin, w1.id, "148");
    const d = await getAdminShipment(prisma, admin, w1.id);
    expect([d.totals.measure, d.totals.awbKg, d.totals.difference]).toEqual(["150", "148", "2"]);
    await expect(setAwbKg(prisma, admin, w1.id, "-1")).rejects.toThrow(/negative/);
  });

  it("editing a line keeps the invoice's Actual in step; an invoiced customer's last line can't be removed", async () => {
    const { admin, w1, a, la } = await world();
    const inv = await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: a.id, billedMeasure: "100", baseRate: "6" });
    await updateShipmentLine(prisma, admin, la.id, { packages: 4, chargeableWeightKg: "110", rate: "6" });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).actualMeasure!.toString()).toBe("110");
    await expect(deleteShipmentLine(prisma, admin, la.id)).rejects.toThrow(/invoiced/);
  });

  it("only an empty, unmoved shipment can be deleted", async () => {
    const { admin, w1 } = await world();
    await expect(deleteShipment(prisma, admin, w1.id)).rejects.toThrow(/customers first/);
    const empty = await createShipment(prisma, admin, { mode: "SEA", originCountry: "Turkey", businessYear: 2026 });
    await deleteShipment(prisma, admin, empty.id);
    expect(await prisma.shipment.findUnique({ where: { id: empty.id } })).toBeNull();
    const writer = await staff(["shipments:write"]);
    await expect(deleteShipment(prisma, writer, w1.id)).rejects.toThrow(/permission/i);
  });

  it("Notify sends the customer an update; a status change notifies every customer at once", async () => {
    const { admin, w1, a, la } = await world();
    await notifyShipmentLine(prisma, admin, la.id);
    expect(await prisma.notification.count({ where: { customerId: a.id, type: "shipment" } })).toBe(1);
    await changeShipmentStatus(prisma, admin, w1.id, "DEPARTED", { notifyCustomers: true });
    expect(await prisma.notification.count({ where: { type: "status" } })).toBe(2);
    const ops = await listOperations(prisma, admin, { country: "Turkey", year: 2026 });
    expect(ops.rows[0]).toMatchObject({ status: "DEPARTED", next: ["IN_TRANSIT"] });
    const india = await staff(["operations:read"], "India");
    await expect(listOperations(prisma, india, { country: "Turkey", year: 2026 })).rejects.toThrow(/scope/);
  });
});

// ------------------------------------------------------------------ customers

describe("Customers", () => {
  it("level from the year's KG, service, and details with invoices", async () => {
    const { admin, w1, a } = await world();
    await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: a.id, billedMeasure: "100", baseRate: "6" });
    const list = await listAdminCustomers(prisma, admin, 2026);
    const alpha = list.rows.find((r) => r.id === a.id)!;
    expect([alpha.level, alpha.airKg, alpha.service]).toEqual(["C", "100", "Air"]);
    const d = await getCustomerDetails(prisma, admin, a.id, 2026);
    expect([d.shipments.length, d.invoices.length, d.totals.invoiced]).toEqual([1, 1, "600"]);
  });

  it("a customer with history is never deleted, only set Inactive", async () => {
    const { admin, a } = await world();
    await expect(deleteCustomer(prisma, admin, a.id)).rejects.toThrow(/history/);
    await setCustomerStatus(prisma, admin, a.id, "INACTIVE");
    expect((await listAdminCustomers(prisma, admin, 2026, { status: "INACTIVE" })).rows.map((r) => r.id)).toEqual([a.id]);
    const fresh = await createCustomer(prisma, admin, { name: "Gamma", company: "Gamma" });
    await deleteCustomer(prisma, admin, fresh.id);
    expect(await prisma.customer.findUnique({ where: { id: fresh.id } })).toBeNull();
  });
});

// ------------------------------------------------------------------ settings

describe("Settings", () => {
  it("saves the company profile and validates sections", async () => {
    const admin = await superAdmin();
    await saveSettings(prisma, admin, "company", { name: "Orbit Cargo", email: "a@b.so", phone: "1", address: "Mogadishu", supportEmail: "s@b.so", supportPhone: "2" });
    expect((await getSettings(prisma)).company.name).toBe("Orbit Cargo");
    await expect(saveSettings(prisma, admin, "general", { currency: "EUR", timezone: "Africa/Mogadishu" })).rejects.toThrow();
    const reader = await staff(["settings:read"]);
    await expect(saveSettings(prisma, reader, "notifications", { email: true, shipment: true, payment: true, document: true, announcements: true })).rejects.toThrow(/permission/i);
  });

  it("years: create once, one current year", async () => {
    const admin = await superAdmin();
    await createYear(prisma, admin, 2027);
    await expect(createYear(prisma, admin, 2027)).rejects.toThrow(/already exists/);
    await setCurrentYear(prisma, admin, 2027);
    expect((await prisma.businessYear.findMany({ where: { isCurrent: true } })).map((y) => y.year)).toEqual([2027]);
  });

  it("countries: any spelling, flag code automatic; a country with shipments stays", async () => {
    const admin = await superAdmin();
    const c = await addCountry(prisma, admin, "shiinaha");
    expect([c.name, c.iso2]).toEqual(["China", "cn"]);
    await expect(addCountry(prisma, admin, "China")).rejects.toThrow(/already exists/);
    await expect(addCountry(prisma, admin, "Atlantis")).rejects.toThrow(/not found/);
    await createShipment(prisma, admin, { mode: "AIR", originCountry: "China", businessYear: 2026 });
    await expect(removeCountry(prisma, admin, c.id)).rejects.toThrow(/Has shipments/);
    const india = await prisma.country.findFirstOrThrow({ where: { name: "India" } });
    await removeCountry(prisma, admin, india.id);
    expect((await prisma.country.findUniqueOrThrow({ where: { id: india.id } })).active).toBe(false);
  });
});

// ------------------------------------------------------------------ announcements, documents, reports

describe("Announcements, documents and reports", () => {
  it("a dated announcement needs its dates; a future one stays Scheduled until due; images are access-checked", async () => {
    const admin = await superAdmin();
    await expect(createAnnouncement(prisma, admin, { type: "AIR", title: "Flight", message: "Hi" })).rejects.toThrow(/last day/);
    const n = await createAnnouncement(prisma, admin, {
      type: "AIR",
      title: "Ogeysiis Diyaarad",
      message: "Fadlan",
      lastDay: "2026-11-01",
      departureDate: "2026-11-02",
      origin: "Istanbul",
      sendAt: new Date(Date.now() + 86_400_000),
      image: { buffer: PNG, contentType: "image/png" },
    });
    expect(n.status).toBe("SCHEDULED");
    const c = await createCustomer(prisma, admin, { name: "Cust", company: "Cust" });
    const cu = await prisma.user.create({ data: { email: `${uniq()}@c.so`, status: "ACTIVE", customerId: c.id } });
    const customer = (await loadAuthzUser(prisma, cu.id))!;
    await expect(getNotificationImage(prisma, customer, n.id)).rejects.toThrow();
    await publishDueAnnouncements(prisma, new Date(Date.now() + 2 * 86_400_000));
    const img = await getNotificationImage(prisma, customer, n.id);
    expect(img.contentType).toBe("image/png");
    expect((await listNotificationsAdmin(prisma, admin, { kind: "announcements" })).items[0]!.status).toBe("SENT");
  });

  it("a customer document shows in that customer's list only; shipment uploads respect the country", async () => {
    const { admin, a, b, w1 } = await world();
    const pdf = Buffer.from("%PDF-1.4\n%test\n");
    await uploadAdminDocument(prisma, admin, { target: "customer", customerId: a.id, reference: "PL-1", kind: "CARGO_DOC", file: { buffer: pdf, name: "pl.pdf", type: "application/pdf" } });
    const mk = async (customerId: string) => {
      const u = await prisma.user.create({ data: { email: `${uniq()}@c.so`, status: "ACTIVE", customerId } });
      return (await loadAuthzUser(prisma, u.id))!;
    };
    expect((await listDocuments(prisma, await mk(a.id))).items).toHaveLength(1);
    expect((await listDocuments(prisma, await mk(b.id))).items).toHaveLength(0);
    const list = await listAdminDocuments(prisma, admin, { year: 2026, country: "Turkey" });
    expect(list.items[0]).toMatchObject({ reference: "PL-1" });
    const india = await staff(["documents:write"], "India");
    await expect(uploadAdminDocument(prisma, india, { target: "shipment", shipmentId: w1.id, kind: "CARGO_DOC", file: { buffer: pdf, name: "x.pdf", type: "application/pdf" } })).rejects.toThrow(/scope/);
  });

  it("reports never show another country's money (fixed leak) and company-wide covers all allowed countries", async () => {
    const { admin, w1, a } = await world();
    await createShipmentInvoice(prisma, admin, { shipmentId: w1.id, customerId: a.id, billedMeasure: "100", baseRate: "6" });
    const indiaOnly = await staff(["reports:read"], "India");
    expect((await getReport(prisma, indiaOnly, { businessYear: 2026 })).finance.invoiced).toBe("0");
    expect((await getReport(prisma, admin, { businessYear: 2026 })).finance.invoiced).toBe("600");
    const company = await getAdminReport(prisma, admin, { year: 2026, country: "Turkey", section: "company" });
    expect([company.totals.shipments, company.totals.kg, company.totals.revenue]).toEqual([1, "150", "600"]);
    await expect(getAdminReport(prisma, indiaOnly, { year: 2026, country: "Turkey", section: "finance" })).rejects.toThrow(/scope/);
  });
});
