/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV === 'production') {
      return [];
    }

    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:5001/api/:path*',
      },
      {
        source: '/uploads/:path*',
        destination: 'http://localhost:5001/uploads/:path*',
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '5001',
      },
      {
        protocol: 'https',
        hostname: 'trailverse.onrender.com',
      },
      {
        protocol: 'https',
        hostname: '*.nps.gov',
      },
    ],
  },
};

export default nextConfig;
