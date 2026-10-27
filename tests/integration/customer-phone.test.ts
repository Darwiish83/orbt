import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { requestCustomerAccess, startCustomerSignup } from "@/modules/auth/flows";
import { localPhoneDigits, parseSomaliPhone } from "@/modules/customers/phone";
import { createCustomer, updateCustomer } from "@/modules/customers/service";
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

const noSend = async () => {
  throw new Error("no code should be sent");
};

describe("customer phone: mandatory, exactly 9 digits after +252 (owner rule)", () => {
  it("accepts the usual spellings of a 9-digit number and stores one canonical form", () => {
    for (const v of ["61 555 0100", "615550100", "0615550100", "+252 61 555 0100", "252615550100", "+252-61-555-0100"]) {
      expect(parseSomaliPhone(v)).toEqual({ phone: "+252 61 555 0100", key: "252615550100" });
    }
  });

  it("rejects anything shorter or longer than 9 digits", () => {
    for (const v of ["", "  ", "+252 61 ", "61 555 010", "6155501", "61 555 01000", "2526155501", "00615550100"]) {
      expect(localPhoneDigits(v)).toBeNull();
    }
  });

  it("admin create: refuses a missing or short phone and a number already registered", async () => {
    const admin = await superAdmin();
    await expect(createCustomer(prisma, admin, { name: "A", company: "Co" })).rejects.toThrow(/9 digits after \+252/);
    await expect(createCustomer(prisma, admin, { name: "A", company: "Co", phone: "+252 61 " })).rejects.toThrow(/9 digits/);
    await expect(createCustomer(prisma, admin, { name: "A", company: "Co", phone: "61 555 010" })).rejects.toThrow(/9 digits/);
    const ok = await createCustomer(prisma, admin, { name: "A", company: "Co", phone: "0615550100" });
    expect([ok.phone, ok.phoneKey]).toEqual(["+252 61 555 0100", "252615550100"]);
    await expect(createCustomer(prisma, admin, { name: "B", company: "Co", phone: "61 555 0100" })).rejects.toThrow(
      /phone number is already registered/i,
    );
    expect(await prisma.customer.count()).toBe(1);
  });

  it("admin edit: a phone can't be cleared, shortened or moved onto another customer's number", async () => {
    const admin = await superAdmin();
    const a = await createCustomer(prisma, admin, { name: "A", company: "Co", phone: "61 111 1111" });
    await createCustomer(prisma, admin, { name: "B", company: "Co", phone: "61 222 2222" });
    await expect(updateCustomer(prisma, admin, a.id, { phone: "" })).rejects.toThrow(/9 digits/);
    await expect(updateCustomer(prisma, admin, a.id, { phone: "61 111" })).rejects.toThrow(/9 digits/);
    await expect(updateCustomer(prisma, admin, a.id, { phone: "612222222" })).rejects.toThrow(/already registered/i);
    const same = await updateCustomer(prisma, admin, a.id, { phone: "+252 61 111 1111", name: "A2" });
    expect([same.phone, same.name]).toEqual(["+252 61 111 1111", "A2"]);
  });

  it("self-signup: a short phone stops at the form; a registered phone is refused with that reason", async () => {
    const admin = await superAdmin();
    await createCustomer(prisma, admin, { name: "Old", company: "Co", phone: "61 555 0100" });
    const form = { name: "New", email: "new@shop.so", company: "Co", location: "Mogadishu", cargoCategory: "Clothes" };
    await expect(startCustomerSignup(prisma, { ...form, phone: "61 555 01" }, noSend)).rejects.toThrow(/9 digits/);
    await expect(startCustomerSignup(prisma, { ...form, phone: "61 555 0100" }, noSend)).rejects.toThrow(
      /phone number is already registered/i,
    );
    expect(await prisma.otpCode.count()).toBe(0);
  });

  it("first login: a short phone is rejected before anything else happens", async () => {
    await expect(
      requestCustomerAccess(prisma, { reference: "OR-3000", phone: "61 555", email: "a@shop.so" }, noSend),
    ).rejects.toThrow(/9 digits/);
    expect(await prisma.loginAttempt.count()).toBe(0);
  });
});
