import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withUserDb } from "@/db/scoped";
import { can, loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { ADMIN_MODULES, applyModuleAccess, modulePermissions } from "@/modules/authz/modules";
import { createCustomer } from "@/modules/customers/service";
import { createEmployee, listEmployees } from "@/modules/users/admin";
import { myShipments, myYears } from "@/modules/portal/customerApp";
import { notifyShipmentLine, setShipmentLinePricing, updateShipmentLine } from "@/modules/shipments/manage";
import { addShipmentLine, changeShipmentStatus, createShipment } from "@/modules/shipments/service";
import { assertTestDatabase, prisma, resetDb, testPhone } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;

async function staff(perms: string[], key = `role-${uniq()}`): Promise<AuthzUser> {
  const r = await prisma.role.upsert({ where: { key }, create: { key, name: key }, update: {} });
  for (const p of perms) {
    const permission = await prisma.permission.upsert({ where: { key: p }, create: { key: p }, update: {} });
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: r.id, permissionId: permission.id } }, create: { roleId: r.id, permissionId: permission.id }, update: {} });
  }
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: r.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

/** The data team (Shipments edit), pricing staff (Shipment pricing + view) and one customer on an air shipment. */
async function world() {
  const admin = await staff(["customers:manage", "shipments:manage"], "super_admin");
  const data = await staff(["shipments:write", "customers:read"]);
  const pricer = await staff(["pricing:write", "shipments:read"]);
  const c = await createCustomer(prisma, admin, { name: "Alpha Trading", company: "Alpha", phone: testPhone() });
  const u = await prisma.user.create({ data: { email: `${uniq()}@cust.so`, status: "ACTIVE", customerId: c.id } });
  const customer = (await loadAuthzUser(prisma, u.id))!;
  const sh = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026, shipDate: new Date("2026-10-01T00:00:00Z") });
  return { admin, data, pricer, c, customer, sh };
}

describe("Shipment pricing: the data team enters cargo, pricing staff set the rates", () => {
  it("the data team adds and edits cargo but can't set or change Rate, Quality Rate or Brand Rate", async () => {
    const { data, pricer, c, sh } = await world();
    // Shipment pricing also edits everything else on the shipment (owner 2026-10-28).
    expect([can(data, "pricing:write"), can(pricer, "pricing:write"), can(pricer, "shipments:write")]).toEqual([false, true, true]);

    await expect(addShipmentLine(prisma, data, sh.id, { customerId: c.id, packages: 4, chargeableWeightKg: "100", rate: "8" })).rejects.toThrow(/pricing staff/);
    const line = await addShipmentLine(prisma, data, sh.id, { customerId: c.id, packages: 4, chargeableWeightKg: "100" });
    expect(line.rate).toBeNull();

    // Pricing staff set the rates (negative refused) and may also add and edit cargo with rates.
    const extra = await addShipmentLine(prisma, pricer, sh.id, { customerId: c.id, packages: 1, chargeableWeightKg: "5", rate: "7" });
    await updateShipmentLine(prisma, pricer, extra.id, { packages: 2, chargeableWeightKg: "6", rate: "7.5", brandRate: "1" });
    expect((await prisma.shipmentLine.findUniqueOrThrow({ where: { id: extra.id } })).rate?.toString()).toBe("7.5");
    await expect(setShipmentLinePricing(prisma, pricer, line.id, { rate: "-1" })).rejects.toThrow(/negative/);
    await expect(setShipmentLinePricing(prisma, data, line.id, { rate: "8" })).rejects.toThrow(/pricing:write/);
    await setShipmentLinePricing(prisma, pricer, line.id, { rate: "8", qualityRate: "0.5", brandRate: "" });
    let row = await prisma.shipmentLine.findUniqueOrThrow({ where: { id: line.id } });
    expect([row.rate?.toString(), row.qualityRate?.toString(), row.brandRate]).toEqual(["8", "0.5", null]);
    expect(await prisma.auditEvent.count({ where: { action: "shipment.line_pricing", entityId: sh.id } })).toBe(1);

    // The data team still edits the priced line's cargo (rates sent back unchanged) …
    await updateShipmentLine(prisma, data, line.id, { packages: 5, chargeableWeightKg: "120", rate: "8.00", qualityRate: "0.50" });
    row = await prisma.shipmentLine.findUniqueOrThrow({ where: { id: line.id } });
    expect([row.packages, row.chargeableWeightKg?.toString(), row.rate?.toString()]).toEqual([5, "120", "8"]);
    // … but changing or clearing a rate is refused.
    await expect(updateShipmentLine(prisma, data, line.id, { packages: 5, chargeableWeightKg: "120", rate: "9", qualityRate: "0.5" })).rejects.toThrow(/pricing staff/);
    await expect(updateShipmentLine(prisma, data, line.id, { packages: 5, chargeableWeightKg: "120", qualityRate: "0.5" })).rejects.toThrow(/pricing staff/);
  });

  it("a customer sees their cargo, and hears about the shipment, only once the Rate is set", async () => {
    const { admin, data, pricer, c, customer, sh } = await world();
    const line = await addShipmentLine(prisma, data, sh.id, { customerId: c.id, packages: 4, chargeableWeightKg: "100" });

    expect(await withUserDb(customer, (db) => myShipments(db, customer, 2026))).toEqual([]);
    await expect(withUserDb(customer, (db) => myYears(db, customer))).resolves.toBeDefined();
    // The database itself hides the unpriced line and its shipment (Row-Level Security), even unfiltered.
    expect(await withUserDb(customer, (db) => db.shipmentLine.findMany())).toEqual([]);
    expect(await withUserDb(customer, (db) => db.shipment.findMany())).toEqual([]);
    await expect(notifyShipmentLine(prisma, data, line.id)).rejects.toThrow(/Rate first/);
    await changeShipmentStatus(prisma, admin, sh.id, "DEPARTED", { notifyCustomers: true });
    expect(await prisma.notification.count({ where: { customerId: c.id } })).toBe(0);

    await setShipmentLinePricing(prisma, pricer, line.id, { rate: "8" });
    const mine = await withUserDb(customer, (db) => myShipments(db, customer, 2026));
    expect(mine.map((s) => [s.id, s.measure])).toEqual([[sh.id, "100"]]);
    expect(await withUserDb(customer, (db) => db.shipmentLine.count())).toBe(1);
    await notifyShipmentLine(prisma, data, line.id);
    expect(await prisma.notification.count({ where: { customerId: c.id } })).toBe(1);
  });

  it("Users & Team shows who has Shipment pricing; with it, Shipments View only still edits everything", async () => {
    const { admin } = await world();
    await prisma.role.upsert({ where: { key: "operation_staff" }, create: { key: "operation_staff", name: "Operation Staff" }, update: {} });
    const emp = (code: string, access: Record<string, "NONE" | "VIEW" | "EDIT">) =>
      createEmployee(prisma, admin, { code, name: code, email: `${uniq()}@orbit.so`, department: "OPERATIONS", roleKeys: ["operation_staff"], countries: [], access, accountingAccess: false, transferRole: "NONE", transferCountries: [] });
    const p = await emp("EMP-201", { shipments: "VIEW", pricing: "EDIT" });
    await emp("EMP-202", { shipments: "EDIT" });
    await prisma.user.update({ where: { id: p.userId }, data: { status: "ACTIVE" } });
    const u = (await loadAuthzUser(prisma, p.userId))!;
    expect([can(u, "pricing:write"), can(u, "shipments:write")]).toEqual([true, true]);
    const rows = (await listEmployees(prisma, admin)).rows;
    expect(Object.fromEntries(rows.filter((r) => r.code.startsWith("EMP-20")).map((r) => [r.code, r.pricing]))).toEqual({ "EMP-201": true, "EMP-202": false });
  });

  it("Users & Team → Shipment pricing: Full grants pricing:write, View only or No access don't", () => {
    const m = ADMIN_MODULES.find((x) => x.key === "pricing")!;
    expect(modulePermissions(m)).toEqual(["pricing:write"]);
    const base = new Set(["shipments:write"]);
    expect(applyModuleAccess(base, [{ page: "pricing", level: "EDIT" }]).has("pricing:write")).toBe(true);
    expect(applyModuleAccess(new Set(["pricing:write"]), [{ page: "pricing", level: "VIEW" }]).has("pricing:write")).toBe(false);
    expect(applyModuleAccess(new Set(["pricing:write"]), [{ page: "pricing", level: "NONE" }]).has("pricing:write")).toBe(false);
  });
});
