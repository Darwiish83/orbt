import { createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { AuthorizationError, ValidationError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import { hashPin, verifyPassword } from "@/modules/auth/password";
import { assertNotRateLimited, recordAttempt } from "@/modules/auth/rateLimit";
import { can, type AuthzUser } from "@/modules/authz/core";

/**
 * Accounting PIN (spec §11, owner answer Q4): one PIN per user, chosen by the
 * user, stored as an Argon2 hash. Entering it unlocks Accounting for this
 * session only: the unlock token is an HMAC over the user id, session epoch
 * and expiry, so it dies with the session or after UNLOCK_HOURS.
 */

const UNLOCK_HOURS = 8;
export const PIN_COOKIE = "orbit-acc";

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not configured");
  return s;
}

/** Only users with Accounting special access (or a super admin) get the PIN screen. */
export function requireAccountingAccess(actor: AuthzUser) {
  if (!can(actor, "accounting:read")) throw new AuthorizationError("No access to Accounting");
}

function checkPin(pin: string) {
  if (!/^\d{4,8}$/.test(pin)) throw new ValidationError("The PIN must be 4 to 8 digits");
}

export async function hasPin(db: PrismaClient, actor: AuthzUser): Promise<boolean> {
  const u = await db.user.findUnique({ where: { id: actor.id }, select: { accountingPinHash: true } });
  return !!u?.accountingPinHash;
}

/** First time: the user chooses their PIN. */
export async function setPin(db: PrismaClient, actor: AuthzUser, pin: string, confirm: string) {
  requireAccountingAccess(actor);
  checkPin(pin);
  if (pin !== confirm) throw new ValidationError("The PINs do not match");
  if (await hasPin(db, actor)) throw new ValidationError("A PIN is already set");
  await db.user.update({ where: { id: actor.id }, data: { accountingPinHash: await hashPin(pin) } });
  await logAudit(db, { actorUserId: actor.id, action: "accounting.pin_set", entityType: "User", entityId: actor.id });
}

/** Check the PIN (rate-limited) and return an unlock token for this session. */
export async function unlockWithPin(db: PrismaClient, actor: AuthzUser, pin: string): Promise<string> {
  requireAccountingAccess(actor);
  const identifier = `acc:${actor.id}`;
  await assertNotRateLimited(db, identifier, "accounting_pin");
  const u = await db.user.findUnique({ where: { id: actor.id }, select: { accountingPinHash: true } });
  if (!u?.accountingPinHash) throw new ValidationError("Set your PIN first");
  const ok = /^\d{4,8}$/.test(pin) && (await verifyPassword(u.accountingPinHash, pin));
  await recordAttempt(db, { identifier, kind: "accounting_pin", success: ok });
  if (!ok) throw new AuthorizationError("Wrong PIN");
  await logAudit(db, { actorUserId: actor.id, action: "accounting.unlock", entityType: "User", entityId: actor.id });
  return signUnlock(actor);
}

/** An admin clears a user's PIN (they choose a new one next time). */
export async function resetPin(db: PrismaClient, actor: AuthzUser, userId: string) {
  if (!actor.isSuperAdmin) throw new AuthorizationError("Only a super admin can reset a PIN");
  await db.user.update({ where: { id: userId }, data: { accountingPinHash: null } });
  await logAudit(db, { actorUserId: actor.id, action: "accounting.pin_reset", entityType: "User", entityId: userId });
}

function mac(payload: string) {
  return createHmac("sha256", secret()).update(`acc-unlock:${payload}`).digest("base64url");
}

export function signUnlock(actor: AuthzUser, now = Date.now()): string {
  const payload = `${actor.id}.${actor.sessionEpoch}.${now + UNLOCK_HOURS * 3600_000}`;
  return `${payload}.${mac(payload)}`;
}

export function verifyUnlock(actor: AuthzUser, token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const sig = Buffer.from(token.slice(i + 1));
  const want = Buffer.from(mac(payload));
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return false;
  const [uid, epoch, exp] = payload.split(".");
  return uid === actor.id && Number(epoch) === actor.sessionEpoch && Number(exp) > now;
}
