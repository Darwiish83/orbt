import type { PrismaClient } from "@prisma/client";
import { RateLimitError } from "@/lib/errors";

/**
 * Durable, DB-backed attempt tracking for login/reset abuse protection.
 * Counts recent FAILED attempts per identifier within a sliding window.
 *
 * NOTE: for multi-instance production this is adequate (shared DB) but a
 * dedicated rate-limit store (e.g. Redis) may be preferred under high load —
 * tracked for Phase 9.
 */
export type AttemptKind = "login" | "reset" | "otp" | "accounting_pin" | "password_change";
// "otp_request" rows (one per code request, by client IP) are written by
// reserveOtpRequest in ./otp.ts.

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES = 5;

export async function recordAttempt(
  db: PrismaClient,
  params: { identifier: string; ip?: string | null; kind: AttemptKind; success: boolean },
): Promise<void> {
  await db.loginAttempt.create({
    data: {
      identifier: params.identifier.toLowerCase(),
      ip: params.ip ?? null,
      kind: params.kind,
      success: params.success,
    },
  });
}

/**
 * Recent failures for an identifier. With `ip` (a client address, or null for
 * requests without one) only failures from that address count: limits on
 * identifiers that strangers can type (login IDs, emails) must be per IP, or
 * anyone could block the real person (security finding M3). Without `ip`, all
 * failures count — for identifiers only their owner can use (a signed-in
 * user's PIN or password change).
 */
export async function recentFailureCount(
  db: PrismaClient,
  identifier: string,
  kind: AttemptKind,
  ip?: string | null,
): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MS);
  return db.loginAttempt.count({
    where: {
      identifier: identifier.toLowerCase(),
      kind,
      success: false,
      createdAt: { gte: since },
      ...(ip === undefined ? {} : { ip }),
    },
  });
}

/** Throws RateLimitError if the identifier has too many recent failures (from `ip`, when given). */
export async function assertNotRateLimited(
  db: PrismaClient,
  identifier: string,
  kind: AttemptKind,
  ip?: string | null,
): Promise<void> {
  const failures = await recentFailureCount(db, identifier, kind, ip);
  if (failures >= MAX_FAILURES) {
    throw new RateLimitError();
  }
}

export const RATE_LIMIT = { WINDOW_MS, MAX_FAILURES } as const;
