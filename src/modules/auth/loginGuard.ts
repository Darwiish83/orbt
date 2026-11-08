import { isIP } from "node:net";
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
 *  3. Per IP address: 20 failures / 15 min (spraying many accounts), using
 *     the address from our trusted proxy only (clientIp).
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

/**
 * How many reverse proxies we run in front of the app (TRUSTED_PROXY_HOPS).
 * 0 (the default) means none is trusted. Production requires 1 or more
 * (src/lib/envSchema.ts): the VPS runs Caddy/Nginx in front of Next.js.
 */
export function trustedProxyHops(raw: string | undefined = process.env.TRUSTED_PROXY_HOPS): number {
  const n = Number(raw ?? 0);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0;
}

/**
 * The client's address as our own proxy saw it. Everything a client sends in
 * X-Forwarded-For is under its control except the entries our proxies add on
 * the right, so only the entry `hops` places from the right is used (the proxy
 * must append or overwrite it). With no trusted proxy, the headers are ignored
 * and null is returned: callers then skip per-IP limits rather than trust a
 * forged address. X-Real-IP is never trusted. Next.js only fills
 * X-Forwarded-For when it is missing, so it never shifts these positions.
 */
export function clientIp(headers: Headers | undefined | null, hops: number = trustedProxyHops()): string | null {
  if (!headers || hops < 1) return null;
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (chain.length < hops) return null;
  const ip = chain[chain.length - hops]!;
  return isIP(ip) ? ip : null;
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
