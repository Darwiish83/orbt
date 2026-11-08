import { serverActionAllowedOrigins } from "./src/lib/serverActionOrigins.mjs";

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
    serverActions: {
      // Announcement images are capped at 2 MB by the service.
      bodySizeLimit: "3mb",
      // Production: same-origin only. Development also allows the second dev
      // server and Cloudflare quick tunnels (src/lib/serverActionOrigins.mjs).
      allowedOrigins: serverActionAllowedOrigins(),
    },
  },
};

export default nextConfig;
