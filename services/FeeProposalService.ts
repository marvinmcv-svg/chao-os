/**
 * FeeProposalService — fee proposals for leads (roadmap item 2).
 *
 * Lifecycle (one proposal "number" per lead, many versions):
 *   DRAFT ──send──▶ SENT ──accept──▶ ACCEPTED  (lead → WON, becomes the
 *     ▲               │                         project budget on convert)
 *     │               └──decline──▶ DECLINED
 *     └──revise── SENT / DECLINED / SUPERSEDED  (copies into a new DRAFT
 *                                                version)
 * Sending a version supersedes any other SENT version of the same lead;
 * accepting one supersedes every other open version.
 *
 * Permissions: PRINCIPAL / ADMIN / ARCHITECT_SENIOR create and change
 * proposals and see internal cost and margin. Everyone else can read the
 * client-facing figures only.
 */
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'
import { ConflictError, ForbiddenError, InvalidStateError, NotFoundError } from '@/lib/result'
import {
  DEFAULT_RATE_CARD,
  FeePhasesSchema,
  buildTemplatePhases,
  computeProposal,
  type FeePhase,
} from '@/lib/fees'

export const PROPOSAL_EDITOR_ROLES = new Set(['PRINCIPAL', 'ADMIN', 'ARCHITECT_SENIOR'])

const DEFAULT_COST_RATE = () => Number(process.env.DEFAULT_HOURLY_RATE) || 25

export const DEFAULT_PAYMENT_TERMS =
  'Anticipo del 20% a la firma del contrato. El saldo se factura al cierre de cada fase en proporción a su honorario. Pago a 30 días de la factura.'
export const DEFAULT_EXCLUSIONS =
  'Estudios de suelos y topografía, ingenierías de especialidad (estructural, sanitaria, eléctrica, mecánica), trámites y tasas municipales, renders adicionales y maquetas físicas.'

export const proposalCreateSchema = z.object({
  areaM2: z.number().positive().max(1_000_000).nullish(),
})

export const proposalUpdateSchema = z.object({
  contractType: z.enum(['FIXED_FEE', 'PERCENTAGE', 'TIME_AND_MATERIALS']).optional(),
  areaM2: z.number().positive().max(1_000_000).nullable().optional(),
  discountPercent: z.number().min(0).max(50).optional(),
  phases: FeePhasesSchema.optional(),
  scope: z.string().max(5000).optional(),
  exclusions: z.string().max(5000).optional(),
  paymentTerms: z.string().max(5000).optional(),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida').optional(),
})
export type ProposalUpdateInput = z.infer<typeof proposalUpdateSchema>

export const proposalActionSchema = z.object({
  action: z.enum(['send', 'accept', 'decline', 'revise']),
})

type ProposalRow = Prisma.FeeProposalGetPayload<object>

function assertEditor(user: AuthUser) {
  if (!PROPOSAL_EDITOR_ROLES.has(user.role)) {
    throw new ForbiddenError('Solo dirección y arquitectos senior gestionan propuestas de honorarios')
  }
}

const parsePhases = (json: Prisma.JsonValue): FeePhase[] => FeePhasesSchema.parse(json)

const LEAD_SUMMARY = {
  select: {
    id: true,
    projectName: true,
    company: true,
    contactName: true,
    contactEmail: true,
    projectType: true,
    pipelineStage: true,
    convertedToProjectId: true,
  },
} as const

export const FeeProposalService = {
  /** Average internal cost rate per role from team members' hourly rates. */
  async getCostRates(): Promise<Record<string, number>> {
    const members = await prisma.teamMember.findMany({
      where: { hourlyRate: { not: null } },
      select: { hourlyRate: true, user: { select: { role: true } } },
    })
    const acc: Record<string, { sum: number; n: number }> = {}
    for (const m of members) {
      const r = m.user.role
      acc[r] ??= { sum: 0, n: 0 }
      acc[r].sum += m.hourlyRate ?? 0
      acc[r].n += 1
    }
    return Object.fromEntries(Object.entries(acc).map(([r, v]) => [r, Math.round((v.sum / v.n) * 100) / 100]))
  },

  /** Totals for a stored row, with cost figures removed for non-editors. */
  present(row: ProposalRow & { lead?: unknown; createdBy?: unknown }, user: AuthUser, costRates: Record<string, number>) {
    const phases = parsePhases(row.phases)
    const totals = computeProposal(phases, {
      discountPercent: row.discountPercent,
      costRates,
      defaultCostRate: DEFAULT_COST_RATE(),
    })
    const canEdit = PROPOSAL_EDITOR_ROLES.has(user.role)
    if (canEdit) {
      return { ...row, phases, totals, canEdit, rateCard: DEFAULT_RATE_CARD, costRates, defaultCostRate: DEFAULT_COST_RATE() }
    }

    const { costUSD: _c, ...rest } = row
    void _c
    return {
      ...rest,
      phases,
      totals: {
        ...totals,
        costUSD: null,
        marginUSD: null,
        marginPercent: null,
        phases: totals.phases.map((p) => ({ ...p, costUSD: null })),
      },
      canEdit,
      rateCard: DEFAULT_RATE_CARD,
    }
  },

  async listForLead(args: { currentUser: AuthUser; leadId: string }) {
    const lead = await prisma.lead.findUnique({ where: { id: args.leadId }, select: { id: true } })
    if (!lead) throw new NotFoundError('Lead', args.leadId)
    const rows = await prisma.feeProposal.findMany({
      where: { leadId: args.leadId },
      orderBy: { version: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
    })
    const canSeeCost = PROPOSAL_EDITOR_ROLES.has(args.currentUser.role)
    return rows.map(({ phases: _p, costUSD, ...r }) => {
      void _p
      return {
        ...r,
        costUSD: canSeeCost ? costUSD : null,
        marginPercent: canSeeCost && r.feeUSD ? Math.round(((r.feeUSD - costUSD) / r.feeUSD) * 1000) / 10 : null,
      }
    })
  },

  async get(args: { currentUser: AuthUser; id: string }) {
    const row = await prisma.feeProposal.findUnique({
      where: { id: args.id },
      include: { lead: LEAD_SUMMARY, createdBy: { select: { id: true, name: true, email: true } } },
    })
    if (!row) throw new NotFoundError('Propuesta', args.id)
    return this.present(row, args.currentUser, await this.getCostRates())
  },

  /**
   * Start a proposal for a lead. If the lead already has one, this opens
   * a new DRAFT version copied from the latest instead of a fresh number.
   */
  async create(args: { currentUser: AuthUser; leadId: string; areaM2?: number | null }) {
    assertEditor(args.currentUser)
    const lead = await prisma.lead.findUnique({ where: { id: args.leadId } })
    if (!lead) throw new NotFoundError('Lead', args.leadId)
    if (lead.convertedToProjectId) throw new ConflictError('El lead ya fue convertido a proyecto')

    const latest = await prisma.feeProposal.findFirst({ where: { leadId: lead.id }, orderBy: { version: 'desc' } })
    if (latest) return this.revise({ currentUser: args.currentUser, id: latest.id })

    const year = new Date().getUTCFullYear()
    const last = await prisma.feeProposal.findFirst({
      where: { number: { startsWith: `PRO-${year}-` } },
      orderBy: { number: 'desc' },
      select: { number: true },
    })
    const n = last ? parseInt(last.number.split('-')[2], 10) + 1 : 1
    const number = `PRO-${year}-${String(n).padStart(3, '0')}`

    const phases = buildTemplatePhases({ areaM2: args.areaM2, projectType: lead.projectType })
    const costRates = await this.getCostRates()
    const totals = computeProposal(phases, { costRates, defaultCostRate: DEFAULT_COST_RATE() })

    const row = await prisma.feeProposal.create({
      data: {
        number,
        version: 1,
        leadId: lead.id,
        areaM2: args.areaM2 ?? null,
        phases: phases as unknown as Prisma.InputJsonValue,
        feeUSD: totals.feeUSD,
        costUSD: totals.costUSD,
        hours: totals.hours,
        scope: `Servicios profesionales de arquitectura para ${lead.projectName}, desde el esquema preliminar hasta la administración de obra.`,
        exclusions: DEFAULT_EXCLUSIONS,
        paymentTerms: DEFAULT_PAYMENT_TERMS,
        validUntil: new Date(Date.now() + 30 * 86_400_000),
        createdById: args.currentUser.id,
      },
    })
    await audit(args.currentUser, 'CREATE', row.id, { number, leadId: lead.id })
    return this.present(row, args.currentUser, costRates)
  },

  async update(args: { currentUser: AuthUser; id: string; data: ProposalUpdateInput }) {
    assertEditor(args.currentUser)
    const before = await prisma.feeProposal.findUnique({ where: { id: args.id } })
    if (!before) throw new NotFoundError('Propuesta', args.id)
    if (before.status !== 'DRAFT') throw new InvalidStateError('Solo se puede editar un borrador. Crea una nueva versión.')

    const { validUntil, phases: nextPhases, ...rest } = args.data
    const phases = nextPhases ?? parsePhases(before.phases)
    const discountPercent = rest.discountPercent ?? before.discountPercent
    const costRates = await this.getCostRates()
    const totals = computeProposal(phases, { discountPercent, costRates, defaultCostRate: DEFAULT_COST_RATE() })

    const row = await prisma.feeProposal.update({
      where: { id: args.id },
      data: {
        ...rest,
        ...(validUntil ? { validUntil: new Date(`${validUntil}T00:00:00Z`) } : {}),
        phases: phases as unknown as Prisma.InputJsonValue,
        feeUSD: totals.feeUSD,
        costUSD: totals.costUSD,
        hours: totals.hours,
      },
      include: { lead: LEAD_SUMMARY, createdBy: { select: { id: true, name: true, email: true } } },
    })
    return this.present(row, args.currentUser, costRates)
  },

  async remove(args: { currentUser: AuthUser; id: string }) {
    assertEditor(args.currentUser)
    const row = await prisma.feeProposal.findUnique({ where: { id: args.id } })
    if (!row) throw new NotFoundError('Propuesta', args.id)
    if (row.status !== 'DRAFT') throw new InvalidStateError('Solo se pueden eliminar borradores')
    await prisma.feeProposal.delete({ where: { id: args.id } })
    await audit(args.currentUser, 'DELETE', row.id, { number: row.number, version: row.version })
    return { id: row.id }
  },

  /** Copy any non-accepted version into a new DRAFT version. */
  async revise(args: { currentUser: AuthUser; id: string }) {
    assertEditor(args.currentUser)
    const src = await prisma.feeProposal.findUnique({ where: { id: args.id }, include: { lead: true } })
    if (!src) throw new NotFoundError('Propuesta', args.id)
    if (src.lead.convertedToProjectId) throw new ConflictError('El lead ya fue convertido a proyecto')

    const versions = await prisma.feeProposal.findMany({
      where: { leadId: src.leadId },
      select: { id: true, version: true, status: true },
      orderBy: { version: 'desc' },
    })
    const openDraft = versions.find((v) => v.status === 'DRAFT')
    if (openDraft) throw new ConflictError(`Ya existe un borrador abierto (v${openDraft.version})`)
    if (versions.some((v) => v.status === 'ACCEPTED')) {
      throw new InvalidStateError('La propuesta ya fue aceptada; no se pueden crear nuevas versiones')
    }

    const costRates = await this.getCostRates()
    const row = await prisma.feeProposal.create({
      data: {
        number: src.number,
        version: (versions[0]?.version ?? src.version) + 1,
        leadId: src.leadId,
        contractType: src.contractType,
        areaM2: src.areaM2,
        discountPercent: src.discountPercent,
        phases: src.phases as Prisma.InputJsonValue,
        feeUSD: src.feeUSD,
        costUSD: src.costUSD,
        hours: src.hours,
        scope: src.scope,
        exclusions: src.exclusions,
        paymentTerms: src.paymentTerms,
        validUntil: new Date(Math.max(src.validUntil.getTime(), Date.now() + 30 * 86_400_000)),
        createdById: args.currentUser.id,
      },
    })
    await audit(args.currentUser, 'CREATE', row.id, { number: row.number, version: row.version, revisedFrom: src.id })
    return this.present(row, args.currentUser, costRates)
  },

  async transition(args: { currentUser: AuthUser; id: string; action: 'send' | 'accept' | 'decline' | 'revise' }) {
    if (args.action === 'revise') return this.revise(args)
    assertEditor(args.currentUser)

    const row = await prisma.feeProposal.findUnique({ where: { id: args.id }, include: { lead: true } })
    if (!row) throw new NotFoundError('Propuesta', args.id)
    const now = new Date()

    if (args.action === 'send') {
      if (row.status !== 'DRAFT') throw new InvalidStateError('Solo se puede enviar un borrador')
      if (row.feeUSD <= 0) throw new InvalidStateError('La propuesta no tiene honorarios: agrega horas a alguna fase')
      await prisma.$transaction(async (tx) => {
        await tx.feeProposal.updateMany({
          where: { leadId: row.leadId, status: 'SENT', id: { not: row.id } },
          data: { status: 'SUPERSEDED' },
        })
        await tx.feeProposal.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: now } })
        const advance = ['PROSPECT', 'QUALIFIED'].includes(row.lead.pipelineStage)
        await tx.lead.update({
          where: { id: row.leadId },
          data: {
            estimatedValueUSD: row.feeUSD,
            ...(advance ? { pipelineStage: 'PROPOSAL', closeProbability: Math.max(row.lead.closeProbability, 50) } : {}),
          },
        })
      })
    } else if (args.action === 'accept') {
      if (row.status !== 'SENT') throw new InvalidStateError('Solo se puede aceptar una propuesta enviada')
      if (row.lead.convertedToProjectId) throw new ConflictError('El lead ya fue convertido a proyecto')
      await prisma.$transaction(async (tx) => {
        await tx.feeProposal.updateMany({
          where: { leadId: row.leadId, status: { in: ['DRAFT', 'SENT'] }, id: { not: row.id } },
          data: { status: 'SUPERSEDED' },
        })
        await tx.feeProposal.update({ where: { id: row.id }, data: { status: 'ACCEPTED', decidedAt: now } })
        await tx.lead.update({
          where: { id: row.leadId },
          data: { pipelineStage: 'WON', closeProbability: 100, estimatedValueUSD: row.feeUSD },
        })
      })
    } else {
      if (row.status !== 'SENT') throw new InvalidStateError('Solo se puede rechazar una propuesta enviada')
      await prisma.feeProposal.update({ where: { id: row.id }, data: { status: 'DECLINED', decidedAt: now } })
    }

    await audit(args.currentUser, 'UPDATE', row.id, { action: args.action, number: row.number, version: row.version })
    return this.get({ currentUser: args.currentUser, id: row.id })
  },

  /** The accepted proposal for a lead, parsed, for project conversion. */
  async acceptedForLead(leadId: string) {
    const row = await prisma.feeProposal.findFirst({ where: { leadId, status: 'ACCEPTED' } })
    if (!row) return null
    const phases = parsePhases(row.phases)
    const totals = computeProposal(phases, { discountPercent: row.discountPercent })
    return { row, phases, totals }
  },
}

async function audit(user: AuthUser, action: string, entityId: string, payload: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: { userId: user.id, action, entityType: 'FeeProposal', entityId, payload: payload as Prisma.InputJsonValue },
  })
}
