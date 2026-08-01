import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  async redirects() {
    // Hard redirects — old project routes → active mobile app.
    // These fire at the CDN level, before any page code runs.
    // Permanent (308) so browsers and caches learn the new location.
    return [
      { source: "/dashboard",          destination: "/m/today", permanent: false },
      { source: "/dashboard/:path*",   destination: "/m/today", permanent: false },
    ];
  },
};

export default nextConfig;
