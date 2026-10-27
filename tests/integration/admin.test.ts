import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { createCustomer } from "@/modules/customers/service";
import { createInvoice } from "@/modules/finance/invoices";
import { recordPayment } from "@/modules/finance/payments";
import { createShipment } from "@/modules/shipments/service";
import { createEmployeeUser, listUsers, removeRole, setUserStatus } from "@/modules/users/service";
import { getReport } from "@/modules/reporting/service";
import { assertTestDatabase, prisma, resetDb, testPhone } from "./helpers";

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

async function staff(perms: string[]): Promise<AuthzUser> {
  const role = await prisma.role.create({ data: { key: `role-${uniq()}`, name: "role" } });
  for (const p of perms) {
    const permission = await prisma.permission.upsert({ where: { key: p }, create: { key: p }, update: {} });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

describe("user & team management", () => {
  it("invites a staff user (Employee + INVITED user) and enforces guards", async () => {
    const admin = await superAdmin();
    const created = await createEmployeeUser(prisma, admin, {
      email: "newstaff@orbit.so",
      name: "New Staff",
      department: "OPERATIONS",
    });
    expect(created.status).toBe("INVITED");
    expect(created.employeeId).toBeTruthy();
    const employee = await prisma.employee.findUniqueOrThrow({ where: { id: created.employeeId! } });
    expect(employee.code).toMatch(/^EMP-\d{3}$/);

    const list = await listUsers(prisma, admin, {});
    expect(list.total).toBeGreaterThanOrEqual(1);
  });

  it("denies user management without users:manage", async () => {
    const weak = await staff(["users:read"]);
    await expect(
      createEmployeeUser(prisma, weak, { email: "x@orbit.so", name: "X", department: "FINANCE" }),
    ).rejects.toThrow();
  });

  it("prevents acting on your own account (status / roles)", async () => {
    const admin = await superAdmin();
    await expect(setUserStatus(prisma, admin, admin.id, "SUSPENDED")).rejects.toThrow(/your own/i);
    await expect(removeRole(prisma, admin, admin.id, "super_admin")).rejects.toThrow(/your own/i);
  });

  it("suspends a user and bumps their session epoch", async () => {
    const admin = await superAdmin();
    const target = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
    const before = target.sessionEpoch;
    await setUserStatus(prisma, admin, target.id, "SUSPENDED");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.status).toBe("SUSPENDED");
    expect(after.sessionEpoch).toBeGreaterThan(before);
  });
});

describe("reporting read-model", () => {
  it("aggregates shipments, finance and customers", async () => {
    const admin = await superAdmin();
    const c = await createCustomer(prisma, admin, { name: "Rep Co", company: "Test Co", phone: testPhone() });
    await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    await createShipment(prisma, admin, { mode: "SEA", originCountry: "Turkey", businessYear: 2026 });
    const inv = await createInvoice(prisma, admin, {
      customerId: c.id,
      businessYear: 2026,
      lines: [{ category: "FREIGHT", quantity: 1, unitPrice: "100.00" }],
    });
    await recordPayment(prisma, admin, {
      customerId: c.id,
      amount: "40.00",
      method: "CASH",
      allocations: [{ invoiceId: inv.id, amount: "40.00" }],
    });

    const report = await getReport(prisma, admin, { businessYear: 2026 });
    expect(report.shipments.total).toBe(2);
    expect(report.shipments.byMode.AIR).toBe(1);
    expect(report.shipments.byMode.SEA).toBe(1);
    expect(report.finance.invoiced).toBe("100");
    expect(report.finance.collected).toBe("40");
    expect(report.finance.outstanding).toBe("60");
    expect(report.customers).toBe(1);
  });
});
