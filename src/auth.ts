import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/db/client";
import { verifyCustomerLogin, verifyStaffLogin } from "@/modules/auth/accounts";
import { assertLoginAllowed, clientIp, isLocked, loginTargetUserId, recordLoginOutcome } from "@/modules/auth/loginGuard";

/**
 * One sign-in page (ADR-021), one Credentials provider, three fields for
 * everyone (ADR-028 — no second factor):
 *  - customer: Customer Reference + email ("Gmail") + password
 *  - staff:    Employee ID + email ("Gmail") + password
 * All three must belong to the same active account. Hardening lives in
 * modules/auth/loginGuard.ts: limits per ID, per email and per IP, plus an
 * account lockout. Every failure looks the same to the caller.
 */
const credentialsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("customer"),
    reference: z.string().trim().min(1).max(32),
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(256),
  }),
  z.object({
    kind: z.literal("staff"),
    employeeId: z.string().trim().min(1).max(32),
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(256),
  }),
]);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { kind: {}, reference: {}, employeeId: {}, email: {}, password: {} },
      authorize: async (raw, request) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const c = parsed.data;
        const target = {
          id: c.kind === "customer" ? c.reference : c.employeeId,
          email: c.email,
          ip: clientIp(request?.headers),
        };

        // Too many recent failures for this ID, email or IP → refuse (throws).
        await assertLoginAllowed(prisma, target);

        const found =
          c.kind === "customer"
            ? await verifyCustomerLogin(prisma, c.reference, c.email, c.password)
            : await verifyStaffLogin(prisma, c.employeeId, c.email, c.password);
        // A locked account stays shut even with the right password.
        const user = found && !isLocked(found) ? found : null;

        await recordLoginOutcome(prisma, target, !!user, user ? user.id : await loginTargetUserId(prisma, c.kind, target.id));
        if (!user) return null;

        // Users & Team → "Last Login"; a successful login clears any lock.
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lockedUntil: null } });
        return { id: user.id, email: user.email, sessionEpoch: user.sessionEpoch };
      },
    }),
  ],
});
