/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // External packages that should not be bundled for server components (Next.js 14)
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs', 'prisma'],
  },
  images: {
    domains: ['localhost'],
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
  },
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
};

module.exports = nextConfig;
