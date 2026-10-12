import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    // Revisiting a tab within a minute is instant (served from the browser's router cache).
    // Market data changes once a day, and every save (server action) or "Refresh" clears it.
    staleTimes: { dynamic: 60 },
    // Import only the Radix primitives in use from the umbrella package.
    optimizePackageImports: ["radix-ui"],
    // CSV imports travel as server-action arguments: allow the 2 MB the importer accepts
    // (the default 1 MB cut off long Trade Republic exports with an opaque error).
    serverActions: { bodySizeLimit: "3mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The service worker must never be cached by the HTTP layer.
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }] },
    ];
  },
};

export default config;
