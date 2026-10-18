import "server-only";
import { auth } from "@/auth";
import { prisma } from "@/db/client";
import { AuthenticationError } from "@/lib/errors";
import { loadAuthzUser, type AuthzUser } from "./core";

/**
 * Resolve the authenticated user for the current request and re-check it
 * against the database: the account must still exist, be ACTIVE, and its
 * sessionEpoch must match the token's. This makes JWT sessions revocable —
 * a password reset or forced logout (which bump sessionEpoch) invalidates all
 * outstanding tokens immediately (ADR-005).
 */
export async function getSessionUser(): Promise<AuthzUser | null> {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return null;

  const user = await loadAuthzUser(prisma, uid);
  if (!user) return null;

  const tokenEpoch = session.epoch;
  if (typeof tokenEpoch === "number" && tokenEpoch !== user.sessionEpoch) {
    return null; // token issued before the latest invalidation
  }
  return user;
}

export async function requireUser(): Promise<AuthzUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthenticationError();
  return user;
}
