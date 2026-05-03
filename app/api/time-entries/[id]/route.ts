import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recalculateTeamUtilization } from '@/lib/time-util'

// DELETE /api/time-entries/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const entry = await prisma.timeEntry.findUnique({ where: { id: params.id } })
    if (!entry) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Entrada no encontrada' } }, { status: 404 })
    }

    if (entry.userId !== session.user.id && session.user.role !== 'ADMIN') {
      return Response.json({ success: false, error: { code: 'FORBIDDEN', message: 'Sin permiso' } }, { status: 403 })
    }

    await prisma.timeEntry.delete({ where: { id: params.id } })

    if (entry.taskId) {
      await prisma.task.update({
        where: { id: entry.taskId },
        data: { loggedHours: { decrement: entry.hours } },
      })
    }

    await recalculateTeamUtilization(entry.userId)

    return Response.json({ success: true, data: { id: params.id } })
  } catch (error) {
    console.error('DELETE /api/time-entries/:id error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}