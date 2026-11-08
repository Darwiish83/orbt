import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetPasswordAction } from "@/app/reset-password/actions";
import { verifyPassword } from "@/modules/auth/password";
import { createSetPasswordToken } from "@/modules/auth/reset";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

/**
 * The one-time set-password link (/reset-password). Since 2026-11-07 its only
 * source is scripts/make-super-admin.ts --link; the old "email me a reset
 * link" page (/forgot-password) was removed: it issued tokens for any account,
 * suspended ones included, accepted weak passwords and left no audit entry.
 * Forgotten passwords use the emailed-code flow on /login.
 */
const EMAIL = "owner@orbit.so";
const GOOD = "Harbour7Lantern4";

const form = (token: string, password: string, confirm = password) => {
  const f = new FormData();
  f.set("token", token);
  f.set("password", password);
  f.set("confirm", confirm);
  return f;
};

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

describe("/reset-password (one-time set-password link)", () => {
  it("applies the password rules and keeps the token usable after a refusal", async () => {
    const u = await prisma.user.create({ data: { email: EMAIL, status: "INVITED" } });
    const token = await createSetPasswordToken(prisma, u.id);
    for (const weak of ["password", "short1", "onlyletterslong", "owner1234567"]) {
      const r = await resetPasswordAction({ error: null }, form(token, weak));
      expect(r.ok).toBeFalsy();
      expect(r.error).toBeTruthy();
    }
    expect((await resetPasswordAction({ error: null }, form(token, GOOD, GOOD + "x"))).ok).toBeFalsy();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash).toBeNull();
    expect((await resetPasswordAction({ error: null }, form(token, GOOD))).ok).toBe(true);
  });

  it("sets the password once, activates the account, ends old sessions and writes an audit entry", async () => {
    const u = await prisma.user.create({ data: { email: EMAIL, status: "INVITED" } });
    const token = await createSetPasswordToken(prisma, u.id);
    expect(await resetPasswordAction({ error: null }, form(token, GOOD))).toEqual({ error: null, ok: true });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(after.status).toBe("ACTIVE");
    expect(after.sessionEpoch).toBeGreaterThan(u.sessionEpoch);
    expect(await verifyPassword(after.passwordHash!, GOOD)).toBe(true);
    expect(await prisma.auditEvent.count({ where: { action: "auth.password_set", entityId: u.id } })).toBe(1);
    // Single use.
    expect((await resetPasswordAction({ error: null }, form(token, "Another9Password2"))).ok).toBeFalsy();
  });

  it("never reactivates a suspended account", async () => {
    const u = await prisma.user.create({ data: { email: EMAIL, status: "SUSPENDED" } });
    const token = await createSetPasswordToken(prisma, u.id);
    const r = await resetPasswordAction({ error: null }, form(token, GOOD));
    expect(r.ok).toBeFalsy();
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect([after.status, after.passwordHash]).toEqual(["SUSPENDED", null]);
  });

  it("refuses a missing or unknown token", async () => {
    expect((await resetPasswordAction({ error: null }, form("", GOOD))).ok).toBeFalsy();
    expect((await resetPasswordAction({ error: null }, form("not-a-real-token", GOOD))).ok).toBeFalsy();
  });
});

describe("no 'email me a reset link' flow", () => {
  it("the /forgot-password route is gone and nothing else mails a set-password link", () => {
    expect(existsSync(join(process.cwd(), "src/app/forgot-password"))).toBe(false);
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name)) files.push(p);
      }
    };
    walk(join(process.cwd(), "src"));
    const offenders = files.filter((f) => {
      const s = readFileSync(f, "utf8");
      return /createResetToken|passwordResetUrl|\/forgot-password/.test(s) && !f.endsWith(join("lib", "appUrl.ts"));
    });
    expect(offenders).toEqual([]);
  });
});
