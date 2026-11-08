import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

/**
 * W2: the sign-in page's code requests are limited per client IP, and the IP
 * comes only from our trusted proxy. A client that forges X-Forwarded-For or
 * X-Real-IP can neither dodge the limit nor make us count someone else.
 */
const incoming = vi.hoisted(() => ({ headers: new Headers() }));
const sent = vi.hoisted(() => [] as string[]);
vi.mock("next/headers", () => ({ headers: async () => incoming.headers }));
vi.mock("@/auth", () => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next-auth", () => ({ AuthError: class AuthError extends Error {} }));
vi.mock("@/lib/otpEmail", () => ({
  sendOtpEmail: async (to: string) => {
    sent.push(to);
  },
}));

const { requestAccessAction } = await import("@/app/login/actions");

const PROXY_SEEN = "198.51.100.20";
const RATE = { ok: false, error: "Too many attempts. Try again later." };
const ask = (i: number) => requestAccessAction({ id: `EMP-Q${i}`, phone: "", email: "nobody@orbit.so" });

beforeAll(() => assertTestDatabase());
beforeEach(async () => {
  sent.length = 0;
  await resetDb();
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => prisma.$disconnect());

describe("code requests from the sign-in page", () => {
  it("behind our proxy, counts the address the proxy saw, not the one the client forged", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    for (let i = 0; i < 10; i++) {
      // A new forged address every time; our proxy appends the real one on the right.
      incoming.headers = new Headers({ "x-forwarded-for": `6.6.6.${i}, ${PROXY_SEEN}`, "x-real-ip": `7.7.7.${i}` });
      expect(await ask(i)).toEqual({ ok: true });
    }
    incoming.headers = new Headers({ "x-forwarded-for": `9.9.9.9, ${PROXY_SEEN}` });
    expect(await ask(99)).toEqual(RATE);

    const rows = await prisma.loginAttempt.findMany({ where: { kind: "otp_request" }, select: { ip: true } });
    expect(new Set(rows.map((r) => r.ip))).toEqual(new Set([PROXY_SEEN]));
    expect(sent).toHaveLength(0);
  });

  it("a forged header can't get someone else limited", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    for (let i = 0; i < 10; i++) {
      incoming.headers = new Headers({ "x-forwarded-for": `${PROXY_SEEN}, 203.0.113.50` }); // attacker names the victim's address
      await ask(i);
    }
    incoming.headers = new Headers({ "x-forwarded-for": PROXY_SEEN }); // the victim
    expect(await ask(50)).toEqual({ ok: true });
  });

  it("with no trusted proxy configured, client headers are ignored entirely", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "0");
    incoming.headers = new Headers({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.9" });
    for (let i = 0; i < 12; i++) expect(await ask(i)).toEqual({ ok: true });
    expect(await prisma.loginAttempt.count({ where: { kind: "otp_request" } })).toBe(0);
  });
});
