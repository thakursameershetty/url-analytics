import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Analytics lives on one page now; keep old per-link URLs working.
  async redirects() {
    return [
      { source: "/analytics/all", destination: "/analytics", permanent: false },
      { source: "/analytics/:slug", destination: "/analytics?links=:slug", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
