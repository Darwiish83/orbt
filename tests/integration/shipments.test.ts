import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import {
  createCustomer,
  getCustomer,
  listCustomers,
} from "@/modules/customers/service";
import {
  addShipmentLine,
  assignTrackingNumber,
  changeShipmentStatus,
  createShipment,
  getShipmentForActor,
  listShipments,
} from "@/modules/shipments/service";
import { trackByNumber } from "@/modules/shipments/publicTracking";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;

async function staff(perms: string[], scope?: { country?: string; year?: number }): Promise<AuthzUser> {
  const role = await prisma.role.create({ data: { key: `role-${uniq()}`, name: "role" } });
  for (const p of perms) {
    const permission = await prisma.permission.upsert({ where: { key: p }, create: { key: p }, update: {} });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
  }
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({
    data: { userId: user.id, roleId: role.id, country: scope?.country ?? null, businessYear: scope?.year ?? null },
  });
  const u = await loadAuthzUser(prisma, user.id);
  if (!u) throw new Error("authz user");
  return u;
}

async function superAdmin(): Promise<AuthzUser> {
  const role = await prisma.role.create({ data: { key: "super_admin", name: "Super Admin" } });
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const u = await loadAuthzUser(prisma, user.id);
  if (!u) throw new Error("authz user");
  return u;
}

async function customerPrincipal(customerId: string): Promise<AuthzUser> {
  const user = await prisma.user.create({
    data: { email: `${uniq()}@cust.so`, status: "ACTIVE", customerId },
  });
  const u = await loadAuthzUser(prisma, user.id);
  if (!u) throw new Error("authz user");
  return u;
}

describe("identifier generation", () => {
  it("generates sequential W-/C- codes per mode and a unique OR- ref", async () => {
    const admin = await superAdmin();
    const air1 = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    const air2 = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    const sea1 = await createShipment(prisma, admin, { mode: "SEA", originCountry: "Turkey", businessYear: 2026 });
    expect(air1.code).toBe("W-1");
    expect(air2.code).toBe("W-2");
    expect(sea1.code).toBe("C-1");

    const c1 = await createCustomer(prisma, admin, { name: "A", company: "Test Co" });
    const c2 = await createCustomer(prisma, admin, { name: "B", company: "Test Co" });
    expect(c1.ref).toBe("OR-3000");
    expect(c2.ref).toBe("OR-3001");
  });

  it("assigns a unique tracking number in the expected format", async () => {
    const admin = await superAdmin();
    const s = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    const tn = await assignTrackingNumber(prisma, admin, s.id);
    expect(tn).toMatch(/^ORB-2026-[0-9A-HJKMNP-TV-Z]{6}$/);
    // Idempotent: returns the same number.
    expect(await assignTrackingNumber(prisma, admin, s.id)).toBe(tn);
  });
});

describe("shipment authorization & scope", () => {
  it("requires shipments:write and the correct country/year scope", async () => {
    const turkeyStaff = await staff(["shipments:write"], { country: "Turkey", year: 2026 });
    await expect(
      createShipment(prisma, turkeyStaff, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 }),
    ).resolves.toBeTruthy();

    // Same staff, different country → scope denied.
    await expect(
      createShipment(prisma, turkeyStaff, { mode: "AIR", originCountry: "India", businessYear: 2026 }),
    ).rejects.toThrow();

    // No permission at all.
    const readOnly = await staff(["shipments:read"], { country: "Turkey", year: 2026 });
    await expect(
      createShipment(prisma, readOnly, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 }),
    ).rejects.toThrow();
  });
});

describe("state machine", () => {
  it("allows legal transitions and rejects illegal ones", async () => {
    const admin = await superAdmin();
    const s = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });

    const departed = await changeShipmentStatus(prisma, admin, s.id, "DEPARTED");
    expect(departed.status).toBe("DEPARTED");
    expect(departed.departedAt).toBeInstanceOf(Date);

    // Skipping a step (DEPARTED → ARRIVED for Air) and going back are illegal.
    await expect(changeShipmentStatus(prisma, admin, s.id, "ARRIVED")).rejects.toThrow(/illegal transition/i);
    await expect(changeShipmentStatus(prisma, admin, s.id, "AT_ORIGIN_STORE")).rejects.toThrow(/illegal transition/i);

    const events = await prisma.shipmentEvent.count({ where: { shipmentId: s.id } });
    expect(events).toBe(1); // only the successful transition recorded
  });

  it("is idempotent on idempotencyKey (no duplicate event)", async () => {
    const admin = await superAdmin();
    const s = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    await changeShipmentStatus(prisma, admin, s.id, "DEPARTED", { idempotencyKey: "k-1" });
    await changeShipmentStatus(prisma, admin, s.id, "DEPARTED", { idempotencyKey: "k-1" });
    const events = await prisma.shipmentEvent.count({ where: { shipmentId: s.id } });
    expect(events).toBe(1);
  });

  it("requires shipments:status permission", async () => {
    const admin = await superAdmin();
    const s = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    const weak = await staff(["shipments:read"], { country: "Turkey", year: 2026 });
    await expect(changeShipmentStatus(prisma, weak, s.id, "DEPARTED")).rejects.toThrow();
  });
});

describe("public tracking (approved subset only)", () => {
  it("returns only non-sensitive fields and hides internal notes", async () => {
    const admin = await superAdmin();
    const s = await createShipment(prisma, admin, {
      mode: "AIR",
      originCountry: "Turkey",
      originCity: "Istanbul",
      destCountry: "Somalia",
      destCity: "Mogadishu",
      businessYear: 2026,
    });
    const tn = await assignTrackingNumber(prisma, admin, s.id);
    await changeShipmentStatus(prisma, admin, s.id, "DEPARTED", { note: "INTERNAL ONLY secret note" });

    const result = await trackByNumber(prisma, tn);
    expect(result).not.toBeNull();
    expect(result!.trackingNumber).toBe(tn);
    expect(result!.status).toBe("Departed");
    expect(result!.origin).toBe("Istanbul, Turkey");
    expect(result!.milestones.length).toBe(1);
    // No internal note leaks into the public payload.
    expect(JSON.stringify(result)).not.toContain("INTERNAL ONLY");
    // Only the whitelisted keys are present.
    expect(Object.keys(result!).sort()).toEqual(
      ["destination", "milestones", "mode", "origin", "status", "trackingNumber"].sort(),
    );
  });

  it("returns null for an unknown tracking number", async () => {
    expect(await trackByNumber(prisma, "ORB-2026-ZZZZZZ")).toBeNull();
  });
});

describe("customer-scoped shipment access (IDOR)", () => {
  it("lets a customer read only shipments carrying their own line", async () => {
    const admin = await superAdmin();
    const a = await createCustomer(prisma, admin, { name: "Cust A", company: "Test Co" });
    const b = await createCustomer(prisma, admin, { name: "Cust B", company: "Test Co" });
    const shipment = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    await addShipmentLine(prisma, admin, shipment.id, { customerId: a.id });

    const custA = await customerPrincipal(a.id);
    const custB = await customerPrincipal(b.id);

    await expect(getShipmentForActor(prisma, custA, shipment.id)).resolves.toBeTruthy();
    await expect(getShipmentForActor(prisma, custB, shipment.id)).rejects.toThrow(/cross-customer/i);

    // And list is scoped: B sees none, A sees one.
    expect((await listShipments(prisma, custB, {})).total).toBe(0);
    expect((await listShipments(prisma, custA, {})).total).toBe(1);
  });
});

describe("pagination & filtering", () => {
  it("paginates shipments and filters by status", async () => {
    const admin = await superAdmin();
    for (let i = 0; i < 3; i++) {
      await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
    }
    const page1 = await listShipments(prisma, admin, { page: 1, pageSize: 2 });
    expect(page1.items.length).toBe(2);
    expect(page1.total).toBe(3);
    expect(page1.totalPages).toBe(2);

    const arrived = await listShipments(prisma, admin, { status: "ARRIVED" });
    expect(arrived.total).toBe(0);
  });
});

describe("customer access", () => {
  it("enforces ownership on getCustomer and scopes listCustomers", async () => {
    const admin = await superAdmin();
    const a = await createCustomer(prisma, admin, { name: "A", company: "Test Co" });
    const b = await createCustomer(prisma, admin, { name: "B", company: "Test Co" });
    const custA = await customerPrincipal(a.id);

    await expect(getCustomer(prisma, custA, a.id)).resolves.toBeTruthy();
    await expect(getCustomer(prisma, custA, b.id)).rejects.toThrow();

    const list = await listCustomers(prisma, custA, {});
    expect(list.total).toBe(1);
    expect(list.items[0]!.id).toBe(a.id);
  });
});
