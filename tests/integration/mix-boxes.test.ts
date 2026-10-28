import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { createCustomer } from "@/modules/customers/service";
import { getAdminShipment, updateShipmentLine } from "@/modules/shipments/manage";
import { addShipmentLine, createShipment } from "@/modules/shipments/service";
import { assertTestDatabase, prisma, resetDb, testPhone } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;

async function superAdmin(): Promise<AuthzUser> {
  const role = await prisma.role.upsert({ where: { key: "super_admin" }, create: { key: "super_admin", name: "Super Admin" }, update: {} });
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

async function world() {
  const admin = await superAdmin();
  const a = await createCustomer(prisma, admin, { name: "Alpha Trading", company: "Alpha", phone: testPhone() });
  const b = await createCustomer(prisma, admin, { name: "Beta Market", company: "Beta", phone: testPhone() });
  const air = await createShipment(prisma, admin, { mode: "AIR", originCountry: "Turkey", businessYear: 2026 });
  return { admin, a, b, air };
}

describe("Numbered MIX boxes", () => {
  it("a shared MIX box is one package; each line's MIX count and KG come from its parts", async () => {
    const { admin, a, b, air } = await world();
    // A: 4 boxes of 100 kg, in MIX 1 twice (3 + 2 kg) and MIX 2 (1.5 kg). B: 2 boxes, in MIX 1 (4 kg).
    const la = await addShipmentLine(prisma, admin, air.id, { customerId: a.id, packages: 4, chargeableWeightKg: "100", rate: "8", mixParts: [{ box: 1, kg: "3" }, { box: 2, kg: "1.5" }, { box: 1, kg: "2" }] });
    await addShipmentLine(prisma, admin, air.id, { customerId: b.id, packages: 2, chargeableWeightKg: "50", rate: "8", mixParts: [{ box: 1, kg: "4" }] });
    expect([la.mixCount, la.mixKg?.toString()]).toEqual([3, "6.5"]);

    const d = await getAdminShipment(prisma, admin, air.id);
    const rowA = d.lines.find((l) => l.customerId === a.id)!;
    expect(rowA.mixParts.map((p) => p.box)).toEqual([1, 1, 2]);
    expect(rowA.measure).toBe("106.5"); // 100 + 6.5 MIX kg
    expect(rowA.amount).toBe("852"); // 106.5 × 8
    // 4 + 2 boxes, plus MIX 1 and MIX 2 once each — not once per customer.
    expect(d.totals.packages).toBe(8);
    expect(d.totals.measure).toBe("160.5");
  });

  it("editing replaces the parts; empty or zero KG and sea MIX are refused", async () => {
    const { admin, a, air } = await world();
    const l = await addShipmentLine(prisma, admin, air.id, { customerId: a.id, packages: 1, chargeableWeightKg: "10", mixParts: [{ box: 3, kg: "2" }] });
    await updateShipmentLine(prisma, admin, l.id, { packages: 1, chargeableWeightKg: "10", mixParts: [] });
    const row = (await getAdminShipment(prisma, admin, air.id)).lines[0]!;
    expect([row.mixParts, row.mixCount, row.measure]).toEqual([[], 0, "10"]);

    await expect(updateShipmentLine(prisma, admin, l.id, { packages: 1, mixParts: [{ box: 1, kg: "" }] })).rejects.toThrow(/KG for each MIX/);
    await expect(updateShipmentLine(prisma, admin, l.id, { packages: 1, mixParts: [{ box: 1, kg: "0" }] })).rejects.toThrow(/KG for each MIX/);
    await expect(updateShipmentLine(prisma, admin, l.id, { packages: 1, mixParts: [{ box: 0, kg: "1" }] })).rejects.toThrow(/MIX box/);

    const sea = await createShipment(prisma, admin, { mode: "SEA", originCountry: "Turkey", businessYear: 2026 });
    await expect(addShipmentLine(prisma, admin, sea.id, { customerId: a.id, packages: 1, volumeCbm: "1", mixParts: [{ box: 1, kg: "1" }] })).rejects.toThrow(/CBM/);
  });
});
