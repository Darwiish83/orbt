import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import { createCustomer } from "@/modules/customers/service";
import { createInvoice, getInvoice, voidInvoice } from "@/modules/finance/invoices";
import { recordPayment, reversePayment } from "@/modules/finance/payments";
import { convertQuoteToInvoice, createQuote, setQuoteStatus } from "@/modules/finance/quotes";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

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

async function customerId(admin: AuthzUser): Promise<string> {
  return (await createCustomer(prisma, admin, { name: `C-${uniq()}`, company: "Test Co" })).id;
}

describe("charge lines & invoice totals (server-computed)", () => {
  it("computes line amounts and the invoice total from quantity × unitPrice", async () => {
    const admin = await superAdmin();
    const cid = await customerId(admin);
    const inv = await createInvoice(prisma, admin, {
      customerId: cid,
      lines: [
        { category: "FREIGHT", quantity: 3, unitPrice: "10.00" },
        { category: "LOCAL_DELIVERY", quantity: 1, unitPrice: "5.50" },
      ],
    });
    expect(inv.total.toString()).toBe("35.5");
    expect(inv.status).toBe("UNPAID");
    expect(inv.number).toMatch(/^INV-\d{4}-\d{4}$/);
  });

  it("rounds half-up to 2 decimals (no float drift)", async () => {
    const admin = await superAdmin();
    const cid = await customerId(admin);
    const inv = await createInvoice(prisma, admin, {
      customerId: cid,
      lines: [
        { category: "FREIGHT", quantity: 1, unitPrice: "0.10" },
        { category: "FREIGHT", quantity: 1, unitPrice: "0.20" },
        { category: "SERVICE", quantity: 1, unitPrice: "10.335" },
      ],
    });
    // 0.10 + 0.20 + 10.34 = 10.64
    expect(inv.total.toString()).toBe("10.64");
  });
});

describe("payments & allocation", () => {
  async function invoiceOf(admin: AuthzUser, cid: string, amount: string) {
    return createInvoice(prisma, admin, {
      customerId: cid,
      lines: [{ category: "FREIGHT", quantity: 1, unitPrice: amount }],
    });
  }

  it("partial then full payment moves UNPAID → PARTIAL → PAID", async () => {
    const admin = await superAdmin();
    const cid = await customerId(admin);
    const inv = await invoiceOf(admin, cid, "100.00");

    await recordPayment(prisma, admin, {
      customerId: cid,
      amount: "40.00",
      method: "CASH",
      allocations: [{ invoiceId: inv.id, amount: "40.00" }],
    });
    let read = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(read.status).toBe("PARTIAL");
    expect(read.amountAllocated.toString()).toBe("40");

    await recordPayment(prisma, admin, {
      customerId: cid,
      amount: "60.00",
      method: "BANK_TRANSFER",
      allocations: [{ invoiceId: inv.id, amount: "60.00" }],
    });
    read = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(read.status).toBe("PAID");
    expect(read.amountAllocated.toString()).toBe("100");
  });

  it("rejects an allocation that exceeds the invoice balance (overpayment)", async () => {
    const admin = await superAdmin();
    const cid = await customerId(admin);
    const inv = await invoiceOf(admin, cid, "100.00");
    await expect(
      recordPayment(prisma, admin, {
        customerId: cid,
        amount: "150.00",
        method: "CASH",
        allocations: [{ invoiceId: inv.id, amount: "150.00" }],
      }),
    ).rejects.toThrow(/exceeds the invoice balance/i);
    const read = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(read.status).toBe("UNPAID"); // transaction rolled back
  });

  it("rejects allocations beyond the payment amount", async () => {
    const admin = await superAdmin();
    const cid = await customerId(admin);
    const inv = await invoiceOf(admin, cid, "100.00");
    await expect(
      recordPayment(prisma, admin, {
        customerId: cid,
        amount: "40.00",
        method: "CASH",
        allocations: [{ invoiceId: inv.id, amount: "60.00" }],
      }),
    ).rejects.toThrow(/exceed the payment/i);
  });

  it("rejects a currency mismatch between payment and invoice", async () => {
    const admin = await superAdmin();
    const cid = await customerId(admin);
    const inv = await invoiceOf(admin, cid, "100.00"); // USD
    await expect(
      recordPayment(prisma, admin, {
        customerId: cid,
        amount: "100.00",
        currency: "EUR",
        method: "CASH",
        allocations: [{ invoiceId: inv.id, amount: "100.00" }],
      }),
    ).rejects.toThrow(/currency/i);
  });

  it("splits one payment across multiple invoices", async () => {
    const admin = await superAdmin();
    const cid = await customerId(admin);
    const a = await invoiceOf(admin, cid, "50.00");
    const b = await invoiceOf(admin, cid, "50.00");
    await recordPayment(prisma, admin, {
      customerId: cid,
      amount: "100.00",
      method: "CASH",
      allocations: [
        { invoiceId: a.id, amount: "50.00" },
        { invoiceId: b.id, amount: "50.00" },
      ],
    });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("PAID");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("PAID");
  });

  it("is idempotent on idempotencyKey", async () => {
    const admin = await superAdmin();
    const cid = await customerId(admin);
    const inv = await invoiceOf(admin, cid, "100.00");
    const input = {
      customerId: cid,
      amount: "100.00",
      method: "CASH" as const,
      idempotencyKey: "pay-1",
      allocations: [{ invoiceId: inv.id, amount: "100.00" }],
    };
    await recordPayment(prisma, admin, input);
    await recordPayment(prisma, admin, input);
    expect(await prisma.payment.count({ where: { customerId: cid } })).toBe(1);
  });

  it("reversal keeps history and returns the invoice to UNPAID", async () => {
    const admin = await superAdmin();
    const cid = await customerId(admin);
    const inv = await invoiceOf(admin, cid, "100.00");
    const payment = await recordPayment(prisma, admin, {
      customerId: cid,
      amount: "100.00",
      method: "CASH",
      allocations: [{ invoiceId: inv.id, amount: "100.00" }],
    });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PAID");

    await reversePayment(prisma, admin, payment.id, "customer refund");
    const read = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(read.status).toBe("UNPAID");
    expect(read.amountAllocated.toString()).toBe("0");
    // History preserved: the allocation row and the (reversed) payment remain.
    expect(await prisma.paymentAllocation.count({ where: { paymentId: payment.id } })).toBe(1);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).reversedAt).not.toBeNull();
  });
});

describe("invoice voiding & authorization", () => {
  it("cannot void an invoice with payments; can void an empty one", async () => {
    const admin = await superAdmin();
    const cid = await customerId(admin);
    const inv = await createInvoice(prisma, admin, {
      customerId: cid,
      lines: [{ category: "FREIGHT", quantity: 1, unitPrice: "10.00" }],
    });
    await recordPayment(prisma, admin, {
      customerId: cid,
      amount: "10.00",
      method: "CASH",
      allocations: [{ invoiceId: inv.id, amount: "10.00" }],
    });
    await expect(voidInvoice(prisma, admin, inv.id)).rejects.toThrow(/reverse the payments/i);

    const empty = await createInvoice(prisma, admin, {
      customerId: cid,
      lines: [{ category: "SERVICE", quantity: 1, unitPrice: "20.00" }],
    });
    expect((await voidInvoice(prisma, admin, empty.id)).status).toBe("VOID");
  });

  it("denies finance operations without permission", async () => {
    const admin = await superAdmin();
    const cid = await customerId(admin);
    const readOnly = await staff(["customers:read"]);
    await expect(
      createInvoice(prisma, readOnly, { customerId: cid, lines: [{ category: "FREIGHT", quantity: 1, unitPrice: "1" }] }),
    ).rejects.toThrow();
    await expect(
      recordPayment(prisma, readOnly, { customerId: cid, amount: "1", method: "CASH" }),
    ).rejects.toThrow();
  });
});

describe("quotes", () => {
  it("creates a quote, accepts it, and converts it to an invoice", async () => {
    const admin = await superAdmin();
    const cid = await customerId(admin);
    const quote = await createQuote(prisma, admin, {
      customerId: cid,
      lines: [
        { category: "FREIGHT", quantity: 2, unitPrice: "25.00" },
        { category: "LOCAL_DELIVERY", quantity: 1, unitPrice: "10.00" },
      ],
    });
    expect(quote.total.toString()).toBe("60");

    await expect(convertQuoteToInvoice(prisma, admin, quote.id)).rejects.toThrow(/accepted/i);

    await setQuoteStatus(prisma, admin, quote.id, "SENT");
    await setQuoteStatus(prisma, admin, quote.id, "ACCEPTED");
    const invoice = await convertQuoteToInvoice(prisma, admin, quote.id);
    expect(invoice.total.toString()).toBe("60");

    const full = await getInvoice(prisma, admin, invoice.id);
    expect(full!.lines.length).toBe(2);
  });

  it("rejects an illegal quote transition", async () => {
    const admin = await superAdmin();
    const cid = await customerId(admin);
    const quote = await createQuote(prisma, admin, {
      customerId: cid,
      lines: [{ category: "FREIGHT", quantity: 1, unitPrice: "1.00" }],
    });
    await expect(setQuoteStatus(prisma, admin, quote.id, "ACCEPTED")).rejects.toThrow(/illegal quote transition/i);
  });
});
