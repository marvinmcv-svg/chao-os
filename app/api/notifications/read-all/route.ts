import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/notifications/read-all — mark all of the user's notifications as read
export const PATCH = withApiHandler(async (_request: NextRequest) => {
  const user = await requireAuth()

  const result = await prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  })

  return { count: result.count }
})