import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TransferRole } from "@prisma/client";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { createCustomer } from "@/modules/customers/service";
import { createInvoice } from "@/modules/finance/invoices";
import { recordPayment } from "@/modules/finance/payments";
import { createShipment } from "@/modules/shipments/service";
import { createEmployeeUser, listUsers, removeRole, setUserStatus } from "@/modules/users/service";
import { createTransfer, receiveTransfer, sendTransfer } from "@/modules/transfer/service";
import { getReport } from "@/modules/reporting/service";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;
let empSeq = 0;

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

async function agent(opts: { perms: string[]; transferRole: TransferRole; country: string }): Promise<AuthzUser> {
  const employee = await prisma.employee.create({
    data: { code: `EMP-${String(++empSeq).padStart(3, "0")}`, name: "Agent", department: "OPERATIONS", transferRole: opts.transferRole },
  });
  const role = await prisma.role.create({ data: { key: `role-${uniq()}`, name: "role" } });
  for (const p of opts.perms) {
    const permission = await prisma.permission.upsert({ where: { key: p }, create: { key: p }, update: {} });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE", employeeId: employee.id } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, country: opts.country, businessYear: 2026 } });
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

describe("transfer send/receive workflow", () => {
  it("a SEND agent creates+sends and a RECEIVE agent receives", async () => {
    const sender = await agent({ perms: ["transfer:write", "transfer:read"], transferRole: "SEND", country: "Turkey" });
    const receiver = await agent({ perms: ["transfer:write", "transfer:read"], transferRole: "RECEIVE", country: "India" });

    const tr = await createTransfer(prisma, sender, {
      amount: "1000.00",
      fromCountry: "Turkey",
      toCountry: "India",
      businessYear: 2026,
    });
    expect(tr.reference).toMatch(/^TR-2026-\d{4}$/);
    expect(tr.status).toBe("PENDING");

    const sent = await sendTransfer(prisma, sender, tr.id);
    expect(sent.status).toBe("SENT");

    const received = await receiveTransfer(prisma, receiver, tr.id);
    expect(received.status).toBe("RECEIVED");
  });

  it("a SEND agent cannot receive and a RECEIVE agent cannot create", async () => {
    const sender = await agent({ perms: ["transfer:write", "transfer:read"], transferRole: "SEND", country: "Turkey" });
    const receiver = await agent({ perms: ["transfer:write", "transfer:read"], transferRole: "RECEIVE", country: "India" });

    const tr = await createTransfer(prisma, sender, { amount: "500.00", fromCountry: "Turkey", toCountry: "India", businessYear: 2026 });
    await sendTransfer(prisma, sender, tr.id);
    await expect(receiveTransfer(prisma, sender, tr.id)).rejects.toThrow(/receiving agent/i);

    await expect(
      createTransfer(prisma, receiver, { amount: "500.00", fromCountry: "India", toCountry: "Turkey", businessYear: 2026 }),
    ).rejects.toThrow(/sending agent/i);
  });

  it("enforces country scope on creation and rejects illegal receive", async () => {
    const sender = await agent({ perms: ["transfer:write", "transfer:read"], transferRole: "SEND", country: "Turkey" });
    // From a country outside the sender's scope.
    await expect(
      createTransfer(prisma, sender, { amount: "100.00", fromCountry: "India", toCountry: "Turkey", businessYear: 2026 }),
    ).rejects.toThrow();

    const receiver = await agent({ perms: ["transfer:write", "transfer:read"], transferRole: "RECEIVE", country: "India" });
    const tr = await createTransfer(prisma, sender, { amount: "100.00", fromCountry: "Turkey", toCountry: "India", businessYear: 2026 });
    // Cannot receive a PENDING (not yet sent).
    await expect(receiveTransfer(prisma, receiver, tr.id)).rejects.toThrow(/only a sent transfer/i);
  });
});

describe("reporting read-model", () => {
  it("aggregates shipments, finance and customers", async () => {
    const admin = await superAdmin();
    const c = await createCustomer(prisma, admin, { name: "Rep Co" });
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
