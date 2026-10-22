import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { OtpCode, OtpPurpose, Prisma, PrismaClient } from "@prisma/client";
import { RateLimitError, ValidationError } from "@/lib/errors";

/**
 * Emailed one-time codes (ADR-016). 6 random digits; only an HMAC (keyed with
 * AUTH_SECRET, bound to the row id) is stored. A code expires after 10
 * minutes, is single-use, and is burned after 5 wrong tries. Issuing a new
 * code retires older ones for the same email + purpose. At most 5 codes per
 * email + purpose per 15 minutes.
 */
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const SEND_LIMIT = 5;

/** Delivers a code. Production sends email; tests inject a capturing fake. */
export type OtpSender = (to: string, code: string, purpose: OtpPurpose) => Promise<void>;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not configured");
  return s;
}

function hmac(id: string, code: string): string {
  return createHmac("sha256", secret()).update(`otp:${id}:${code}`).digest("hex");
}

export async function issueOtp(
  db: PrismaClient,
  input: { purpose: OtpPurpose; email: string; userId?: string | null; payload?: Prisma.InputJsonValue },
): Promise<{ id: string; code: string }> {
  const email = input.email.trim().toLowerCase();
  const recent = await db.otpCode.count({
    where: { email, purpose: input.purpose, createdAt: { gt: new Date(Date.now() - SEND_WINDOW_MS) } },
  });
  if (recent >= SEND_LIMIT) throw new RateLimitError();

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return db.$transaction(async (tx) => {
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
  });
}

const INVALID = "Invalid or expired code";

/**
 * Check a code against the latest live code for this email + purpose and
 * consume it. Every failure (none issued, expired, used, locked, wrong) gives
 * the same message. A wrong code counts towards the lockout.
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
  if (!row || row.expiresAt.getTime() < Date.now() || row.attempts >= OTP_MAX_ATTEMPTS || !/^\d{6}$/.test(code)) {
    if (row && /^\d{6}$/.test(code)) await db.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw new ValidationError(INVALID);
  }

  const a = Buffer.from(row.codeHash, "hex");
  const b = Buffer.from(hmac(row.id, code), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    await db.otpCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw new ValidationError(INVALID);
  }

  // Consume atomically: a concurrent verify of the same code loses the race.
  const { count } = await db.otpCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (count !== 1) throw new ValidationError(INVALID);
  return row;
}
