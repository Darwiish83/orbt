import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { OtpCode, OtpPurpose, Prisma, PrismaClient } from "@prisma/client";
import { RateLimitError, ValidationError } from "@/lib/errors";

/**
 * Emailed one-time codes (ADR-016). 6 random digits; only an HMAC (keyed with
 * AUTH_SECRET, bound to the row id) is stored. A code expires after 10
 * minutes, is single-use, and is burned after 5 tries. Issuing a new code
 * retires older ones for the same email + purpose.
 *
 * Sending limits, all enforced under PostgreSQL transaction locks so that
 * simultaneous requests can't slip past them:
 *  - per email + purpose: 5 codes / 15 min;
 *  - per client IP: OTP_IP_MAX_PER_15MIN code requests / 15 min (default 10),
 *    counted whether or not the details matched;
 *  - all code emails together: OTP_EMAIL_HOURLY_CAP per hour (default 60).
 */
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const SEND_LIMIT = 5;
export const OTP_IP_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
/**
 * Default hourly cap on all code emails: one a minute on average. Normal use
 * (first logins, forgotten passwords, sign-ups) is far below that, while a
 * flood can burn at most ~1,440 emails a day instead of the whole Resend quota.
 * Raise it with OTP_EMAIL_HOURLY_CAP for a planned onboarding day.
 */
export const DEFAULT_OTP_EMAIL_HOURLY_CAP = 60;
/**
 * Default per-IP cap on code requests: generous for one person retrying, low
 * enough that one address can't spray codes at many inboxes. Shared mobile
 * networks put many people behind one address; raise OTP_IP_MAX_PER_15MIN if
 * that blocks real users.
 */
export const DEFAULT_OTP_IP_MAX_PER_15MIN = 10;

// Limits wait on a lock; give them room before Prisma gives up on the transaction.
const LOCKED_TX = { maxWait: 15_000, timeout: 20_000 };

/** Delivers a code. Production sends email; tests inject a capturing fake. */
export type OtpSender = (to: string, code: string, purpose: OtpPurpose) => Promise<void>;

/** The hourly cap on all code emails was reached (callers decide what the user sees). */
export class OtpEmailCapError extends RateLimitError {
  constructor() {
    super();
    this.name = "OtpEmailCapError";
  }
}

function intFromEnv(name: string, fallback: number, max: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : fallback;
}
export const otpEmailHourlyCap = () => intFromEnv("OTP_EMAIL_HOURLY_CAP", DEFAULT_OTP_EMAIL_HOURLY_CAP, 100_000);
export const otpIpMaxPer15Min = () => intFromEnv("OTP_IP_MAX_PER_15MIN", DEFAULT_OTP_IP_MAX_PER_15MIN, 10_000);

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not configured");
  return s;
}

function hmac(id: string, code: string): string {
  return createHmac("sha256", secret()).update(`otp:${id}:${code}`).digest("hex");
}

/**
 * Count one code request from this client IP, refusing it once the IP is over
 * its limit. Call it for every well-formed request, before checking whether
 * the details match, so the answer never depends on whether an account exists.
 * Without a trusted client IP (no proxy configured) there is nothing to count.
 */
export async function reserveOtpRequest(db: PrismaClient, ip: string | null | undefined): Promise<void> {
  if (!ip) return;
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`otp-ip:${ip}`}))`;
    const recent = await tx.loginAttempt.count({
      where: { ip, kind: "otp_request", createdAt: { gte: new Date(Date.now() - OTP_IP_WINDOW_MS) } },
    });
    if (recent >= otpIpMaxPer15Min()) throw new RateLimitError();
    await tx.loginAttempt.create({ data: { identifier: `ip:${ip}`, ip, kind: "otp_request", success: true } });
  }, LOCKED_TX);
}

export async function issueOtp(
  db: PrismaClient,
  input: { purpose: OtpPurpose; email: string; userId?: string | null; payload?: Prisma.InputJsonValue },
): Promise<{ id: string; code: string }> {
  const email = input.email.trim().toLowerCase();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return db.$transaction(async (tx) => {
    // One issuer at a time: the per-email and hourly counts below can't race.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('otp-issue'))`;
    const recent = await tx.otpCode.count({
      where: { email, purpose: input.purpose, createdAt: { gt: new Date(Date.now() - SEND_WINDOW_MS) } },
    });
    if (recent >= SEND_LIMIT) throw new RateLimitError();
    const lastHour = await tx.otpCode.count({ where: { createdAt: { gt: new Date(Date.now() - GLOBAL_WINDOW_MS) } } });
    if (lastHour >= otpEmailHourlyCap()) throw new OtpEmailCapError();

    await tx.otpCode.updateMany({
      where: { email, purpose: input.purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const row = await tx.otpCode.create({
      data: {
        purpose: input.purpose,
        email,
        userId: input.userId ?? null,
        payload: input.payload,
        codeHash: "pending",
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    await tx.otpCode.update({ where: { id: row.id }, data: { codeHash: hmac(row.id, code) } });
    return { id: row.id, code };
  }, LOCKED_TX);
}

const INVALID = "Invalid or expired code";

/**
 * Check a code against the latest live code for this email + purpose and
 * consume it. Every failure (none issued, expired, used, locked, wrong) gives
 * the same message.
 *
 * Each try first reserves one of the OTP_MAX_ATTEMPTS attempts with a single
 * conditional UPDATE; only a try that got a reservation is compared. So no
 * number of simultaneous guesses can check more than OTP_MAX_ATTEMPTS codes.
 */
export async function verifyOtp(
  db: PrismaClient,
  input: { purpose: OtpPurpose; email: string; code: string },
): Promise<OtpCode> {
  const email = input.email.trim().toLowerCase();
  const code = input.code.trim();
  const row = await db.otpCode.findFirst({
    where: { email, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row || !/^\d{6}$/.test(code)) throw new ValidationError(INVALID);

  const reserved = await db.otpCode.updateMany({
    where: { id: row.id, consumedAt: null, attempts: { lt: OTP_MAX_ATTEMPTS }, expiresAt: { gt: new Date() } },
    data: { attempts: { increment: 1 } },
  });
  if (reserved.count !== 1) throw new ValidationError(INVALID);

  const a = Buffer.from(row.codeHash, "hex");
  const b = Buffer.from(hmac(row.id, code), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ValidationError(INVALID);

  // Consume atomically: a concurrent verify of the same code loses the race.
  const { count } = await db.otpCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (count !== 1) throw new ValidationError(INVALID);
  return row;
}
