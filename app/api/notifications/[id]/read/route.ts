import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/notifications/[id]/read — mark notification as read
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
        { status: 401 }
      )
    }

    const { id } = await params

    const notification = await prisma.notification.findUnique({ where: { id } })
    if (!notification) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Notificación no encontrada' } },
        { status: 404 }
      )
    }

    if (notification.userId !== session.user.id) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'No tienes acceso a esta notificación' } },
        { status: 403 }
      )
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { read: true },
    })

    return NextResponse.json({ success: true, data: { notification: updated } })
  } catch (error) {
    console.error('[PATCH /api/notifications/[id]/read]', error)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } },
      { status: 500 }
    )
  }
}