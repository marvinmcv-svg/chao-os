import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/documents/[id]/approve — admin only
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
        { status: 401 }
      )
    }

    if (session.user.role !== 'ADMIN') {
      return Response.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Solo admins pueden aprobar documentos' } },
        { status: 403 }
      )
    }

    const document = await prisma.document.findUnique({ where: { id: params.id } })
    if (!document) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Documento no encontrado' } },
        { status: 404 }
      )
    }

    if (document.status === 'APPROVED') {
      return Response.json(
        { success: false, error: { code: 'CONFLICT', message: 'Documento ya está aprobado' } },
        { status: 409 }
      )
    }

    const updated = await prisma.document.update({
      where: { id: params.id },
      data: { status: 'APPROVED' },
    })

    return Response.json({ success: true, data: updated })
  } catch (error) {
    console.error('POST /api/documents/[id]/approve error:', error)
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } },
      { status: 500 }
    )
  }
}