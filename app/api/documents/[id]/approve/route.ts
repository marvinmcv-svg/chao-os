import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { ConflictError, ForbiddenError, NotFoundError } from '@/lib/result'

// POST /api/documents/[id]/approve — admin only
export const POST = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()

    if (user.role !== 'ADMIN') {
      throw new ForbiddenError('Solo admins pueden aprobar documentos')
    }

    const document = await prisma.document.findUnique({ where: { id: params.id } })
    if (!document) throw new NotFoundError('Document', params.id)

    if (document.status === 'APPROVED') {
      throw new ConflictError('Documento ya está aprobado')
    }

    return prisma.document.update({
      where: { id: params.id },
      data: { status: 'APPROVED' },
    })
  },
)