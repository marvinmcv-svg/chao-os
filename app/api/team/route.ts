import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'

// GET /api/team — list all team members with capacity data
export const GET = withApiHandler(async (_req: NextRequest) => {
  await requireAuth()

  return prisma.teamMember.findMany({
    include: {
      user: {
        select: { id: true, name: true, email: true, avatarInitials: true, role: true, capacityPercent: true },
      },
    },
    orderBy: { user: { name: 'asc' } },
  })
})