import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/db/client";
import { verifyCustomerLogin, verifyStaffLogin } from "@/modules/auth/accounts";
import { verifyMfa } from "@/modules/auth/mfa";
import { assertNotRateLimited, recordAttempt } from "@/modules/auth/rateLimit";

/**
 * Two sign-in forms (ADR-016), one Credentials provider:
 *  - customer: Customer Reference + password
 *  - staff:    Employee ID + email ("Gmail") + password (+ TOTP when MFA is on)
 * Rate limiting is per Reference / Employee ID.
 */
const credentialsSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("customer"),
    reference: z.string().trim().min(1).max(32),
    password: z.string().min(1).max(256),
  }),
  z.object({
    kind: z.literal("staff"),
    employeeId: z.string().trim().min(1).max(32),
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(256),
    code: z.string().max(32).optional(),
  }),
]);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { kind: {}, reference: {}, employeeId: {}, email: {}, password: {}, code: {} },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const c = parsed.data;
        const identifier = (c.kind === "customer" ? c.reference : c.employeeId).toLowerCase();

        // Abuse protection: block after too many recent failures (throws).
        await assertNotRateLimited(prisma, identifier, "login");

        const user =
          c.kind === "customer"
            ? await verifyCustomerLogin(prisma, c.reference, c.password)
            : await verifyStaffLogin(prisma, c.employeeId, c.email, c.password);
        await recordAttempt(prisma, { identifier, kind: "login", success: !!user });
        if (!user) return null;

        // Second factor: when MFA is enabled, a valid TOTP or recovery code is required.
        if (user.mfaEnabled) {
          const code = c.kind === "staff" ? c.code : undefined;
          if (!code || !(await verifyMfa(prisma, user.id, code))) return null;
        }

        // Users & Team → "Last Login".
        await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        return { id: user.id, email: user.email, sessionEpoch: user.sessionEpoch };
      },
    }),
  ],
});
