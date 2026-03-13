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
};

export default nextConfig;
