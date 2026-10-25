import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TransferRole } from "@prisma/client";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { incomeAndOut } from "@/modules/accounting/service";
import { addReceive, deleteReceive, monthReport } from "@/modules/transfer/money";
import { createTransferReceipt, getTransferReceipt, myTransferReceipts, voidTransferReceipt } from "@/modules/transfer/receipts";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;
const NOW = new Date("2026-10-24T09:00:00Z");

async function agent(transferRole: TransferRole, transferCountries: string[] = []): Promise<AuthzUser> {
  const e = await prisma.employee.create({ data: { code: `EMP-${uniq()}`, name: "Agent", department: "FINANCE", transferRole, transferCountries } });
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE", employeeId: e.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

async function customerUser(ref: string): Promise<{ user: AuthzUser; id: string }> {
  const c = await prisma.customer.create({ data: { ref, name: `Customer ${ref}` } });
  const u = await prisma.user.create({ data: { email: `${uniq()}@cust.so`, status: "ACTIVE", customerId: c.id } });
  return { user: (await loadAuthzUser(prisma, u.id))!, id: c.id };
}

const receive = (over: Partial<Parameters<typeof addReceive>[2]> = {}) => ({
  country: "Turkey",
  year: 2026,
  kind: "CUSTOMER" as const,
  receivedAt: "2026-10-05",
  amount: "1000",
  feePct: "1.5",
  currency: "USD",
  description: "galad to sina",
  tag: "OTHER" as const,
  ...over,
});

describe("Receipt Voucher for a money transfer", () => {
  it("is numbered 5000, 5001 … per year, one live per row, and does not touch Income", async () => {
    const rec = await agent("RECEIVE");
    const snd = await agent("SEND");
    const a = await addReceive(prisma, rec, receive());
    const b = await addReceive(prisma, rec, receive({ description: "hodan to amal" }));
    const before = (await incomeAndOut(prisma, await superAdminUser(), { country: "Turkey", year: 2026 })).balance;

    const input = { receivedFrom: "galad", amount: "985", fee: "15", description: "to sina" };
    await expect(createTransferReceipt(prisma, snd, a.id, input)).rejects.toThrow(/permission/i);
    await expect(createTransferReceipt(prisma, rec, a.id, { ...input, amount: "" })).rejects.toThrow(/amount/);
    await expect(createTransferReceipt(prisma, rec, a.id, { ...input, reference: "OR-9999" })).rejects.toThrow(/No customer/);
    const r1 = await createTransferReceipt(prisma, rec, a.id, input);
    await expect(createTransferReceipt(prisma, rec, a.id, input)).rejects.toThrow(/already has a receipt/);
    const r2 = await createTransferReceipt(prisma, rec, b.id, { receivedFrom: "hodan", amount: "985", description: "to amal" });
    expect([r1.number, r2.number]).toEqual([5000, 5001]);

    const d1 = await getTransferReceipt(prisma, rec, r1.id);
    // "Amount of" is the money sent (in words too); the total adds the fee.
    expect(d1).toMatchObject({ receivedFrom: "GALAD", description: "TO SINA", amount: "985", fee: "15", received: "1000", inWords: "Nine hundred eighty-five US dollars only" });
    const d2 = await getTransferReceipt(prisma, rec, r2.id);
    expect([d2.received, d2.fee]).toEqual(["985", null]); // no fee typed: only the amount shows

    // The report shows the receipt on its row.
    const rep = await monthReport(prisma, rec, { country: "Turkey", year: 2026, kind: "CUSTOMER" }, NOW);
    expect(rep.rows.find((r) => r.id === a.id)!.receipt).toEqual({ id: r1.id, number: 5000 });
    // A paper only: Income and the balance are unchanged.
    expect((await incomeAndOut(prisma, await superAdminUser(), { country: "Turkey", year: 2026 })).balance).toBe(before);

    // A row with a live receipt can't be deleted; void it, then a new one gets the next number.
    await expect(deleteReceive(prisma, rec, a.id)).rejects.toThrow(/Void its receipt/);
    await voidTransferReceipt(prisma, rec, r1.id);
    const r3 = await createTransferReceipt(prisma, rec, a.id, input);
    expect(r3.number).toBe(5002);
    expect((await getTransferReceipt(prisma, rec, r1.id)).voided).toBe(true);

    // A new year starts again at 5000.
    const c = await addReceive(prisma, rec, receive({ year: 2027, receivedAt: "2027-01-03" }));
    expect((await createTransferReceipt(prisma, rec, c.id, input)).number).toBe(5000);
  });

  it("with a customer reference it shows in that customer's Documents, and only theirs", async () => {
    const rec = await agent("RECEIVE");
    const mine = await customerUser("OR-3000");
    const other = await customerUser("OR-3001");
    const row = await addReceive(prisma, rec, receive());
    const r = await createTransferReceipt(prisma, rec, row.id, { receivedFrom: "galad", reference: "or-3000", amount: "985", description: "to sina" });

    const list = await myTransferReceipts(prisma, mine.user);
    expect(list.map((x) => [x.number, x.customerRef, x.description])).toEqual([[5000, "OR-3000", "TO SINA"]]);
    expect(await myTransferReceipts(prisma, other.user)).toEqual([]);
    await expect(getTransferReceipt(prisma, other.user, r.id)).rejects.toThrow(/not found/);
    await expect(myTransferReceipts(prisma, rec)).rejects.toThrow(/Customers only/);

    // A voided receipt leaves the customer's Documents.
    await voidTransferReceipt(prisma, rec, r.id);
    expect(await myTransferReceipts(prisma, mine.user)).toEqual([]);
  });
});

async function superAdminUser(): Promise<AuthzUser> {
  const role = await prisma.role.upsert({ where: { key: "super_admin" }, create: { key: "super_admin", name: "Super Admin" }, update: {} });
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}
