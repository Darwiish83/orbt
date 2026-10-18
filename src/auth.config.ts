import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config (no Prisma / Node-only imports). Shared by the
 * middleware and the full server config. The Credentials provider is added in
 * auth.ts (Node runtime).
 */

// Route prefixes that require authentication. Coarse gating only — object-level
// authorization is enforced in server components / actions / services.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/customers",
  "/shipments",
  "/operations",
  "/finance",
  "/documents",
  "/reports",
  "/users",
  "/notifications",
  "/settings",
  "/account",
];

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8h
  trustHost: true,
  providers: [], // added in auth.ts
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtected = PROTECTED_PREFIXES.some((p) => nextUrl.pathname.startsWith(p));
      if (isProtected && !isLoggedIn) return false; // → redirect to signIn
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.epoch = user.sessionEpoch ?? 0;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      if (typeof token.epoch === "number") session.epoch = token.epoch;
      return session;
    },
  },
} satisfies NextAuthConfig;
