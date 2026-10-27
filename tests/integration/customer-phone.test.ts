import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { cleanPhone, createCustomer, phoneKeyOf, updateCustomer } from "@/modules/customers/service";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

async function superAdmin(): Promise<AuthzUser> {
  const role = await prisma.role.create({ data: { key: "super_admin", name: "Super Admin" } });
  const user = await prisma.user.create({ data: { email: `admin-${Date.now()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

describe("prefix-only phone numbers (admin form pre-fills '+252 61 ')", () => {
  it("treat a bare prefix as no phone", () => {
    expect(cleanPhone("+252 61 ")).toBeNull();
    expect(cleanPhone("  ")).toBeNull();
    expect(phoneKeyOf("+252 61")).toBeNull();
    expect(cleanPhone(" +252 61 555 0100 ")).toBe("+252 61 555 0100");
    expect(phoneKeyOf("+252 61 555 0100")).toBe("252615550100");
  });

  it("lets several customers be saved with the untouched prefix, and still rejects real duplicates", async () => {
    const admin = await superAdmin();
    const a = await createCustomer(prisma, admin, { name: "A", company: "Co", phone: "+252 61 " });
    const b = await createCustomer(prisma, admin, { name: "B", company: "Co", phone: "+252 61 " });
    expect([a.phone, a.phoneKey, b.phone, b.phoneKey]).toEqual([null, null, null, null]);

    await createCustomer(prisma, admin, { name: "C", company: "Co", phone: "+252 61 555 0100" });
    await expect(createCustomer(prisma, admin, { name: "D", company: "Co", phone: "252615550100" })).rejects.toThrow(
      /phone number already exists/i,
    );
  });

  it("clears the phone when an edit leaves only the prefix", async () => {
    const admin = await superAdmin();
    const c = await createCustomer(prisma, admin, { name: "E", company: "Co", phone: "+252 61 777 0000" });
    const updated = await updateCustomer(prisma, admin, c.id, { phone: "+252 61 " });
    expect([updated.phone, updated.phoneKey]).toEqual([null, null]);
  });
});
