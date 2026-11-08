import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/db/client";
import { authenticate, clientIp } from "@/modules/auth/loginGuard";

/**
 * One sign-in page (ADR-021), one Credentials provider, three fields for
 * everyone (ADR-028 — no second factor):
 *  - customer: Customer Reference + email ("Gmail") + password
 *  - staff:    Employee ID + email ("Gmail") + password
 * All three must belong to the same active account. Hardening lives in
 * modules/auth/loginGuard.ts (authenticate): limits per ID and per email from
 * each IP, and per IP overall; no account-wide lockout (M3). Every failure
 * looks the same to the caller.
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
        // Throws RateLimitError when this IP is over a limit; null for any wrong detail.
        const user = await authenticate(prisma, parsed.data, clientIp(request?.headers));
        if (!user) return null;
        return { id: user.id, email: user.email, sessionEpoch: user.sessionEpoch };
      },
    }),
  ],
});
