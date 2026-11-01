import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "@/modules/auth/password";
import { consumeResetToken } from "@/modules/auth/reset";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

/**
 * Regression for security finding H1: the password-reset email link must be
 * built from APP_URL only. The request below carries forged Host,
 * X-Forwarded-Host and X-Forwarded-Proto headers; if the action ever reads them
 * again, the emailed link would point at the attacker's site and these tests fail.
 */
const sent = vi.hoisted(() => [] as { to: string; html: string; text?: string }[]);
const forged = vi.hoisted(() => ({ value: new Headers() }));

vi.mock("next/headers", () => ({ headers: async () => forged.value }));
vi.mock("@/lib/email", () => ({
  emailLayout: (_title: string, body: string) => body,
  sendEmail: async (m: { to: string; html: string; text?: string }) => {
    sent.push(m);
    return { ok: true };
  },
}));

const { requestPasswordResetAction } = await import("@/app/forgot-password/actions");

const APP = "https://orbit.example.so";
const EVIL = "evil.attacker.test";
const EMAIL = "reset-victim@orbit.so";

const form = (email: string) => {
  const f = new FormData();
  f.set("email", email);
  return f;
};
const linksIn = (s: string) => s.match(/https?:\/\/[^\s"<>]+/g) ?? [];

beforeAll(() => assertTestDatabase());
beforeEach(async () => {
  await resetDb();
  sent.length = 0;
  vi.stubEnv("APP_URL", APP);
  forged.value = new Headers({ host: EVIL, "x-forwarded-host": EVIL, "x-forwarded-proto": "http" });
  await prisma.user.create({ data: { email: EMAIL, status: "ACTIVE" } });
});
afterEach(() => vi.unstubAllEnvs());
afterAll(() => prisma.$disconnect());

describe("password-reset email link (H1)", () => {
  it("ignores forged Host / X-Forwarded-Host / X-Forwarded-Proto and uses APP_URL only", async () => {
    expect(await requestPasswordResetAction({ done: false }, form(EMAIL))).toEqual({ done: true });
    expect(sent).toHaveLength(1);
    const mail = sent[0]!;
    const links = [...linksIn(mail.html), ...linksIn(mail.text ?? "")];
    expect(links.length).toBeGreaterThanOrEqual(2); // the button and the plain-text link
    for (const l of links) {
      expect(new URL(l).origin).toBe(APP);
      expect(new URL(l).pathname).toBe("/reset-password");
    }
    expect(mail.html + (mail.text ?? "")).not.toContain(EVIL);
  });

  it("only the forwarded host is forged: still APP_URL", async () => {
    forged.value = new Headers({ host: "orbit.example.so", "x-forwarded-host": EVIL });
    await requestPasswordResetAction({ done: false }, form(EMAIL));
    expect(linksIn(sent[0]!.html).every((l) => new URL(l).origin === APP)).toBe(true);
    expect(sent[0]!.html).not.toContain(EVIL);
  });

  it("the emailed link carries a real, single-use token that resets the password", async () => {
    await requestPasswordResetAction({ done: false }, form(EMAIL));
    const token = new URL(linksIn(sent[0]!.text ?? "")[0]!).searchParams.get("token")!;
    await consumeResetToken(prisma, token, "NewPassw0rd!x");
    const u = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(await verifyPassword(u.passwordHash!, "NewPassw0rd!x")).toBe(true);
    await expect(consumeResetToken(prisma, token, "Another0ne!x")).rejects.toThrow();
  });

  it("without a valid APP_URL in production, no email goes out and nothing is revealed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    expect(await requestPasswordResetAction({ done: false }, form(EMAIL))).toEqual({ done: true });
    vi.stubEnv("APP_URL", "http://orbit.example.so"); // not HTTPS
    expect(await requestPasswordResetAction({ done: false }, form(EMAIL))).toEqual({ done: true });
    expect(sent).toHaveLength(0);
  });

  it("an unknown email gets the same answer and no email", async () => {
    expect(await requestPasswordResetAction({ done: false }, form("nobody@orbit.so"))).toEqual({ done: true });
    expect(sent).toHaveLength(0);
  });
});
