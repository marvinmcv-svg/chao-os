import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { generateProposalDraft, type ProjectContext } from '@/lib/claude'
import { proposalStore } from '@/lib/proposal-store'
import { NotFoundError, ValidationError } from '@/lib/result'

// POST /api/ai/draft-proposal — generate a proposal draft for a lead
export const POST = withApiHandler(
  async (req: NextRequest) => {
    await requireAuth()

    const body = await req.json()
    const { leadId } = body

    if (!leadId) {
      throw new ValidationError('leadId es requerido', 'leadId')
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

    if (!lead) throw new NotFoundError('Lead', leadId)

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

    return {
      proposalId,
      leadId,
      content: proposalText,
      generatedAt,
    }
  },
  { status: 201 },
)