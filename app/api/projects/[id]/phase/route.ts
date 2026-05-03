import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendProjectUpdateEmail } from '@/lib/email'

// PATCH /api/projects/:id/phase — update current phase
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const body = await req.json()
    const { phase } = body

    if (!['SD', 'DD', 'CD', 'CA'].includes(phase)) {
      return Response.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Fase inválida' } }, { status: 400 })
    }

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: { client: { select: { name: true, email: true } }, projectManager: { select: { name: true } } },
    })
    if (!project) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Proyecto no encontrado' } }, { status: 404 })
    }

    // Phase labels map
    const phaseLabels: Record<string, string> = {
      SD: 'Schematic Design',
      DD: 'Design Development',
      CD: 'Construction Documents',
      CA: 'Construction Administration',
    }

    const updated = await prisma.project.update({
      where: { id: params.id },
      data: { currentPhase: phase },
      include: { phases: { orderBy: { phase: 'asc' } } },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Project',
        entityId: params.id,
        payload: { field: 'currentPhase', from: project.currentPhase, to: phase },
      },
    })

    // Send project update email to client (fire-and-forget)
    void sendProjectUpdateEmail({
      name: project.name,
      clientName: project.client.name,
      clientEmail: project.client.email,
      newPhase: phase,
      newPhaseLabel: phaseLabels[phase] ?? phase,
    })

    return Response.json({ success: true, data: updated })
  } catch (error) {
    console.error('PATCH /api/projects/:id/phase error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}