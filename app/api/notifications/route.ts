import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/notifications — list notifications for auth user
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const readFilter = searchParams.get('read')
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)
    const offset = parseInt(searchParams.get('offset') ?? '0')

    const where: Record<string, unknown> = { userId: session.user.id }
    if (readFilter === 'true') where.read = true
    else if (readFilter === 'false') where.read = false

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.notification.count({ where: { userId: session.user.id, read: false } }),
    ])

    return NextResponse.json({
      success: true,
      data: { notifications, unreadCount },
    })
  } catch (error) {
    console.error('[GET /api/notifications]', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } },
      { status: 500 }
    )
  }
}

// POST /api/notifications — create a notification (internal use)
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { userId, type, title, message, linkUrl } = body

    if (!userId || !type || !title || !message) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Faltan campos requeridos' } },
        { status: 400 }
      )
    }

    const notification = await prisma.notification.create({
      data: { userId, type, title, message, linkUrl: linkUrl ?? null },
    })

    return NextResponse.json({ success: true, data: { notification } }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/notifications]', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } },
      { status: 500 }
    )
  }
}