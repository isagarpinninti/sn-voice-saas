import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Using custom server.ts for WebSocket support — no standalone output needed
  async headers() {
    return [
      {
        source: '/widget.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
    ]
  },
};

export default nextConfig;
