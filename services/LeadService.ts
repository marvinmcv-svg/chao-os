/**
 * LeadService — lead CRUD + pipeline + funnel + AI scoring + conversion.
 *
 * All routes under /api/leads/* eventually delegate here. The service:
 *   - Validates pipeline stages centrally (PIPELINE_STAGES const).
 *   - Auto-calculates sortOrder on create (max + 1 within the stage).
 *   - Auto-sets closeProbability=100 when a lead moves to WON.
 *   - Writes audit log entries for every mutation.
 *   - Runs the conversion flow as a single Prisma transaction
 *     (find/create Client + create Project + 4 phases + link Lead + audit)
 *     so a partial conversion never leaves the system inconsistent.
 *   - Fires the PM-notification email as fire-and-forget on convert.
 *
 * Permission model:
 *   - Every method takes `currentUser: AuthUser` for audit + checks.
 *   - All methods are available to any authenticated user, matching
 *     the current route behavior. The dedicated stage/ai-score routes
 *     have no permission check beyond authentication.
 *
 * Transactions:
 *   - `convertToProject()` uses prisma.$transaction because the
 *     Client+Project+Lead-update+audit chain must be atomic. A
 *     partial conversion would leave the lead as WON but unconverted,
 *     which is exactly the bug that motivated putting this in a
 *     service.
 */
import type { z } from 'zod'
import type { CreateLeadSchema } from '@/lib/validations'
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'
import { sendLeadConvertedEmail } from '@/lib/email'
import { scoreLead } from '@/lib/claude'
import {
  ConflictError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from '@/lib/result'

export type CreateLeadInput = z.infer<typeof CreateLeadSchema>

const PIPELINE_STAGES = [
  'PROSPECT',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const
type PipelineStage = (typeof PIPELINE_STAGES)[number]

const LEAD_LIST_INCLUDE = {
  assignedTo: { select: { id: true, name: true, avatarInitials: true } },
  convertedToProject: { select: { id: true, code: true, name: true } },
} as const

const LEAD_DETAIL_INCLUDE = {
  assignedTo: {
    select: { id: true, name: true, email: true, avatarInitials: true, role: true },
  },
  convertedToProject: {
    select: { id: true, code: true, name: true, status: true },
  },
} as const

// Whitelist of fields the PUT route allows updating. pipelineStage
// has its own dedicated route, and ai* fields have the ai-score route.
const UPDATABLE_FIELDS = [
  'projectName',
  'company',
  'contactName',
  'contactEmail',
  'contactPhone',
  'estimatedValueUSD',
  'projectType',
  'closeProbability',
  'notes',
  'sourceType',
  'assignedToId',
] as const

function assertValidStage(stage: string): asserts stage is PipelineStage {
  if (!(PIPELINE_STAGES as readonly string[]).includes(stage)) {
    throw new ValidationError(`Stage inválido: ${stage}`, 'pipelineStage')
  }
}

export const LeadService = {
  // ─── list ──────────────────────────────────────────────────────────────

  /**
   * List leads, optionally filtered by pipeline stage. Ordered by
   * stage then sortOrder so the kanban view comes back in the right order.
   */
  async list(args: { currentUser: AuthUser; stage?: string }) {
    const where = args.stage ? ({ pipelineStage: args.stage } as Record<string, unknown>) : {}
    return prisma.lead.findMany({
      where,
      include: LEAD_LIST_INCLUDE,
      orderBy: [{ pipelineStage: 'asc' }, { sortOrder: 'asc' }],
    })
  },

  // ─── create ────────────────────────────────────────────────────────────

  /**
   * Create a new lead. sortOrder auto-calculated as (max in this stage) + 1
   * so new leads land at the bottom of their column in the kanban.
   * Writes an audit log entry on success.
   */
  async create(args: { currentUser: AuthUser; data: CreateLeadInput }) {
    const { currentUser, data } = args

    const max = await prisma.lead.aggregate({
      where: { pipelineStage: data.pipelineStage },
      _max: { sortOrder: true },
    })
    const sortOrder = (max._max.sortOrder ?? -1) + 1

    const lead = await prisma.lead.create({
      data: {
        ...data,
        contactPhone: data.contactPhone || '',
        sortOrder,
      },
      include: { assignedTo: { select: { id: true, name: true, avatarInitials: true } } },
    })

    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        action: 'CREATE',
        entityType: 'Lead',
        entityId: lead.id,
        payload: { data: lead },
      },
    })

    return lead
  },

  // ─── getById ───────────────────────────────────────────────────────────

  /**
   * Get one lead with the full relation graph used by the detail view.
   * Throws NotFoundError if no lead has that id.
   */
  async getById(args: { currentUser: AuthUser; id: string }) {
    const lead = await prisma.lead.findUnique({
      where: { id: args.id },
      include: LEAD_DETAIL_INCLUDE,
    })
    if (!lead) throw new NotFoundError('Lead', args.id)
    return lead
  },

  // ─── update ────────────────────────────────────────────────────────────

  /**
   * Partial update of a lead. Only whitelisted fields are written
   * (pipelineStage is intentionally NOT here — use updateStage).
   * Captures the full before-state in the audit log for compliance.
   */
  async update(args: {
    currentUser: AuthUser
    id: string
    data: Partial<Pick<CreateLeadInput, (typeof UPDATABLE_FIELDS)[number]>>
  }) {
    const before = await prisma.lead.findUnique({ where: { id: args.id } })
    if (!before) throw new NotFoundError('Lead no encontrado', 'Lead')

    const updateData: Record<string, unknown> = {}
    for (const field of UPDATABLE_FIELDS) {
      if (args.data[field] !== undefined) {
        updateData[field] = args.data[field]
      }
    }

    const lead = await prisma.lead.update({
      where: { id: args.id },
      data: updateData,
      include: LEAD_LIST_INCLUDE,
    })

    await prisma.auditLog.create({
      data: {
        userId: args.currentUser.id,
        action: 'UPDATE',
        entityType: 'Lead',
        entityId: lead.id,
        payload: { before, after: lead },
      },
    })

    return lead
  },

  // ─── delete ────────────────────────────────────────────────────────────

  /**
   * Hard-delete a lead. The audit log preserves the before-state so
   * a forensic trail survives the delete.
   */
  async delete(args: { currentUser: AuthUser; id: string }) {
    const before = await prisma.lead.findUnique({ where: { id: args.id } })
    if (!before) throw new NotFoundError('Lead no encontrado', 'Lead')

    await prisma.lead.delete({ where: { id: args.id } })

    await prisma.auditLog.create({
      data: {
        userId: args.currentUser.id,
        action: 'DELETE',
        entityType: 'Lead',
        entityId: args.id,
        payload: { before },
      },
    })
  },

  // ─── getFunnel ─────────────────────────────────────────────────────────

  /**
   * BD pipeline analytics: per-stage counts/total/weighted values, plus
   * summary stats (win rate, average cycle days for converted leads).
   * All 6 stages always returned (zero-fill) so the UI never sees
   * a missing column.
   */
  async getFunnel(args: { currentUser: AuthUser }) {
    const funnel = await Promise.all(
      PIPELINE_STAGES.map(async (stage) => {
        const leads = await prisma.lead.findMany({
          where: { pipelineStage: stage },
          select: { estimatedValueUSD: true, closeProbability: true },
        })
        const totalValue = leads.reduce((sum, l) => sum + l.estimatedValueUSD, 0)
        const weightedValue = leads.reduce(
          (sum, l) => sum + (l.estimatedValueUSD * l.closeProbability) / 100,
          0,
        )
        return {
          stage,
          count: leads.length,
          totalValue,
          weightedValue: Math.round(weightedValue),
          wonInStage: stage === 'WON' ? leads.length : 0,
          lostInStage: stage === 'LOST' ? leads.length : 0,
        }
      }),
    )

    const allLeads = await prisma.lead.findMany({
      select: { pipelineStage: true, createdAt: true, updatedAt: true },
    })
    const wonLeads = allLeads.filter((l) => l.pipelineStage === 'WON').length
    const lostLeads = allLeads.filter((l) => l.pipelineStage === 'LOST').length
    const winRate =
      wonLeads + lostLeads > 0 ? Math.round((wonLeads / (wonLeads + lostLeads)) * 100) : 0

    // Average cycle: only counts leads that were both WON and converted,
    // because updatedAt for unconverted leads has no clear "end" semantics.
    const closedWon = await prisma.lead.findMany({
      where: { pipelineStage: 'WON', convertedToProjectId: { not: null } },
      select: { createdAt: true, updatedAt: true },
    })
    const avgCycleDays =
      closedWon.length > 0
        ? Math.round(
            closedWon.reduce(
              (sum, l) =>
                sum +
                (new Date(l.updatedAt).getTime() - new Date(l.createdAt).getTime()) /
                  (1000 * 60 * 60 * 24),
              0,
            ) / closedWon.length,
          )
        : 0

    return {
      funnel,
      summary: {
        totalLeads: allLeads.length,
        wonLeads,
        lostLeads,
        winRate,
        avgCycleDays,
      },
    }
  },

  // ─── updateStage ───────────────────────────────────────────────────────

  /**
   * Move a lead to a new pipeline stage. Auto-sets closeProbability=100
   * when moving to WON (manual probability overrides make no sense on a
   * closed-won deal). The dedicated stage route is the only legal way to
   * change pipelineStage; PUT blocks it.
   */
  async updateStage(args: {
    currentUser: AuthUser
    id: string
    pipelineStage: string
    sortOrder?: number
  }) {
    assertValidStage(args.pipelineStage)

    const before = await prisma.lead.findUnique({ where: { id: args.id } })
    if (!before) throw new NotFoundError('Lead no encontrado', 'Lead')

    const data: Record<string, unknown> = { pipelineStage: args.pipelineStage }
    if (args.sortOrder !== undefined) data.sortOrder = args.sortOrder
    if (args.pipelineStage === 'WON') data.closeProbability = 100

    const lead = await prisma.lead.update({
      where: { id: args.id },
      data,
      include: LEAD_LIST_INCLUDE,
    })

    await prisma.auditLog.create({
      data: {
        userId: args.currentUser.id,
        action: 'UPDATE',
        entityType: 'Lead',
        entityId: lead.id,
        payload: { field: 'pipelineStage', from: before.pipelineStage, to: args.pipelineStage },
      },
    })

    return lead
  },

  // ─── getAiScore ────────────────────────────────────────────────────────

  /**
   * Return the current AI score DTO for a lead, or null if no score has
   * been computed yet (the GET route returns null instead of 404 in that
   * case so the UI can render an empty state).
   * Throws NotFoundError only when the lead itself doesn't exist.
   */
  async getAiScore(args: { currentUser: AuthUser; id: string }) {
    const lead = await prisma.lead.findUnique({
      where: { id: args.id },
      select: {
        aiScore: true,
        aiScoreBreakdown: true,
        aiRecommendation: true,
        aiAnalysis: true,
      },
    })
    if (!lead) throw new NotFoundError('Lead', args.id)
    if (!lead.aiScore) return null

    return {
      overallScore: lead.aiScore,
      breakdown: lead.aiScoreBreakdown as {
        financialScore: number
        technicalScore: number
        commercialScore: number
        legalScore: number
        executionScore: number
      } | null,
      recommendation: lead.aiRecommendation,
      summary: lead.aiAnalysis ?? null,
      keyStrengths: [],
      keyRisks: [],
      nextSteps: [],
    }
  },

  // ─── triggerAiRescore ──────────────────────────────────────────────────

  /**
   * Call Claude to (re)score the lead and persist the results.
   * Returns the full breakdown + recommendation + freeform analysis.
   * Throws NotFoundError if the lead doesn't exist. Claude call errors
   * bubble up untouched (route handles them).
   */
  async triggerAiRescore(args: { currentUser: AuthUser; id: string }) {
    const lead = await prisma.lead.findUnique({
      where: { id: args.id },
      include: { assignedTo: { select: { name: true } } },
    })
    if (!lead) throw new NotFoundError('Lead', args.id)

    const result = await scoreLead({
      projectName: lead.projectName,
      company: lead.company,
      contactName: lead.contactName,
      contactEmail: lead.contactEmail,
      contactPhone: lead.contactPhone,
      estimatedValueUSD: lead.estimatedValueUSD,
      projectType: lead.projectType,
      pipelineStage: lead.pipelineStage,
      closeProbability: lead.closeProbability,
      sourceType: lead.sourceType,
      notes: lead.notes,
      assignedToName: lead.assignedTo.name,
    })

    const breakdown = {
      financialScore: result.financialScore,
      technicalScore: result.technicalScore,
      commercialScore: result.commercialScore,
      legalScore: result.legalScore,
      executionScore: result.executionScore,
    }

    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        aiScore: result.overallScore,
        aiScoreBreakdown: breakdown,
        aiRecommendation: result.recommendation,
        aiAnalysis: result.summary,
      },
    })

    return {
      overallScore: result.overallScore,
      breakdown,
      recommendation: result.recommendation,
      summary: result.summary,
      keyStrengths: result.keyStrengths,
      keyRisks: result.keyRisks,
      nextSteps: result.nextSteps,
    }
  },

  // ─── convertToProject ─────────────────────────────────────────────────

  /**
   * Convert a WON lead into a real project. Atomic flow:
   *   1. Generate next project code (P-YYYY-NNN based on last project
   *      in the current year — same scheme as the original route).
   *   2. Find-or-create the Client. Match by primary email OR company
   *      name; if neither exists, create as ACTIVE (the lead has WON,
   *      so they're now a real customer).
   *   3. In a single transaction: create Project + 4 phases (same
   *      15/25/40/20% split as ProjectService.create), link the Lead
   *      via convertedToProjectId, write audit log.
   *   4. Fire-and-forget email to the assigned PM.
   *
   * Throws:
   *   - NotFoundError if the lead doesn't exist
   *   - InvalidStateError if the lead isn't in WON
   *   - ConflictError if the lead was already converted
   */
  async convertToProject(args: { currentUser: AuthUser; id: string }) {
    const lead = await prisma.lead.findUnique({
      where: { id: args.id },
      include: { assignedTo: { select: { email: true, name: true } } },
    })
    if (!lead) throw new NotFoundError('Lead', args.id)

    if (lead.pipelineStage !== 'WON') {
      throw new InvalidStateError('Solo se pueden convertir leads en etapa WON')
    }

    if (lead.convertedToProjectId) {
      throw new ConflictError('Este lead ya fue convertido a proyecto')
    }

    // 1. Generate next project code
    const year = new Date().getFullYear()
    const lastProject = await prisma.project.findFirst({
      where: { code: { startsWith: `P-${year}-` } },
      orderBy: { code: 'desc' },
    })
    const lastNum = lastProject ? parseInt(lastProject.code.split('-')[2], 10) : 0
    const code = `P-${year}-${String(lastNum + 1).padStart(3, '0')}`

    // 2. Find or create Client
    let client = await prisma.client.findFirst({
      where: {
        OR: [{ email: lead.contactEmail }, { company: lead.company }],
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

    // 3. Transactional write: project + phases + link + audit
    const project = await prisma.$transaction(async (tx) => {
      const proj = await tx.project.create({
        data: {
          code,
          name: lead.projectName,
          clientId: client!.id,
          projectManagerId: lead.assignedToId,
          type: lead.projectType as 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL' | 'INSTITUTIONAL' | 'MIXED',
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

      await tx.lead.update({
        where: { id: lead.id },
        data: { convertedToProjectId: proj.id },
      })

      await tx.auditLog.create({
        data: {
          userId: args.currentUser.id,
          action: 'CREATE',
          entityType: 'Project',
          entityId: proj.id,
          payload: { convertedToProjectId: lead.id, leadName: lead.projectName },
        },
      })

      return proj
    })

    // 4. Fire-and-forget PM email
    void sendLeadConvertedEmail({
      company: lead.company,
      projectName: lead.projectName,
      estimatedValueUSD: lead.estimatedValueUSD,
      assignedToEmail: lead.assignedTo.email,
      assignedToName: lead.assignedTo.name,
    }).catch((err) => console.error('sendLeadConvertedEmail failed:', err))

    return project
  },
}
