import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { ForbiddenError, NotFoundError } from '@/lib/result'

// PATCH /api/notifications/[id]/read — mark notification as read
// (owner-only; Next 15 async params)
export const PATCH = withApiHandler(
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireAuth()
    const { id } = await params

    const notification = await prisma.notification.findUnique({ where: { id } })
    if (!notification) throw new NotFoundError('Notification', id)

    if (notification.userId !== user.id) {
      throw new ForbiddenError('No tienes acceso a esta notificación')
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    })

    return { notification: updated }
  },
)