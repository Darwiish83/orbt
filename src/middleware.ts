import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// Route prefixes that require authentication (coarse gate; object-level authz
// lives in services). Mirrors auth.config.ts.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/customers",
  "/shipments",
  "/operations",
  "/finance",
  "/transfer",
  "/shipment-cost",
  "/documents",
  "/reports",
  "/users",
  "/notifications",
  "/settings",
  "/account",
  "/print",
  "/accounting",
];

function buildCsp(nonce: string, isDev: boolean): string {
  return [
    `default-src 'self'`,
    // 'strict-dynamic' + nonce for scripts; 'unsafe-inline' is ignored by
    // browsers that honor the nonce (kept only as a legacy fallback). Dev needs
    // 'unsafe-eval' for React Refresh.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used throughout the ported design system.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join("; ");
}

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user;
  const isProtected = PROTECTED_PREFIXES.some((p) => nextUrl.pathname.startsWith(p));
  const isDev = process.env.NODE_ENV !== "production";

  const nonce = crypto.randomUUID();
  const csp = buildCsp(nonce, isDev);

  // Pass the nonce + CSP down so Next can nonce its own scripts during render.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response =
    isProtected && !isLoggedIn
      ? // Staff and customers sign in on the same page (ADR-021).
        NextResponse.redirect(new URL("/login", nextUrl.origin))
      : NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (!isDev) {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  return response;
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|brand|flags|banks).*)"],
};
