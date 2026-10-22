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
export type AttemptKind = "login" | "reset" | "otp";

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

export async function recentFailureCount(
  db: PrismaClient,
  identifier: string,
  kind: AttemptKind,
): Promise<number> {
  const since = new Date(Date.now() - WINDOW_MS);
  return db.loginAttempt.count({
    where: {
      identifier: identifier.toLowerCase(),
      kind,
      success: false,
      createdAt: { gte: since },
    },
  });
}

/** Throws RateLimitError if the identifier has too many recent failures. */
export async function assertNotRateLimited(
  db: PrismaClient,
  identifier: string,
  kind: AttemptKind,
): Promise<void> {
  const failures = await recentFailureCount(db, identifier, kind);
  if (failures >= MAX_FAILURES) {
    throw new RateLimitError();
  }
}

export const RATE_LIMIT = { WINDOW_MS, MAX_FAILURES } as const;
