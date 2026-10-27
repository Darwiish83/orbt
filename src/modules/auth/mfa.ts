import { createHash, randomInt } from "node:crypto";
import { authenticator } from "otplib";
import type { PrismaClient } from "@prisma/client";
import { logAudit } from "@/modules/audit/log";
import { requirePermission, type AuthzUser } from "@/modules/authz/core";
import { decryptSecret, encryptSecret } from "./secretCrypto";

const ISSUER = "OrbitCargo";
const RECOVERY_CODE_COUNT = 10;

/** Privileged accounts (must enroll in MFA): super admin or any *_admin role. */
export function isPrivileged(roleKeys: string[], isSuperAdmin: boolean): boolean {
  return isSuperAdmin || roleKeys.some((k) => k === "super_admin" || k.endsWith("_admin"));
}

function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function generateRecoveryCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += alphabet[randomInt(alphabet.length)];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

const STEP_SECONDS = 30;
/**
 * Accept the current 30-second code and one step either side: a code that
 * rotated while it was being typed, or a phone clock a little off, still
 * works (RFC 6238 §5.2). Replays are blocked separately (mfaLastStep).
 */
const TOTP = authenticator.clone({ window: 1 });

/** The 30-second step a valid code belongs to, or null if the code is wrong. */
export function totpStep(secret: string, code: string): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  try {
    const delta = TOTP.checkDelta(c, secret);
    return delta === null ? null : Math.floor(Date.now() / 1000 / STEP_SECONDS) + delta;
  } catch {
    return null;
  }
}

export function verifyTotpCode(secret: string, code: string): boolean {
  return totpStep(secret, code) !== null;
}

/** Begin enrollment: store an (encrypted) secret, mfaEnabled stays false until
 * confirmed. Returns the secret + otpauth URI for the authenticator app. */
export async function beginMfaSetup(
  db: PrismaClient,
  userId: string,
  accountLabel: string,
): Promise<{ secret: string; otpauthUri: string }> {
  const secret = authenticator.generateSecret();
  await db.user.update({ where: { id: userId }, data: { mfaSecret: encryptSecret(secret) } });
  return { secret, otpauthUri: authenticator.keyuri(accountLabel, ISSUER, secret) };
}

/** Return the pending setup (stable across reloads) or start a new one. */
export async function getOrStartSetup(
  db: PrismaClient,
  userId: string,
  accountLabel: string,
): Promise<{ secret: string; otpauthUri: string }> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.mfaSecret && !user.mfaEnabled) {
    const secret = decryptSecret(user.mfaSecret);
    return { secret, otpauthUri: authenticator.keyuri(accountLabel, ISSUER, secret) };
  }
  return beginMfaSetup(db, userId, accountLabel);
}

/** Confirm enrollment: verify a TOTP code against the pending secret, enable
 * MFA and issue single-use recovery codes (returned once, stored hashed). */
export async function enableMfa(db: PrismaClient, userId: string, code: string): Promise<string[]> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.mfaSecret) throw new Error("No MFA setup in progress");
  const secret = decryptSecret(user.mfaSecret);
  const step = totpStep(secret, code);
  if (step === null) throw new Error("Invalid authenticator code");

  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  await db.$transaction(async (tx) => {
    // The code used to enable MFA can't be replayed at login.
    await tx.user.update({ where: { id: userId }, data: { mfaEnabled: true, mfaLastStep: step } });
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.mfaRecoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashCode(c) })) });
  });
  await logAudit(db, { actorUserId: userId, action: "mfa.enable", entityType: "User", entityId: userId });
  return codes;
}

/** Verify a second factor at login: a current TOTP code OR a single-use
 * recovery code. */
export async function verifyMfa(db: PrismaClient, userId: string, code: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.mfaEnabled || !user.mfaSecret) return false;
  const step = totpStep(decryptSecret(user.mfaSecret), code);
  if (step !== null) {
    // Each code works once: accept only a step newer than the last one used
    // (atomic, so two simultaneous logins with the same code can't both pass).
    const { count } = await db.user.updateMany({
      where: { id: userId, OR: [{ mfaLastStep: null }, { mfaLastStep: { lt: step } }] },
      data: { mfaLastStep: step },
    });
    return count === 1;
  }
  return consumeRecoveryCode(db, userId, code);
}

async function consumeRecoveryCode(db: PrismaClient, userId: string, code: string): Promise<boolean> {
  const rec = await db.mfaRecoveryCode.findUnique({ where: { codeHash: hashCode(code) } });
  if (!rec || rec.userId !== userId || rec.usedAt) return false;
  await db.mfaRecoveryCode.update({ where: { id: rec.id }, data: { usedAt: new Date() } });
  await logAudit(db, { actorUserId: userId, action: "mfa.recovery_used", entityType: "User", entityId: userId });
  return true;
}

/** Disable MFA for self, or for another user with users:manage. */
export async function disableMfa(db: PrismaClient, actor: AuthzUser, userId: string): Promise<void> {
  if (actor.id !== userId) requirePermission(actor, "users:manage");
  await db.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecret: null } });
  await db.mfaRecoveryCode.deleteMany({ where: { userId } });
  await logAudit(db, { actorUserId: actor.id, action: "mfa.disable", entityType: "User", entityId: userId });
}
