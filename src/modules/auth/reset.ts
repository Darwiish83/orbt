import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { setPassword } from "./accounts";

/**
 * Password reset tokens. The raw token is high-entropy random and is returned
 * once (to be emailed); only its SHA-256 hash is stored. Tokens are single-use
 * (usedAt) and expiring (default 1 hour).
 */
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Create a reset token for the given email. Returns the raw token when the user
 * exists, otherwise null. Callers MUST NOT reveal which case occurred to the
 * client (to avoid account enumeration) — in production the token is emailed,
 * never returned in the response.
 */
export async function createResetToken(db: PrismaClient, email: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return null;

  const raw = randomBytes(32).toString("base64url");
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });
  return raw;
}

/**
 * Short-lived set-password token for a user who has just proven control of
 * their email with a one-time code (first login, forgotten password, signup,
 * staff setup). Same storage and single-use rules as reset tokens.
 */
export async function createSetPasswordToken(db: PrismaClient, userId: string, ttlMs = 15 * 60 * 1000): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await db.passwordResetToken.create({
    data: { userId, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return raw;
}

/** The user a still-valid (unused, unexpired) token belongs to, without consuming it. */
export async function peekResetToken(db: PrismaClient, rawToken: string): Promise<string | null> {
  const token = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!token || token.usedAt || token.expiresAt.getTime() < Date.now()) return null;
  return token.userId;
}

/**
 * Consume a reset token and set the new password. Returns the user id. Validates existence,
 * expiry and single-use in one transaction. Throws on any invalid token.
 */
export async function consumeResetToken(
  db: PrismaClient,
  rawToken: string,
  newPassword: string,
): Promise<string> {
  const tokenHash = hashToken(rawToken);

  return db.$transaction(async (tx) => {
    const token = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!token || token.usedAt || token.expiresAt.getTime() < Date.now()) {
      throw new Error("Invalid or expired reset token");
    }
    // Mark used first (single-use); unique tokenHash + usedAt guard prevents reuse.
    await tx.passwordResetToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });
    await setPassword(tx as unknown as PrismaClient, token.userId, newPassword);
    return token.userId;
  });
}
