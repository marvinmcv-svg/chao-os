import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { ValidationError } from '@/lib/result'

// GET /api/notifications — list notifications for auth user (+ unread count)
export const GET = withApiHandler(async (req: NextRequest) => {
  const user = await requireAuth()

  const { searchParams } = new URL(req.url)
  const readFilter = searchParams.get('read')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  const where: Record<string, unknown> = { userId: user.id }
  if (readFilter === 'true') where.read = true
  else if (readFilter === 'false') where.read = false

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ])

  return { notifications, unreadCount }
})

// POST /api/notifications — create a notification (internal use)
export const POST = withApiHandler(
  async (req: NextRequest) => {
    await requireAuth()

    const body = await req.json()
    const { userId, type, title, message, linkUrl } = body

    if (!userId || !type || !title || !message) {
      throw new ValidationError('Faltan campos requeridos', !userId ? 'userId' : 'type')
    }

    const notification = await prisma.notification.create({
      data: { userId, type, title, message, linkUrl: linkUrl ?? null },
    })

    return { notification }
  },
  { status: 201 },
)