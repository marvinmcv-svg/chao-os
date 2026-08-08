import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { CreateClientSchema } from '@/lib/validations'

// GET /api/clients — all clients, alphabetical
export const GET = withApiHandler(async (_req: NextRequest) => {
  await requireAuth()
  return prisma.client.findMany({
    orderBy: { name: 'asc' },
  })
})

// POST /api/clients — create client
export const POST = withApiHandler(
  async (req: NextRequest) => {
    await requireAuth()
    const body = CreateClientSchema.parse(await req.json())
    return prisma.client.create({ data: body })
  },
  { status: 201 },
)