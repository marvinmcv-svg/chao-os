/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prisma + @node-rs/bcrypt must run in Node.js runtime, not Edge
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', '@node-rs/bcrypt'],
  },
}
