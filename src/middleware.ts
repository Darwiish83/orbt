import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Edge middleware using only the edge-safe config (no Prisma). Enforces the
// coarse "must be logged in" gate; fine-grained authorization lives in services.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Run on everything except static assets and the Auth.js API routes.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|brand).*)"],
};
