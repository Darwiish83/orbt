/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hardening (Phase 8): don't advertise the framework, don't ship browser
  // source maps to production (avoids leaking source), CSP + security headers
  // are set per-request in middleware.ts (nonce-based).
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
};

export default nextConfig;
