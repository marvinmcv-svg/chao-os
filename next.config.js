/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prisma + bcryptjs must run in Node.js runtime, not Edge
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'bcryptjs'],
  },
}
