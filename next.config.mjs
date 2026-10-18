/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Hardening (Phase 8): don't advertise the framework, don't ship browser
  // source maps to production (avoids leaking source), CSP + security headers
  // are set per-request in middleware.ts (nonce-based).
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  // Minimal, self-contained production server for containerized deploys.
  output: "standalone",
  experimental: {
    // Allow Server Actions when the app is reached via a Cloudflare quick
    // tunnel (dev sharing) in addition to the local origin.
    serverActions: {
      allowedOrigins: ["localhost:3100", "*.trycloudflare.com"],
    },
  },
};

export default nextConfig;
