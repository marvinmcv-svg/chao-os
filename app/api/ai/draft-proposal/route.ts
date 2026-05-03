import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateProposalDraft, type ProjectContext } from '@/lib/claude'
import { proposalStore } from '@/lib/proposal-store'

// POST /api/ai/draft-proposal — generate a proposal draft for a lead
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { leadId } = body

    if (!leadId) {
      return Response.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'leadId es requerido', field: 'leadId' } },
        { status: 400 }
      )
    }

    // 1. Fetch lead
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        assignedTo: { select: { id: true, name: true } },
        convertedToProject: {
          include: {
            phases: { orderBy: { phase: 'asc' } },
            milestones: { orderBy: { dueDate: 'asc' } },
            client: true,
          },
        },
      },
    })

    if (!lead) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Lead no encontrado' } },
        { status: 404 }
      )
    }

    // 2. Build context for Claude
    const firmInfo = {
      name: 'CHAO Arquitectura S.R.L.',
      location: 'Santa Cruz de la Sierra, Bolivia',
      founded: 2015,
      services: 'Servicios de arquitectura, diseño urbano, supervisión de obras',
    }

    const leadInfo = {
      projectName: lead.projectName,
      company: lead.company,
      contactName: lead.contactName,
      contactEmail: lead.contactEmail,
      projectType: lead.projectType,
      estimatedValueUSD: lead.estimatedValueUSD,
      pipelineStage: lead.pipelineStage,
      sourceType: lead.sourceType,
      closeProbability: lead.closeProbability,
      notes: lead.notes,
      assignedTo: lead.assignedTo?.name ?? 'No asignado',
    }

    // 3. Build project context if lead is converted
    let projectContext: ProjectContext | null = null
    if (lead.convertedToProject) {
      const project = lead.convertedToProject
      projectContext = {
        code: project.code,
        name: project.name,
        client: {
          name: project.client?.name,
          company: project.client?.company,
          email: project.client?.email,
        },
        type: project.type,
        contractType: project.contractType,
        currentPhase: project.currentPhase,
        totalBudgetUSD: project.totalBudgetUSD,
        totalSpentUSD: project.totalSpentUSD,
        status: project.status,
        startDate: project.startDate,
        estimatedEndDate: project.estimatedEndDate,
        phases: project.phases.map((p) => ({
          phase: p.phase,
          label: p.label,
          budgetUSD: p.budgetUSD,
          progressPercent: p.progressPercent,
          status: p.status,
          startDate: p.startDate,
          endDate: p.endDate,
        })),
        milestones: project.milestones.map((m) => ({
          label: m.label,
          dueDate: m.dueDate,
          status: m.status,
        })),
      }
    }

    // 4. Call Claude to generate the proposal
    const proposalText = await generateProposalDraft({
      firm: firmInfo,
      lead: leadInfo,
      project: projectContext,
    })

    // 5. Store in shared memory
    const proposalId = crypto.randomUUID()
    const generatedAt = new Date().toISOString()
    proposalStore.set(leadId, { proposalId, leadId, content: proposalText, generatedAt })

    return Response.json({
      success: true,
      data: {
        proposalId,
        leadId,
        content: proposalText,
        generatedAt,
      },
    }, { status: 201 })
  } catch (error) {
    console.error('POST /api/ai/draft-proposal error:', error)
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error al generar la propuesta' } },
      { status: 500 }
    )
  }
}