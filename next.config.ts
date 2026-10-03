import type { NextConfig } from "next";

// 2026-10-03 (security review): baseline browser security headers. No CSP yet —
// a strict one needs testing against every page and would break inline scripts.
// HSTS is production-only so `npm run dev` on http://localhost is unaffected.
// X-Frame-Options skips /board/tv: the TV kiosk may be shown inside another page.
const baseHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: baseHeaders },
      {
        source: "/((?!board/tv).*)",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  typedRoutes: true,
  experimental: {
    // Asset uploads post files through a Server Action; the default 1MB cap
    // rejects real media. Keep this above MAX_UPLOAD_BYTES (50MB) for overhead.
    serverActions: {
      bodySizeLimit: "60mb",
    },
  },
};

export default nextConfig;
