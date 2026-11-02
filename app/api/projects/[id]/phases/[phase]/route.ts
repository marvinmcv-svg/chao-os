import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { NotFoundError, ValidationError } from '@/lib/result'
import { UpdatePhaseProgressSchema } from '@/lib/validations'

const PHASES = ['SD', 'DD', 'CD', 'CA'] as const

/**
 * PATCH /api/projects/:id/phases/:phase — update one phase's progress/status.
 * Keeps the project roll-up consistent: overall progress is recomputed as the
 * fee-weighted average of phase progress, and the project's current phase
 * follows the first phase that is not complete.
 */
export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string; phase: string } }) => {
    const user = await requireAuth()
    if (!PHASES.includes(params.phase as (typeof PHASES)[number])) {
      throw new ValidationError(`Fase inválida: ${params.phase}`, 'phase')
    }
    const body = UpdatePhaseProgressSchema.parse(await req.json())
    const phaseKey = params.phase as (typeof PHASES)[number]

    const existing = await prisma.phase.findUnique({ where: { projectId_phase: { projectId: params.id, phase: phaseKey } } })
    if (!existing) throw new NotFoundError('Phase', `${params.id}/${params.phase}`)

    let progressPercent = body.progressPercent ?? existing.progressPercent
    let status = body.status ?? existing.status
    if (body.progressPercent != null && body.status == null) {
      status = progressPercent >= 100 ? 'COMPLETE' : progressPercent > 0 ? 'IN_PROGRESS' : 'NOT_STARTED'
    }
    if (status === 'COMPLETE') progressPercent = 100

    return prisma.$transaction(async (tx) => {
      await tx.phase.update({
        where: { id: existing.id },
        data: {
          progressPercent,
          status,
          ...(status !== 'NOT_STARTED' && !existing.startDate ? { startDate: new Date() } : {}),
          ...(status === 'COMPLETE' && !existing.endDate ? { endDate: new Date() } : {}),
        },
      })
      const phases = await tx.phase.findMany({ where: { projectId: params.id } })
      const fee = phases.reduce((s, p) => s + p.budgetUSD, 0)
      const overall = fee > 0 ? Math.round(phases.reduce((s, p) => s + p.budgetUSD * p.progressPercent, 0) / fee) : 0
      const current = PHASES.find((k) => phases.find((p) => p.phase === k)?.status !== 'COMPLETE') ?? 'CA'
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'UPDATE',
          entityType: 'Phase',
          entityId: existing.id,
          payload: { from: { progressPercent: existing.progressPercent, status: existing.status }, to: { progressPercent, status } },
        },
      })
      return tx.project.update({
        where: { id: params.id },
        data: { overallProgressPercent: overall, currentPhase: current },
        include: { phases: { orderBy: { phase: 'asc' } } },
      })
    })
  },
)
