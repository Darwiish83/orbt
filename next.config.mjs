/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets a second dev server (the design-parity suite) run beside the main one
  // without sharing the build cache.
  distDir: process.env.NEXT_DIST_DIR || ".next",
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
      // Announcement images are capped at 2 MB by the service.
      bodySizeLimit: "3mb",
      allowedOrigins: ["localhost:3100", "*.trycloudflare.com"],
    },
  },
};

export default nextConfig;
