import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// PATCH /api/leads/:id/stage — update pipeline stage + optionally sortOrder
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const body = await req.json()
    const { pipelineStage, sortOrder } = body

    const validStages = ['PROSPECT', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST']
    if (!validStages.includes(pipelineStage)) {
      return Response.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Stage inválido' } }, { status: 400 })
    }

    const existing = await prisma.lead.findUnique({ where: { id: params.id } })
    if (!existing) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Lead no encontrado' } }, { status: 404 })
    }

    const updateData: any = { pipelineStage }
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder

    if (pipelineStage === 'WON') {
      updateData.closeProbability = 100
    }

    const lead = await prisma.lead.update({
      where: { id: params.id },
      data: updateData,
      include: {
        assignedTo: { select: { id: true, name: true, avatarInitials: true } },
        convertedToProject: { select: { id: true, code: true, name: true } },
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Lead',
        entityId: lead.id,
        payload: { field: 'pipelineStage', from: existing.pipelineStage, to: pipelineStage },
      },
    })

    return Response.json({ success: true, data: lead })
  } catch (error) {
    console.error('PATCH /api/leads/:id/stage error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}