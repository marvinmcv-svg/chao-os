/**
 * CostService — derived project cost (roadmap item 7).
 *
 * Project.totalSpentUSD and Phase.spentUSD used to be typed in once and
 * never moved. They are now derived from:
 *   - labour: hours × the cost rate snapshotted on each time entry
 *     (TimeEntry.costRateUSD; legacy entries fall back to the member's
 *     current rate, then DEFAULT_HOURLY_RATE)
 *   - approved / reimbursed expenses
 *   - an opening balance: cost incurred before CHAO OS tracked it
 *
 * Cutover: the first recompute of a project (costsDerivedAt = null) turns
 * whatever the old manual figure has beyond the tracked costs into the
 * opening balance, per phase and for the unphased remainder. Totals don't
 * jump on deploy; from then on they move with timesheets and expenses.
 *
 * Costs without a phase (time entries with no phaseId, expenses with no
 * phase) count toward the project total but not toward any phase.
 *
 * Each recompute locks the project row (SELECT … FOR UPDATE) so two
 * concurrent recomputes can't write a stale total over a fresh one.
 */
import { z } from 'zod'
import type { Prisma, ProjectPhase } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'
import { ForbiddenError, NotFoundError } from '@/lib/result'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export const defaultHourlyRate = () => Number(process.env.DEFAULT_HOURLY_RATE) || 50

/** Cost of one time entry: snapshot rate, else member rate, else default. */
export function entryCost(e: { hours: number; costRateUSD: number | null; memberRate?: number | null }) {
  return e.hours * (e.costRateUSD ?? e.memberRate ?? defaultHourlyRate())
}

export interface CostInput {
  /** true until the first derived recompute (manual figures still in place) */
  migrating: boolean
  projectTotalSpentUSD: number
  projectOpeningSpentUSD: number
  phases: { id: string; phase: ProjectPhase; spentUSD: number; openingSpentUSD: number }[]
  timeEntries: { hours: number; costRateUSD: number | null; memberRate: number | null; phaseId: string | null }[]
  /** Approved / reimbursed only */
  expenses: { amountUSD: number; phase: ProjectPhase | null }[]
}

export interface CostResult {
  phases: { id: string; openingSpentUSD: number; laborCostUSD: number; expenseCostUSD: number; spentUSD: number }[]
  project: { openingSpentUSD: number; laborCostUSD: number; laborHours: number; expenseCostUSD: number; totalSpentUSD: number }
  unphased: { laborCostUSD: number; expenseCostUSD: number }
}

/** Pure cost roll-up (unit-tested). */
export function deriveCosts(input: CostInput): CostResult {
  const phaseIds = new Set(input.phases.map((p) => p.id))
  const idByEnum = new Map(input.phases.map((p) => [p.phase, p.id]))
  const labor = new Map<string, number>()
  const exp = new Map<string, number>()
  let unLabor = 0
  let unExp = 0
  let hours = 0

  for (const t of input.timeEntries) {
    const c = entryCost(t)
    hours += t.hours
    if (t.phaseId && phaseIds.has(t.phaseId)) labor.set(t.phaseId, (labor.get(t.phaseId) ?? 0) + c)
    else unLabor += c
  }
  for (const e of input.expenses) {
    const id = e.phase ? idByEnum.get(e.phase) : undefined
    if (id) exp.set(id, (exp.get(id) ?? 0) + e.amountUSD)
    else unExp += e.amountUSD
  }

  const unphased = { laborCostUSD: round2(unLabor), expenseCostUSD: round2(unExp) }
  const tracked = input.phases.map((p) => ({ labor: round2(labor.get(p.id) ?? 0), exp: round2(exp.get(p.id) ?? 0) }))
  const trackedTotal = tracked.reduce((a, t) => a + t.labor + t.exp, 0) + unphased.laborCostUSD + unphased.expenseCostUSD

  let openings: number[]
  let projectOpening: number
  if (input.migrating) {
    // Cutover: the old manual total already included everything spent so far,
    // tracked or not. Opening total = old total − tracked costs (≥ 0). Phase
    // openings take what their old figure has beyond their tracked costs,
    // scaled down if that exceeds the opening total; the rest is unphased.
    const openingTotal = Math.max(0, input.projectTotalSpentUSD - trackedTotal)
    const raw = input.phases.map((p, i) => Math.max(0, p.spentUSD - tracked[i].labor - tracked[i].exp))
    const rawSum = raw.reduce((a, v) => a + v, 0)
    const scale = rawSum > openingTotal && rawSum > 0 ? openingTotal / rawSum : 1
    openings = raw.map((v) => round2(v * scale))
    projectOpening = Math.max(0, round2(openingTotal - openings.reduce((a, v) => a + v, 0)))
  } else {
    openings = input.phases.map((p) => round2(p.openingSpentUSD))
    projectOpening = round2(input.projectOpeningSpentUSD)
  }

  const phases = input.phases.map((p, i) => {
    const { labor: laborCostUSD, exp: expenseCostUSD } = tracked[i]
    const openingSpentUSD = openings[i]
    return { id: p.id, openingSpentUSD, laborCostUSD, expenseCostUSD, spentUSD: round2(openingSpentUSD + laborCostUSD + expenseCostUSD) }
  })
  const phaseSum = phases.reduce((a, p) => a + p.spentUSD, 0)

  const laborCostUSD = round2(phases.reduce((a, p) => a + p.laborCostUSD, 0) + unphased.laborCostUSD)
  const expenseCostUSD = round2(phases.reduce((a, p) => a + p.expenseCostUSD, 0) + unphased.expenseCostUSD)
  return {
    phases,
    unphased,
    project: {
      openingSpentUSD: projectOpening,
      laborCostUSD,
      laborHours: round2(hours),
      expenseCostUSD,
      totalSpentUSD: round2(phaseSum + unphased.laborCostUSD + unphased.expenseCostUSD + projectOpening),
    },
  }
}

async function recomputeIn(tx: Prisma.TransactionClient, projectId: string) {
  // Serialize recomputes of the same project.
  await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      totalSpentUSD: true,
      openingSpentUSD: true,
      costsDerivedAt: true,
      phases: { select: { id: true, phase: true, spentUSD: true, openingSpentUSD: true } },
    },
  })
  if (!project) return null
  const [entries, expenses] = await Promise.all([
    tx.timeEntry.findMany({
      where: { projectId },
      select: { hours: true, costRateUSD: true, phaseId: true, user: { select: { teamMember: { select: { hourlyRate: true } } } } },
    }),
    tx.expense.findMany({ where: { projectId, status: { in: ['APPROVED', 'REIMBURSED'] } }, select: { amountUSD: true, phase: true } }),
  ])
  const r = deriveCosts({
    migrating: !project.costsDerivedAt,
    projectTotalSpentUSD: project.totalSpentUSD,
    projectOpeningSpentUSD: project.openingSpentUSD,
    phases: project.phases,
    timeEntries: entries.map((e) => ({ hours: e.hours, costRateUSD: e.costRateUSD, phaseId: e.phaseId, memberRate: e.user.teamMember?.hourlyRate ?? null })),
    expenses,
  })
  for (const p of r.phases) {
    await tx.phase.update({ where: { id: p.id }, data: { openingSpentUSD: p.openingSpentUSD, laborCostUSD: p.laborCostUSD, expenseCostUSD: p.expenseCostUSD, spentUSD: p.spentUSD } })
  }
  await tx.project.update({ where: { id: projectId }, data: { ...r.project, costsDerivedAt: new Date() } })
  return r
}

export const CostService = {
  /** Cost rate to snapshot on a new time entry. */
  async rateFor(userId: string) {
    const m = await prisma.teamMember.findUnique({ where: { userId }, select: { hourlyRate: true } })
    return m?.hourlyRate ?? defaultHourlyRate()
  },

  async recomputeProject(projectId: string) {
    return prisma.$transaction((tx) => recomputeIn(tx, projectId))
  },

  /**
   * Recompute after a mutation. Never fails the caller's request (the data
   * change already happened); a failure is logged and fixed by the next
   * recompute or the deploy-time backfill.
   */
  async refresh(projectId: string) {
    try {
      await this.recomputeProject(projectId)
    } catch (e) {
      console.error(`[costs] recompute failed for project ${projectId}`, e)
    }
  },

  /**
   * Deploy-time backfill (idempotent): snapshot cost rates on legacy time
   * entries at the member's current rate, then recompute every project.
   */
  async backfill() {
    const legacy = await prisma.timeEntry.findMany({
      where: { costRateUSD: null },
      select: { id: true, user: { select: { teamMember: { select: { hourlyRate: true } } } } },
    })
    for (const e of legacy) {
      await prisma.timeEntry.update({ where: { id: e.id }, data: { costRateUSD: e.user.teamMember?.hourlyRate ?? defaultHourlyRate() } })
    }
    const projects = await prisma.project.findMany({ select: { id: true, costsDerivedAt: true } })
    let migrated = 0
    for (const p of projects) {
      if (!p.costsDerivedAt) migrated++
      await this.recomputeProject(p.id)
    }
    return { snapshotted: legacy.length, projects: projects.length, migrated }
  },
}

// ─── Opening balances (principals / admins) ─────────────────────────────


export const COST_EDIT_ROLES = new Set(['PRINCIPAL', 'ADMIN'])

const money = z.number().finite().min(0, 'No puede ser negativo').max(100_000_000)
export const openingSchema = z.object({
  phases: z.object({ SD: money, DD: money, CD: money, CA: money }).partial().default({}),
  unphasedUSD: money.optional(),
})

export const CostAdmin = {
  async breakdown(args: { currentUser: AuthUser; projectId: string }) {
    const p = await prisma.project.findUnique({
      where: { id: args.projectId },
      select: {
        id: true, totalBudgetUSD: true, totalSpentUSD: true, openingSpentUSD: true, laborCostUSD: true, laborHours: true, expenseCostUSD: true, costsDerivedAt: true,
        phases: { orderBy: { phase: 'asc' }, select: { phase: true, budgetUSD: true, spentUSD: true, openingSpentUSD: true, laborCostUSD: true, expenseCostUSD: true } },
      },
    })
    if (!p) throw new NotFoundError('Proyecto', args.projectId)
    const phaseLabor = p.phases.reduce((a, x) => a + x.laborCostUSD, 0)
    const phaseExp = p.phases.reduce((a, x) => a + x.expenseCostUSD, 0)
    return {
      ...p,
      unphased: { laborCostUSD: round2(p.laborCostUSD - phaseLabor), expenseCostUSD: round2(p.expenseCostUSD - phaseExp), openingSpentUSD: p.openingSpentUSD },
      canEdit: COST_EDIT_ROLES.has(args.currentUser.role),
    }
  },

  async setOpening(args: { currentUser: AuthUser; projectId: string; data: z.infer<typeof openingSchema> }) {
    if (!COST_EDIT_ROLES.has(args.currentUser.role)) throw new ForbiddenError('Solo dirección y administración ajustan saldos iniciales de costo')
    const project = await prisma.project.findUnique({ where: { id: args.projectId }, select: { id: true, costsDerivedAt: true } })
    if (!project) throw new NotFoundError('Proyecto', args.projectId)
    // Make sure the project is on derived costs first, so the cutover can't overwrite these values
    if (!project.costsDerivedAt) await CostService.recomputeProject(project.id)
    await prisma.$transaction(async (tx) => {
      for (const [phase, v] of Object.entries(args.data.phases)) {
        if (v === undefined) continue
        await tx.phase.updateMany({ where: { projectId: project.id, phase: phase as ProjectPhase }, data: { openingSpentUSD: round2(v) } })
      }
      if (args.data.unphasedUSD !== undefined) await tx.project.update({ where: { id: project.id }, data: { openingSpentUSD: round2(args.data.unphasedUSD) } })
      await tx.auditLog.create({
        data: { userId: args.currentUser.id, action: 'UPDATE', entityType: 'ProjectCostOpening', entityId: project.id, payload: args.data as Prisma.InputJsonValue },
      })
    })
    await CostService.recomputeProject(project.id)
    return this.breakdown(args)
  },
}
