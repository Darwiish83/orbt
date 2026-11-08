import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { setPassword } from "./accounts";

/**
 * Set-password tokens. The raw token is high-entropy random and is returned
 * once; only its SHA-256 hash is stored. Tokens are single-use (usedAt) and
 * short-lived. They are only issued after the person proved control of their
 * email with a one-time code, or by scripts/make-super-admin.ts: the old
 * "email me a reset link" flow was removed (it issued tokens for any account,
 * suspended ones included, and skipped the password rules).
 */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Short-lived set-password token for a user who has just proven control of
 * their email with a one-time code (first login, forgotten password, signup,
 * staff setup), or for the owner's first password (make-super-admin --link).
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
 * Consume a set-password token and set the new password. Returns the user id. Validates existence,
 * expiry and single-use in one transaction. Throws on any invalid token.
 *
 * A suspended account (or a suspended customer / inactive employee) is refused and the
 * token is left unused: setting a password activates the account, so a token issued
 * before a suspension must never undo it.
 */
export async function consumeResetToken(
  db: PrismaClient,
  rawToken: string,
  newPassword: string,
): Promise<string> {
  const tokenHash = hashToken(rawToken);

  return db.$transaction(async (tx) => {
    const token = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { status: true, customer: { select: { status: true } }, employee: { select: { active: true } } } } },
    });
    if (!token || token.usedAt || token.expiresAt.getTime() < Date.now()) {
      throw new Error("Invalid or expired reset token");
    }
    const { user } = token;
    if (user.status === "SUSPENDED" || (user.customer && user.customer.status !== "ACTIVE") || (user.employee && !user.employee.active)) {
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
