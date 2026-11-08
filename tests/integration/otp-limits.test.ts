import type { OtpPurpose } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitError, ValidationError } from "@/lib/errors";
import { requestCustomerAccess, requestStaffSetup, startCustomerSignup } from "@/modules/auth/flows";
import { issueOtp, OTP_MAX_ATTEMPTS, OTP_TTL_MS, OtpEmailCapError, verifyOtp } from "@/modules/auth/otp";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

/**
 * Security findings W1 and W2: the OTP attempt limit and the email sending
 * limits must hold under simultaneous requests, and per-IP limits must not
 * reveal whether an account exists.
 */
beforeAll(() => assertTestDatabase());
beforeEach(async () => {
  outbox.length = 0;
  await resetDb();
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => prisma.$disconnect());

const outbox: { to: string; code: string; purpose: OtpPurpose }[] = [];
const send = async (to: string, code: string, purpose: OtpPurpose) => {
  outbox.push({ to, code, purpose });
};
const other = (c: string) => (c === "000000" ? "111111" : "000000");
const settle = async <T>(n: number, fn: (i: number) => Promise<T>) => Promise.allSettled(Array.from({ length: n }, (_, i) => fn(i)));
const ok = (r: PromiseSettledResult<unknown>[]) => r.filter((x) => x.status === "fulfilled").length;
const rejectedWith = (r: PromiseSettledResult<unknown>[], cls: new (...a: never[]) => Error) =>
  r.filter((x) => x.status === "rejected" && x.reason instanceof cls).length;

const EMAIL = "amina@shop.so";
async function activeCustomer(ref = "OR-3001") {
  const c = await prisma.customer.create({
    data: { ref, name: "Amina", company: "Co", email: EMAIL, phoneKey: "252615550100", status: "ACTIVE" },
  });
  await prisma.user.create({ data: { email: EMAIL, status: "ACTIVE", customerId: c.id } });
  return c;
}

// --------------------------------------------------------------------- W1

describe("W1: the 5-attempt limit holds under simultaneous guesses", () => {
  it("20 simultaneous wrong guesses: at most 5 are checked, then even the right code is refused", async () => {
    const { id, code } = await issueOtp(prisma, { purpose: "CUSTOMER_ACCESS", email: EMAIL });
    const results = await settle(20, () => verifyOtp(prisma, { purpose: "CUSTOMER_ACCESS", email: EMAIL, code: other(code) }));
    expect(ok(results)).toBe(0);
    expect(rejectedWith(results, ValidationError)).toBe(20);
    expect((await prisma.otpCode.findUniqueOrThrow({ where: { id } })).attempts).toBe(OTP_MAX_ATTEMPTS);
    await expect(verifyOtp(prisma, { purpose: "CUSTOMER_ACCESS", email: EMAIL, code })).rejects.toThrow(ValidationError);
  });

  it("the right code among 20 simultaneous tries succeeds at most once, and only within the 5 attempts", async () => {
    const { id, code } = await issueOtp(prisma, { purpose: "CUSTOMER_ACCESS", email: EMAIL });
    const results = await settle(20, (i) =>
      verifyOtp(prisma, { purpose: "CUSTOMER_ACCESS", email: EMAIL, code: i % 4 === 0 ? code : other(code) }),
    );
    expect(ok(results)).toBeLessThanOrEqual(1);
    expect((await prisma.otpCode.findUniqueOrThrow({ where: { id } })).attempts).toBeLessThanOrEqual(OTP_MAX_ATTEMPTS);
  });

  it("10 simultaneous submissions of the right code consume it exactly once", async () => {
    const { code } = await issueOtp(prisma, { purpose: "STAFF_SETUP", email: EMAIL });
    const results = await settle(10, () => verifyOtp(prisma, { purpose: "STAFF_SETUP", email: EMAIL, code }));
    expect(ok(results)).toBe(1);
  });

  it("unchanged: 6 digits, 10-minute expiry, purpose-bound, single use", async () => {
    const { id, code } = await issueOtp(prisma, { purpose: "CUSTOMER_SIGNUP", email: EMAIL });
    expect(code).toMatch(/^\d{6}$/);
    const row = await prisma.otpCode.findUniqueOrThrow({ where: { id } });
    expect(Math.abs(row.expiresAt.getTime() - row.createdAt.getTime() - OTP_TTL_MS)).toBeLessThan(5_000);
    expect(row.codeHash).not.toContain(code);
    // The right code under another purpose is refused and doesn't touch this code.
    await expect(verifyOtp(prisma, { purpose: "CUSTOMER_ACCESS", email: EMAIL, code })).rejects.toThrow(ValidationError);
    await verifyOtp(prisma, { purpose: "CUSTOMER_SIGNUP", email: EMAIL, code });
    await expect(verifyOtp(prisma, { purpose: "CUSTOMER_SIGNUP", email: EMAIL, code })).rejects.toThrow(ValidationError);
  });

  it("an expired code is refused without using an attempt", async () => {
    const { id, code } = await issueOtp(prisma, { purpose: "CUSTOMER_ACCESS", email: EMAIL });
    // (A CHECK keeps expiresAt after createdAt, so age the whole code.)
    await prisma.otpCode.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000), createdAt: new Date(Date.now() - 20 * 60 * 1000) } });
    await expect(verifyOtp(prisma, { purpose: "CUSTOMER_ACCESS", email: EMAIL, code })).rejects.toThrow(ValidationError);
    expect((await prisma.otpCode.findUniqueOrThrow({ where: { id } })).attempts).toBe(0);
  });
});

// --------------------------------------------------------------------- W2

describe("W2: sending limits hold under simultaneous requests", () => {
  it("per email: 12 simultaneous matching requests send exactly 5 codes", async () => {
    await activeCustomer();
    const results = await settle(12, () =>
      requestCustomerAccess(prisma, { reference: "OR-3001", phone: "61 555 0100", email: EMAIL }, send),
    );
    expect(ok(results)).toBe(5);
    expect(rejectedWith(results, RateLimitError)).toBe(7);
    expect(outbox).toHaveLength(5);
    expect(await prisma.otpCode.count({ where: { email: EMAIL } })).toBe(5);
  });

  it("global hourly cap: 6 simultaneous sign-ups with a cap of 3 send exactly 3", async () => {
    vi.stubEnv("OTP_EMAIL_HOURLY_CAP", "3");
    const results = await settle(6, (i) =>
      startCustomerSignup(
        prisma,
        { name: `P${i}`, phone: `61 555 02${String(i).padStart(2, "0")}`, email: `p${i}@shop.so`, company: "Co", location: "Mogadishu", cargoCategory: "Clothes" },
        send,
      ),
    );
    expect(ok(results)).toBe(3);
    expect(rejectedWith(results, OtpEmailCapError)).toBe(3);
    expect(outbox).toHaveLength(3);
  });

  it("global cap reached: a matching access request answers exactly like a mismatching one, and sends nothing", async () => {
    await activeCustomer();
    vi.stubEnv("OTP_EMAIL_HOURLY_CAP", "1");
    await issueOtp(prisma, { purpose: "CUSTOMER_SIGNUP", email: "someone@shop.so" }); // uses the hour's only slot
    const matching = await requestCustomerAccess(prisma, { reference: "OR-3001", phone: "61 555 0100", email: EMAIL }, send);
    const mismatching = await requestCustomerAccess(prisma, { reference: "OR-3001", phone: "61 555 0199", email: EMAIL }, send);
    expect(matching).toEqual(mismatching);
    expect(outbox).toHaveLength(0);
  });

  it("per IP: the 11th request in 15 minutes is refused, whatever the details, and other IPs are unaffected", async () => {
    await activeCustomer();
    const ip = "203.0.113.7";
    for (let i = 0; i < 10; i++) {
      await requestStaffSetup(prisma, { employeeId: `EMP-X${i}`, email: "nobody@orbit.so" }, send, ip);
    }
    // Over the limit: a mismatch and a perfect match get the same refusal.
    await expect(requestStaffSetup(prisma, { employeeId: "EMP-X99", email: "nobody@orbit.so" }, send, ip)).rejects.toThrow(RateLimitError);
    await expect(requestCustomerAccess(prisma, { reference: "OR-3001", phone: "61 555 0100", email: EMAIL }, send, ip)).rejects.toThrow(RateLimitError);
    await expect(
      startCustomerSignup(prisma, { name: "N", phone: "61 555 0300", email: "new@shop.so", company: "Co", location: "M", cargoCategory: "C" }, send, ip),
    ).rejects.toThrow(RateLimitError);
    expect(outbox).toHaveLength(0);
    // Another address is fine.
    await requestCustomerAccess(prisma, { reference: "OR-3001", phone: "61 555 0100", email: EMAIL }, send, "203.0.113.8");
    expect(outbox).toHaveLength(1);
  });

  it("per IP: 20 simultaneous requests from one address let exactly 10 through", async () => {
    const ip = "198.51.100.30";
    const results = await settle(20, (i) =>
      requestCustomerAccess(prisma, { reference: `OR-${4000 + i}`, phone: "61 555 0100", email: "nobody@shop.so" }, send, ip),
    );
    expect(ok(results)).toBe(10);
    expect(rejectedWith(results, RateLimitError)).toBe(10);
    expect(await prisma.loginAttempt.count({ where: { ip, kind: "otp_request" } })).toBe(10);
  });

  it("the per-IP limit is configurable", async () => {
    vi.stubEnv("OTP_IP_MAX_PER_15MIN", "2");
    const ip = "198.51.100.31";
    await requestStaffSetup(prisma, { employeeId: "EMP-Y1", email: "a@orbit.so" }, send, ip);
    await requestStaffSetup(prisma, { employeeId: "EMP-Y2", email: "a@orbit.so" }, send, ip);
    await expect(requestStaffSetup(prisma, { employeeId: "EMP-Y3", email: "a@orbit.so" }, send, ip)).rejects.toThrow(RateLimitError);
  });

  it("without a trusted client IP no per-IP row is written (the other limits still apply)", async () => {
    for (let i = 0; i < 12; i++) {
      await requestStaffSetup(prisma, { employeeId: `EMP-Z${i}`, email: "nobody@orbit.so" }, send, null);
    }
    expect(await prisma.loginAttempt.count({ where: { kind: "otp_request" } })).toBe(0);
  });
});
