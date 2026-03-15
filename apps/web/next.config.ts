import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@meeting-coach/shared'],

  // Proxy /api/* requests to backend server
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://server:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },

  async headers() {
    return [
      {
        // WASM files need correct MIME type
        source: '/wasm/:path*.wasm',
        headers: [
          { key: 'Content-Type', value: 'application/wasm' },
        ],
      },
      {
        // COOP/COEP headers needed for SharedArrayBuffer (WASM threading)
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

export default nextConfig;
