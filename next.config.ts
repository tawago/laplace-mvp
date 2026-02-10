import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  webpack: (config, { isServer }) => {
    // Fix for xrpl.js WebSocket buffer issues in Next.js
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        bufferutil: 'bufferutil',
        'utf-8-validate': 'utf-8-validate',
      });
    }
    return config;
  },
  // Suppress WebSocket warnings in server components
  serverExternalPackages: ['xrpl'],
};

export default nextConfig;
