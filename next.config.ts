import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  // Enable Turbopack (default in Next.js 16)
  turbopack: {},
  // Suppress WebSocket warnings in server components
  serverExternalPackages: ['xrpl'],
};

export default nextConfig;
