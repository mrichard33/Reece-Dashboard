import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
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
