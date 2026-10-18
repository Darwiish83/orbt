import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/db/client";
import { verifyCredentials } from "@/modules/auth/accounts";
import { verifyMfa } from "@/modules/auth/mfa";
import { assertNotRateLimited, recordAttempt } from "@/modules/auth/rateLimit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  code: z.string().optional(),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, code: {} },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, code } = parsed.data;

        // Abuse protection: block after too many recent failures (throws).
        await assertNotRateLimited(prisma, email, "login");

        const user = await verifyCredentials(prisma, email, password);
        await recordAttempt(prisma, { identifier: email, kind: "login", success: !!user });
        if (!user) return null;

        // Second factor: when MFA is enabled, a valid TOTP or recovery code is
        // required to complete sign-in.
        if (user.mfaEnabled) {
          if (!code || !(await verifyMfa(prisma, user.id, code))) return null;
        }

        return { id: user.id, email: user.email, sessionEpoch: user.sessionEpoch };
      },
    }),
  ],
});
