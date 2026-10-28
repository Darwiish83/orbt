import type { PrismaClient } from "@prisma/client";
import { RateLimitError } from "@/lib/errors";
import { assertNotRateLimited, recordAttempt } from "./rateLimit";

/**
 * Login hardening for ID + email + password (ADR-028: no second factor, so
 * these layers carry the weight). Every limit answers with the same generic
 * failure, so an attacker can't tell which one stopped them.
 *
 *  1. Per ID (Employee ID / Customer Reference): 5 failures / 15 min.
 *  2. Per email: 5 failures / 15 min (one email tried against many IDs).
 *  3. Per IP address: 20 failures / 15 min (spraying many accounts).
 *  4. Account lockout: 10 failures within an hour locks that account for
 *     30 minutes, whoever is trying and from wherever (User.lockedUntil).
 */
export const IP_WINDOW_MS = 15 * 60 * 1000;
export const IP_MAX_FAILURES = 20;
export const LOCK_WINDOW_MS = 60 * 60 * 1000;
export const LOCK_AFTER_FAILURES = 10;
export const LOCK_DURATION_MS = 30 * 60 * 1000;

export interface LoginTarget {
  /** Employee ID or Customer Reference, as typed. */
  id: string;
  email: string;
  ip: string | null;
}

const lc = (v: string) => v.trim().toLowerCase();

/** First address in X-Forwarded-For / X-Real-IP (set by the reverse proxy in production). */
export function clientIp(headers: Headers | undefined | null): string | null {
  const fwd = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || headers?.get("x-real-ip")?.trim();
  return ip && ip.length <= 64 ? ip : null;
}

/** Throws RateLimitError if the ID, the email or the IP is over its limit. */
export async function assertLoginAllowed(db: PrismaClient, t: LoginTarget): Promise<void> {
  await assertNotRateLimited(db, lc(t.id), "login");
  await assertNotRateLimited(db, lc(t.email), "login");
  if (t.ip) {
    const failures = await db.loginAttempt.count({
      where: { ip: t.ip, kind: "login", success: false, createdAt: { gte: new Date(Date.now() - IP_WINDOW_MS) } },
    });
    if (failures >= IP_MAX_FAILURES) throw new RateLimitError();
  }
}

/** True while the account is locked out. */
export function isLocked(user: { lockedUntil: Date | null } | null | undefined): boolean {
  return !!user?.lockedUntil && user.lockedUntil.getTime() > Date.now();
}

/**
 * Record the outcome under both the ID and the email. On failure, lock the
 * account the ID points to once it reaches LOCK_AFTER_FAILURES in the last
 * hour. `targetUserId` is the account the ID belongs to (if any), found
 * independently of whether the password was right.
 */
export async function recordLoginOutcome(
  db: PrismaClient,
  t: LoginTarget,
  ok: boolean,
  targetUserId: string | null,
): Promise<void> {
  await recordAttempt(db, { identifier: lc(t.id), ip: t.ip, kind: "login", success: ok });
  await recordAttempt(db, { identifier: lc(t.email), ip: t.ip, kind: "login", success: ok });
  if (ok || !targetUserId) return;

  const failures = await db.loginAttempt.count({
    where: { identifier: lc(t.id), kind: "login", success: false, createdAt: { gte: new Date(Date.now() - LOCK_WINDOW_MS) } },
  });
  if (failures >= LOCK_AFTER_FAILURES) {
    await db.user.update({ where: { id: targetUserId }, data: { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) } });
  }
}

/** The account an ID refers to (Employee ID → staff user, Reference → customer's user). */
export async function loginTargetUserId(db: PrismaClient, kind: "staff" | "customer", id: string): Promise<string | null> {
  const code = id.trim().toUpperCase();
  if (kind === "staff") {
    const e = await db.employee.findFirst({ where: { code: { equals: code, mode: "insensitive" } }, select: { user: { select: { id: true } } } });
    return e?.user?.id ?? null;
  }
  const c = await db.customer.findFirst({ where: { ref: { equals: code, mode: "insensitive" } }, select: { user: { select: { id: true } } } });
  return c?.user?.id ?? null;
}
