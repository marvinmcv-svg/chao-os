import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // DATABASE_URL wins when set; otherwise use the Neon integration's
    // Prisma-tuned pooled URL (Vercel's Neon integration was connected with
    // the NEON_ prefix because an empty DATABASE_URL already existed).
    datasourceUrl: process.env.DATABASE_URL || process.env.NEON_POSTGRES_PRISMA_URL || process.env.NEON_DATABASE_URL || undefined,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma