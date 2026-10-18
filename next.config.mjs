/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Phase 1: no remote images wired yet. Remote image patterns + CSP are configured in Phase 8.
  experimental: {
    // typedRoutes can be enabled once routes stabilize.
  },
};

export default nextConfig;
