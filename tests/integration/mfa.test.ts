import { authenticator } from "otplib";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadAuthzUser, type AuthzUser } from "@/modules/authz/core";
import {
  beginMfaSetup,
  disableMfa,
  enableMfa,
  isPrivileged,
  verifyMfa,
  verifyTotpCode,
} from "@/modules/auth/mfa";
import { decryptSecret, encryptSecret } from "@/modules/auth/secretCrypto";
import { assertTestDatabase, prisma, resetDb } from "./helpers";

beforeAll(() => assertTestDatabase());
beforeEach(() => resetDb());
afterAll(() => prisma.$disconnect());

let seq = 0;
const uniq = () => `${Date.now()}-${seq++}`;

/** The TOTP code `offsetSeconds` from now (negative = an earlier code). */
function codeAt(secret: string, offsetSeconds: number): string {
  return authenticator.clone({ epoch: Date.now() + offsetSeconds * 1000 }).generate(secret);
}

async function makeUser(): Promise<{ id: string }> {
  return prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
}

async function superAdmin(): Promise<AuthzUser> {
  const role = await prisma.role.create({ data: { key: "super_admin", name: "Super Admin" } });
  const user = await prisma.user.create({ data: { email: `${uniq()}@orbit.so`, status: "ACTIVE" } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return (await loadAuthzUser(prisma, user.id))!;
}

describe("secret encryption", () => {
  it("round-trips a secret via AES-256-GCM", () => {
    const enc = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(enc).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(enc)).toBe("JBSWY3DPEHPK3PXP");
  });
});

describe("privileged classification", () => {
  it("treats super_admin and *_admin roles as privileged", () => {
    expect(isPrivileged(["super_admin"], false)).toBe(true);
    expect(isPrivileged(["finance_admin"], false)).toBe(true);
    expect(isPrivileged([], true)).toBe(true);
    expect(isPrivileged(["operation_staff"], false)).toBe(false);
    expect(isPrivileged(["customer"], false)).toBe(false);
  });
});

describe("TOTP enrollment & verification", () => {
  it("enrolls with a valid code and issues recovery codes", async () => {
    const user = await makeUser();
    const { secret } = await beginMfaSetup(prisma, user.id, "u@orbit.so");

    const pending = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(pending.mfaEnabled).toBe(false);
    expect(pending.mfaSecret).toBeTruthy();

    expect(verifyTotpCode(secret, authenticator.generate(secret))).toBe(true);
    expect(verifyTotpCode(secret, "000000")).toBe(false);

    const codes = await enableMfa(prisma, user.id, authenticator.generate(secret));
    expect(codes).toHaveLength(10);
    const enabled = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(enabled.mfaEnabled).toBe(true);
    expect(await prisma.mfaRecoveryCode.count({ where: { userId: user.id } })).toBe(10);
  });

  it("rejects enabling with a wrong code", async () => {
    const user = await makeUser();
    await beginMfaSetup(prisma, user.id, "u@orbit.so");
    await expect(enableMfa(prisma, user.id, "000000")).rejects.toThrow();
  });

  it("verifies a TOTP at login and a recovery code once", async () => {
    const user = await makeUser();
    const { secret } = await beginMfaSetup(prisma, user.id, "u@orbit.so");
    const codes = await enableMfa(prisma, user.id, authenticator.generate(secret));

    // The enrolment code is spent; the next 30-second code signs in.
    expect(await verifyMfa(prisma, user.id, authenticator.generate(secret))).toBe(false);
    expect(await verifyMfa(prisma, user.id, codeAt(secret, 30))).toBe(true);
    expect(await verifyMfa(prisma, user.id, "000000")).toBe(false);

    // Recovery code works once.
    expect(await verifyMfa(prisma, user.id, codes[0]!)).toBe(true);
    expect(await verifyMfa(prisma, user.id, codes[0]!)).toBe(false);
  });

  it("disables MFA (self) clearing secret and recovery codes", async () => {
    const admin = await superAdmin();
    const { secret } = await beginMfaSetup(prisma, admin.id, admin.email);
    await enableMfa(prisma, admin.id, authenticator.generate(secret));

    await disableMfa(prisma, admin, admin.id);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(after.mfaEnabled).toBe(false);
    expect(after.mfaSecret).toBeNull();
    expect(await prisma.mfaRecoveryCode.count({ where: { userId: admin.id } })).toBe(0);
  });
});

describe("TOTP timing and replay", () => {
  async function enrolled() {
    const user = await makeUser();
    const { secret } = await beginMfaSetup(prisma, user.id, "t@orbit.so");
    // Enrol with the code from two steps ago so the current window is still unused.
    await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: encryptSecret(secret), mfaEnabled: true, mfaLastStep: 0 } });
    return { user, secret };
  }

  it("accepts a code that rotated a moment ago (previous 30 s) and one from a clock slightly ahead", async () => {
    const a = await enrolled();
    expect(await verifyMfa(prisma, a.user.id, codeAt(a.secret, -30))).toBe(true);
    const b = await enrolled();
    expect(await verifyMfa(prisma, b.user.id, codeAt(b.secret, 30))).toBe(true);
  });

  it("rejects codes more than one step away", async () => {
    const { user, secret } = await enrolled();
    expect(await verifyMfa(prisma, user.id, codeAt(secret, -90))).toBe(false);
    expect(await verifyMfa(prisma, user.id, codeAt(secret, 90))).toBe(false);
  });

  it("never accepts the same code twice, nor an older one after a newer was used", async () => {
    const { user, secret } = await enrolled();
    const now = codeAt(secret, 0);
    expect(await verifyMfa(prisma, user.id, now)).toBe(true);
    expect(await verifyMfa(prisma, user.id, now)).toBe(false);
    expect(await verifyMfa(prisma, user.id, codeAt(secret, -30))).toBe(false);
  });

  it("two simultaneous logins with one code: only one passes", async () => {
    const { user, secret } = await enrolled();
    const code = codeAt(secret, 0);
    const results = await Promise.all([verifyMfa(prisma, user.id, code), verifyMfa(prisma, user.id, code)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
