import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TransferRole } from "@prisma/client";
import { can, loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { incomeAndOut } from "@/modules/accounting/service";
import { addReceive, deleteReceive, deleteSend, editReceive, monthReport, recordSend, setHanded, startNewMonth, transferAccess } from "@/modules/transfer/money";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;
const NOW = new Date("2026-10-24T09:00:00Z");

async function superAdmin(): Promise<AuthzUser> {
  const role = await prisma.role.upsert({ where: { key: "super_admin" }, create: { key: "super_admin", name: "Super Admin" }, update: {} });
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

/** An employee with only the Money Transfer special access. */
async function agent(transferRole: TransferRole, transferCountries: string[] = []): Promise<AuthzUser> {
  const e = await prisma.employee.create({ data: { code: `EMP-${uniq()}`, name: "Agent", department: "FINANCE", transferRole, transferCountries } });
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE", employeeId: e.id } });
  // A role-granted transfer permission must not matter: the employee setting decides.
  const r = await prisma.role.create({ data: { key: `r-${uniq()}`, name: "r" } });
  const p = await prisma.permission.upsert({ where: { key: "transfer:read" }, create: { key: "transfer:read" }, update: {} });
  await prisma.rolePermission.create({ data: { roleId: r.id, permissionId: p.id } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: r.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

const receive = (over: Partial<Parameters<typeof addReceive>[2]> = {}) => ({
  country: "Turkey",
  year: 2026,
  kind: "CUSTOMER" as const,
  receivedAt: "2026-10-05",
  amount: "1000",
  feePct: "1.5",
  currency: "USD",
  description: "partners to sina",
  tag: "CLOTHES" as const,
  ...over,
});

describe("Money Transfer roles", () => {
  it("the employee's Receiver / Sender setting decides; Sender is Turkey-only by default", async () => {
    const none = await agent("NONE");
    expect(can(none, "transfer:read")).toBe(false);
    const rec = await agent("RECEIVE");
    const snd = await agent("SEND");
    expect([can(rec, "transfer:receive"), can(rec, "transfer:send")]).toEqual([true, false]);
    expect([can(snd, "transfer:send"), can(snd, "transfer:receive")]).toEqual([true, false]);
    expect((await transferAccess(prisma, snd)).countries).toEqual(["Turkey"]);
    const indiaSender = await agent("SEND", ["India"]);
    expect((await transferAccess(prisma, indiaSender)).countries).toEqual(["India"]);
    expect((await transferAccess(prisma, await superAdmin())).role).toBe("SUPER");
  });
});

describe("Money Status Report", () => {
  it("fee is deducted from the amount; the Sender can act only on a green row and reads the fee from it", async () => {
    const rec = await agent("RECEIVE");
    const snd = await agent("SEND");
    const row = await addReceive(prisma, rec, receive());
    await expect(addReceive(prisma, snd, receive())).rejects.toThrow(/permission/i);

    let r = await monthReport(prisma, rec, { country: "Turkey", year: 2026, kind: "CUSTOMER" }, NOW);
    expect(r.rows[0]).toMatchObject({ amount: "1000", fee: "15", net: "985", description: "PARTNERS TO SINA", handed: false, sent: null });

    const send = { sentAt: "2026-10-06", amount: "1000", currency: "USD", status: "PAID" as const };
    await expect(recordSend(prisma, snd, row.id, send)).rejects.toThrow(/not handed/);
    await expect(setHanded(prisma, snd, row.id, true)).rejects.toThrow(/permission/i); // only the Receiver turns it green
    await setHanded(prisma, rec, row.id, true);
    await recordSend(prisma, snd, row.id, send);
    r = await monthReport(prisma, snd, { country: "Turkey", year: 2026, kind: "CUSTOMER" }, NOW);
    expect(r.rows[0]!.sent).toMatchObject({ amount: "1000", fee: "15", delivered: "985", status: "PAID" });
    expect(r.totals).toMatchObject({ received: "985", fees: "15", sent: "985", notSent: "0" });

    // Locked once sent: no edit, no un-handing, no delete of the receive side.
    await expect(editReceive(prisma, rec, row.id, receive({ amount: "900" }))).rejects.toThrow(/Sender already/);
    await expect(setHanded(prisma, rec, row.id, false)).rejects.toThrow(/Sender already/);
    await expect(deleteReceive(prisma, rec, row.id)).rejects.toThrow(/transfer side first/);
    await deleteSend(prisma, snd, row.id);
    await deleteReceive(prisma, rec, row.id);
    expect((await monthReport(prisma, rec, { country: "Turkey", year: 2026, kind: "CUSTOMER" }, NOW)).rows).toHaveLength(0);
  });

  it("validates input and keeps people to their countries", async () => {
    const rec = await agent("RECEIVE");
    await expect(addReceive(prisma, rec, receive({ amount: "0" }))).rejects.toThrow(/amount/);
    await expect(addReceive(prisma, rec, receive({ feePct: "100" }))).rejects.toThrow(/fee/);
    await expect(addReceive(prisma, rec, receive({ currency: "GBP" }))).rejects.toThrow(/currency/);
    await expect(addReceive(prisma, rec, receive({ description: "  " }))).rejects.toThrow(/required/);
    await expect(addReceive(prisma, rec, receive({ receivedAt: "2025-12-31" }))).rejects.toThrow(/selected year/);
    await expect(addReceive(prisma, rec, receive({ country: "India" }))).rejects.toThrow(/countries/);
    await expect(monthReport(prisma, rec, { country: "India", year: 2026, kind: "CUSTOMER" }, NOW)).rejects.toThrow(/countries/);
  });

  it("months: shown up to the current one; Start new month opens the next", async () => {
    const rec = await agent("RECEIVE");
    let r = await monthReport(prisma, rec, { country: "Turkey", year: 2026, kind: "CUSTOMER" }, NOW);
    expect([r.month, r.months.length]).toEqual([10, 10]);
    expect(await startNewMonth(prisma, rec, { country: "Turkey", year: 2026 }, NOW)).toBe(11);
    r = await monthReport(prisma, rec, { country: "Turkey", year: 2026, kind: "CUSTOMER" }, NOW);
    expect(r.month).toBe(11);
    await addReceive(prisma, rec, receive({ receivedAt: "2026-09-10" }));
    r = await monthReport(prisma, rec, { country: "Turkey", year: 2026, kind: "CUSTOMER", month: 9 }, NOW);
    expect([r.month, r.rows.length]).toEqual([9, 1]);
    const snd = await agent("SEND");
    await expect(startNewMonth(prisma, snd, { country: "Turkey", year: 2026 }, NOW)).rejects.toThrow(/Receiver/);
  });

  it("customer transfers (USD) count in Accounting income; operation-cost rows don't", async () => {
    const admin = await superAdmin();
    await addReceive(prisma, admin, receive({ amount: "500" }));
    await addReceive(prisma, admin, receive({ amount: "300", kind: "OPERATION", tag: null }));
    await addReceive(prisma, admin, receive({ amount: "200", currency: "EUR" }));
    const io = await incomeAndOut(prisma, admin, { country: "Turkey", year: 2026 });
    expect([io.totals.moneyReceive, io.balance]).toEqual(["500", "500"]);
    expect(io.composition.find((r) => r.key === "transfer")!.in).toBe("500");
    expect(io.income.some((i) => i.kind === "Money Receive" && i.amount === "500")).toBe(true);
  });
});
