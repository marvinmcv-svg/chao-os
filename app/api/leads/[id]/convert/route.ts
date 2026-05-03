import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendLeadConvertedEmail } from '@/lib/email'

// POST /api/leads/:id/convert — convert WON lead to project
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const lead = await prisma.lead.findUnique({
      where: { id: params.id },
      include: { assignedTo: { select: { email: true, name: true } } },
    })
    if (!lead) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Lead no encontrado' } }, { status: 404 })
    }

    if (lead.pipelineStage !== 'WON') {
      return Response.json({ success: false, error: { code: 'INVALID_STATE', message: 'Solo se pueden convertir leads en etapa WON' } }, { status: 422 })
    }

    if (lead.convertedToProjectId) {
      return Response.json({ success: false, error: { code: 'CONFLICT', message: 'Este lead ya fue convertido a proyecto' } }, { status: 409 })
    }

    const lastProject = await prisma.project.findFirst({ orderBy: { code: 'desc' } })
    const lastNum = lastProject ? parseInt(lastProject.code.split('-')[2]) : 0
    const nextCode = `P-${new Date().getFullYear()}-${String(lastNum + 1).padStart(3, '0')}`

    let client = await prisma.client.findFirst({
      where: {
        OR: [
          { email: lead.contactEmail },
          { company: lead.company },
        ],
      },
    })

    if (!client) {
      client = await prisma.client.create({
        data: {
          name: lead.contactName,
          company: lead.company,
          email: lead.contactEmail,
          phone: lead.contactPhone || '',
          type: 'ACTIVE',
          aiScore: lead.aiScore || 0,
        },
      })
    }

    const project = await prisma.project.create({
      data: {
        code: nextCode,
        name: lead.projectName,
        clientId: client.id,
        projectManagerId: lead.assignedToId,
        type: lead.projectType,
        contractType: 'FIXED_FEE',
        currentPhase: 'SD',
        totalBudgetUSD: lead.estimatedValueUSD,
        startDate: new Date(),
        estimatedEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        convertedFromLeadId: lead.id,
        phases: {
          create: [
            { phase: 'SD', label: 'Schematic Design', budgetUSD: lead.estimatedValueUSD * 0.15, status: 'NOT_STARTED' },
            { phase: 'DD', label: 'Design Development', budgetUSD: lead.estimatedValueUSD * 0.25, status: 'NOT_STARTED' },
            { phase: 'CD', label: 'Construction Documents', budgetUSD: lead.estimatedValueUSD * 0.40, status: 'NOT_STARTED' },
            { phase: 'CA', label: 'Construction Administration', budgetUSD: lead.estimatedValueUSD * 0.20, status: 'NOT_STARTED' },
          ],
        },
      },
      include: {
        client: true,
        phases: true,
        projectManager: { select: { id: true, name: true, avatarInitials: true } },
      },
    })

    await prisma.lead.update({
      where: { id: params.id },
      data: { convertedToProjectId: project.id },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'Project',
        entityId: project.id,
        payload: { convertedToProjectId: params.id, leadName: lead.projectName },
      },
    })

    // Notify the PM that their lead was converted (fire-and-forget)
    void sendLeadConvertedEmail({
      company: lead.company,
      projectName: lead.projectName,
      estimatedValueUSD: lead.estimatedValueUSD,
      assignedToEmail: lead.assignedTo.email,
      assignedToName: lead.assignedTo.name,
    })

    return Response.json({ success: true, data: project }, { status: 201 })
  } catch (error) {
    console.error('POST /api/leads/:id/convert error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}