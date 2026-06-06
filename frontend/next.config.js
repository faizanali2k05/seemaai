/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  transpilePackages: ['recharts', 'recharts-scale', 'd3-scale', 'd3-shape', 'd3-path', 'd3-time-format', 'd3-interpolate', 'd3-color', 'd3-format', 'd3-array', 'd3-time'],
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // In production, Nginx routes /api/* to the API container.
  // In development, proxy API calls to localhost:8000.
  ...(process.env.NODE_ENV !== 'production' && {
    rewrites: async () => ({
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'}/:path*`,
        },
      ],
    }),
  }),
};

module.exports = nextConfig;
