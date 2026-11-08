import { isIP } from "node:net";
import type { PrismaClient, User } from "@prisma/client";
import { RateLimitError } from "@/lib/errors";
import { logAudit } from "@/modules/audit/log";
import { verifyCustomerLogin, verifyStaffLogin } from "./accounts";
import { assertNotRateLimited, RATE_LIMIT, recentFailureCount, recordAttempt } from "./rateLimit";

/**
 * Login hardening for ID + email + password (ADR-028: no second factor, so
 * these layers carry the weight). Every limit answers with the same generic
 * failure, so an attacker can't tell which one stopped them.
 *
 * Failures are throttled per client IP, never account-wide (security finding
 * M3): knowing someone's Employee ID, Customer Reference or email must not let
 * anyone shut them out. IDs are predictable (EMP-001…, OR-3000…).
 *
 *  1. Per ID typed (Employee ID / Customer Reference), from one IP:
 *     5 failures / 15 min.
 *  2. Per email typed, from one IP: 5 failures / 15 min.
 *  3. Per IP, whatever accounts it tries: 20 failures / 15 min (spraying).
 *
 * Over a limit, that IP gets the generic refusal even with the right password
 * (so it can't keep guessing); every other IP signs in normally. There is no
 * account lockout. Every attempt stays in LoginAttempt (ID, email, IP,
 * outcome), and when an IP reaches the limit for a real account an
 * `auth.login_throttled` audit event is written. Client IPs come from our
 * trusted proxy only (clientIp); without one (local development) all requests
 * share one bucket per ID and per email.
 */
export const ID_WINDOW_MS = RATE_LIMIT.WINDOW_MS;
export const ID_MAX_FAILURES = RATE_LIMIT.MAX_FAILURES;
export const IP_WINDOW_MS = 15 * 60 * 1000;
export const IP_MAX_FAILURES = 20;

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

/** Throws RateLimitError if this IP is over its limit for the ID, the email, or overall. */
export async function assertLoginAllowed(db: PrismaClient, t: LoginTarget): Promise<void> {
  if (t.ip) {
    const failures = await db.loginAttempt.count({
      where: { ip: t.ip, kind: "login", success: false, createdAt: { gte: new Date(Date.now() - IP_WINDOW_MS) } },
    });
    if (failures >= IP_MAX_FAILURES) throw new RateLimitError();
  }
  await assertNotRateLimited(db, lc(t.id), "login", t.ip);
  await assertNotRateLimited(db, lc(t.email), "login", t.ip);
}

/**
 * Record the outcome under both the ID and the email, with the IP. Nothing is
 * locked: when this IP reaches the limit for a real account (`targetUserId`,
 * found independently of whether the password was right), an audit event
 * records it once.
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

  if ((await recentFailureCount(db, lc(t.id), "login", t.ip)) === ID_MAX_FAILURES) {
    await logAudit(db, { actorUserId: null, action: "auth.login_throttled", entityType: "User", entityId: targetUserId, metadata: { ip: t.ip } });
  }
}

export type LoginCredentials =
  | { kind: "customer"; reference: string; email: string; password: string }
  | { kind: "staff"; employeeId: string; email: string; password: string };

/**
 * The whole sign-in check, exactly as Auth.js runs it (src/auth.ts): limits for
 * this IP, then the three fields, then the record. Returns the user, or null
 * for any wrong detail; throws RateLimitError when this IP is over a limit.
 */
export async function authenticate(db: PrismaClient, c: LoginCredentials, ip: string | null): Promise<User | null> {
  const target = { id: c.kind === "customer" ? c.reference : c.employeeId, email: c.email, ip };
  await assertLoginAllowed(db, target);
  const user =
    c.kind === "customer"
      ? await verifyCustomerLogin(db, c.reference, c.email, c.password)
      : await verifyStaffLogin(db, c.employeeId, c.email, c.password);
  await recordLoginOutcome(db, target, !!user, user ? user.id : await loginTargetUserId(db, c.kind, target.id));
  if (!user) return null;
  // Users & Team → "Last Login". lockedUntil is no longer set anywhere; clear any
  // value left by the old account lockout.
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lockedUntil: null } });
  return user;
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
