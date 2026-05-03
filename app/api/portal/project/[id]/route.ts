import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPortalToken } from '@/lib/portal-auth'

// GET /api/portal/project/:id?token=XXX — get project status for client portal
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token')

    if (!token) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token requerido' } }, { status: 401 })
    }

    // Hash the incoming token and verify against portalTokenHash + portalAccessEnabled
    const tokenHash = hashPortalToken(token)
    const client = await prisma.client.findFirst({
      where: { portalTokenHash: tokenHash, portalAccessEnabled: true },
    })

    if (!client) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token inválido' } }, { status: 401 })
    }

    const project = await prisma.project.findFirst({
      where: { id: params.id, clientId: client.id },
      include: {
        phases: { orderBy: { phase: 'asc' } },
        milestones: {
          where: { status: { not: 'rejected' } },
          orderBy: { dueDate: 'asc' },
        },
        invoices: {
          where: { status: { in: ['SENT', 'PENDING', 'PAID'] } },
          orderBy: { issuedAt: 'desc' },
          select: { id: true, number: true, amountUSD: true, status: true, issuedAt: true, dueDate: true },
        },
        documents: {
          where: { status: 'APPROVED' },
          orderBy: { uploadedAt: 'desc' },
          select: { id: true, filename: true, url: true, uploadedAt: true, phase: true },
        },
      },
    })

    if (!project) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Proyecto no encontrado' } }, { status: 404 })
    }

    return Response.json({
      success: true,
      data: {
        project: {
          id: project.id,
          code: project.code,
          name: project.name,
          type: project.type,
          currentPhase: project.currentPhase,
          overallProgressPercent: project.overallProgressPercent,
          status: project.status,
          startDate: project.startDate,
          estimatedEndDate: project.estimatedEndDate,
        },
        phases: project.phases,
        milestones: project.milestones,
        invoices: project.invoices,
        documents: project.documents,
      },
    })
  } catch (error) {
    console.error('GET /api/portal/project/:id error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}