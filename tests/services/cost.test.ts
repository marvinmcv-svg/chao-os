/**
 * CostService — derived project cost. deriveCosts is pure; the DB wiring
 * (row lock, phase/project writes, opening edits, backfill) runs against
 * a mocked Prisma client.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: Record<string, any> = {
    $queryRaw: vi.fn(),
    project: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    phase: { update: vi.fn(), updateMany: vi.fn() },
    timeEntry: { findMany: vi.fn(), update: vi.fn() },
    expense: { findMany: vi.fn() },
    teamMember: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma))
  return { prisma }
})

import { prisma } from '@/lib/prisma'
import { CostAdmin, CostService, deriveCosts, entryCost, type CostInput } from '@/services/CostService'
import { ForbiddenError } from '@/lib/result'

const db = prisma as unknown as Record<string, any>
const PH = (id: string, phase: 'SD' | 'DD' | 'CD' | 'CA', spentUSD = 0, openingSpentUSD = 0) => ({ id, phase, spentUSD, openingSpentUSD })
const base = (over: Partial<CostInput> = {}): CostInput => ({
  migrating: false,
  projectTotalSpentUSD: 0,
  projectOpeningSpentUSD: 0,
  phases: [PH('sd', 'SD'), PH('dd', 'DD'), PH('cd', 'CD'), PH('ca', 'CA')],
  timeEntries: [],
  expenses: [],
  ...over,
})

afterEach(() => {
  delete process.env.DEFAULT_HOURLY_RATE
})

describe('entryCost', () => {
  it('uses the snapshotted rate, then the member rate, then the default', () => {
    expect(entryCost({ hours: 2, costRateUSD: 30, memberRate: 99 })).toBe(60)
    expect(entryCost({ hours: 2, costRateUSD: null, memberRate: 40 })).toBe(80)
    expect(entryCost({ hours: 2, costRateUSD: null, memberRate: null })).toBe(100)
    process.env.DEFAULT_HOURLY_RATE = '35'
    expect(entryCost({ hours: 2, costRateUSD: null })).toBe(70)
  })
})

describe('deriveCosts (steady state)', () => {
  it('rolls labour and approved expenses into phases; unphased costs count only in the total', () => {
    const r = deriveCosts(
      base({
        phases: [PH('sd', 'SD', 0, 1000), PH('dd', 'DD'), PH('cd', 'CD'), PH('ca', 'CA')],
        projectOpeningSpentUSD: 250,
        timeEntries: [
          { hours: 10, costRateUSD: 30, memberRate: null, phaseId: 'dd' },
          { hours: 4, costRateUSD: null, memberRate: 45, phaseId: 'dd' },
          { hours: 2, costRateUSD: 50, memberRate: null, phaseId: null },
          { hours: 1, costRateUSD: 50, memberRate: null, phaseId: 'other-project-phase' },
        ],
        expenses: [
          { amountUSD: 120, phase: 'DD' },
          { amountUSD: 80, phase: null },
        ],
      })
    )
    const dd = r.phases.find((p) => p.id === 'dd')!
    expect(dd).toEqual({ id: 'dd', openingSpentUSD: 0, laborCostUSD: 480, expenseCostUSD: 120, spentUSD: 600 })
    expect(r.phases.find((p) => p.id === 'sd')!.spentUSD).toBe(1000)
    expect(r.unphased).toEqual({ laborCostUSD: 150, expenseCostUSD: 80 })
    expect(r.project).toEqual({ openingSpentUSD: 250, laborCostUSD: 630, laborHours: 17, expenseCostUSD: 200, totalSpentUSD: 1000 + 600 + 150 + 80 + 250 })
  })

  it('opening balances are kept as stored once migrated', () => {
    const r = deriveCosts(base({ phases: [PH('sd', 'SD', 999999, 300), PH('dd', 'DD'), PH('cd', 'CD'), PH('ca', 'CA')], projectTotalSpentUSD: 5_000_000 }))
    expect(r.project.totalSpentUSD).toBe(300)
  })
})

describe('deriveCosts (cutover from manual figures)', () => {
  it('keeps the total identical: openings absorb what tracked costs do not explain', () => {
    // Manual: SD 15,000 + DD 25,000 = 40,000. Tracked: 6,000 unphased labour + 500 DD expense.
    const r = deriveCosts(
      base({
        migrating: true,
        projectTotalSpentUSD: 40000,
        phases: [PH('sd', 'SD', 15000), PH('dd', 'DD', 25000), PH('cd', 'CD'), PH('ca', 'CA')],
        timeEntries: [{ hours: 120, costRateUSD: 50, memberRate: null, phaseId: null }],
        expenses: [{ amountUSD: 500, phase: 'DD' }],
      })
    )
    expect(r.project.totalSpentUSD).toBe(40000)
    const open = r.phases.reduce((a, p) => a + p.openingSpentUSD, 0) + r.project.openingSpentUSD
    expect(open).toBe(33500)
    // DD's own tracked 500 comes out of its opening before scaling
    const sd = r.phases.find((p) => p.id === 'sd')!
    const dd = r.phases.find((p) => p.id === 'dd')!
    expect(sd.openingSpentUSD / (dd.openingSpentUSD)).toBeCloseTo(15000 / 24500, 3)
  })

  it('unexplained remainder goes to the unphased opening when phases are below the total', () => {
    const r = deriveCosts(base({ migrating: true, projectTotalSpentUSD: 10000, phases: [PH('sd', 'SD', 4000), PH('dd', 'DD'), PH('cd', 'CD'), PH('ca', 'CA')] }))
    expect(r.phases[0].openingSpentUSD).toBe(4000)
    expect(r.project.openingSpentUSD).toBe(6000)
    expect(r.project.totalSpentUSD).toBe(10000)
  })

  it('when tracked costs exceed the manual total, the total rises to the tracked cost', () => {
    const r = deriveCosts(
      base({
        migrating: true,
        projectTotalSpentUSD: 1000,
        phases: [PH('sd', 'SD', 1000), PH('dd', 'DD'), PH('cd', 'CD'), PH('ca', 'CA')],
        timeEntries: [{ hours: 30, costRateUSD: 50, memberRate: null, phaseId: 'sd' }],
      })
    )
    expect(r.phases[0]).toMatchObject({ openingSpentUSD: 0, laborCostUSD: 1500, spentUSD: 1500 })
    expect(r.project.totalSpentUSD).toBe(1500)
  })

  it('a new project (all zero) migrates to zero openings', () => {
    const r = deriveCosts(base({ migrating: true }))
    expect(r.project).toEqual({ openingSpentUSD: 0, laborCostUSD: 0, laborHours: 0, expenseCostUSD: 0, totalSpentUSD: 0 })
  })
})

describe('recomputeProject / backfill / openings', () => {
  const ADMIN = { id: 'u_a', role: 'ADMIN' } as any
  const ARCH = { id: 'u_b', role: 'ARCHITECT' } as any
  beforeEach(() => {
    vi.clearAllMocks()
    db.project.findUnique.mockResolvedValue({
      id: 'p1', totalSpentUSD: 0, openingSpentUSD: 100, costsDerivedAt: new Date(),
      phases: [PH('sd', 'SD', 0, 0)],
    })
    db.timeEntry.findMany.mockResolvedValue([{ hours: 2, costRateUSD: 40, phaseId: 'sd', user: { teamMember: null } }])
    db.expense.findMany.mockResolvedValue([{ amountUSD: 20, phase: null }])
  })

  it('locks the project row, reads only approved/reimbursed expenses, writes phases and totals', async () => {
    await CostService.recomputeProject('p1')
    expect(db.$queryRaw).toHaveBeenCalled()
    expect(String(db.$queryRaw.mock.calls[0][0].join('?'))).toContain('FOR UPDATE')
    expect(db.expense.findMany.mock.calls[0][0].where).toEqual({ projectId: 'p1', status: { in: ['APPROVED', 'REIMBURSED'] } })
    expect(db.phase.update).toHaveBeenCalledWith({ where: { id: 'sd' }, data: { openingSpentUSD: 0, laborCostUSD: 80, expenseCostUSD: 0, spentUSD: 80 } })
    expect(db.project.update.mock.calls[0][0].data).toMatchObject({ totalSpentUSD: 200, laborCostUSD: 80, expenseCostUSD: 20, openingSpentUSD: 100, costsDerivedAt: expect.any(Date) })
  })

  it('refresh never throws', async () => {
    db.$transaction.mockRejectedValueOnce(new Error('db down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(CostService.refresh('p1')).resolves.toBeUndefined()
    spy.mockRestore()
  })

  it('backfill snapshots legacy entry rates, then recomputes every project', async () => {
    db.timeEntry.findMany.mockResolvedValueOnce([{ id: 't1', user: { teamMember: { hourlyRate: 33 } } }, { id: 't2', user: { teamMember: null } }])
    db.project.findMany.mockResolvedValue([{ id: 'p1', costsDerivedAt: null }, { id: 'p2', costsDerivedAt: new Date() }])
    const r = await CostService.backfill()
    expect(db.timeEntry.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { costRateUSD: 33 } })
    expect(db.timeEntry.update).toHaveBeenCalledWith({ where: { id: 't2' }, data: { costRateUSD: 50 } })
    expect(r).toEqual({ snapshotted: 2, projects: 2, migrated: 1 })
  })

  it('rateFor uses the member rate or the default', async () => {
    db.teamMember.findUnique.mockResolvedValueOnce({ hourlyRate: 61 }).mockResolvedValueOnce(null)
    expect(await CostService.rateFor('u1')).toBe(61)
    expect(await CostService.rateFor('u2')).toBe(50)
  })

  it('opening balances: admins only; written per phase and unphased, then recomputed', async () => {
    await expect(CostAdmin.setOpening({ currentUser: ARCH, projectId: 'p1', data: { phases: { SD: 1 } } })).rejects.toBeInstanceOf(ForbiddenError)
    db.project.findUnique.mockImplementation((args: any) =>
      Promise.resolve(
        args.select?.phases?.orderBy
          ? { id: 'p1', totalBudgetUSD: 1000, totalSpentUSD: 0, openingSpentUSD: 0, laborCostUSD: 0, laborHours: 0, expenseCostUSD: 0, costsDerivedAt: new Date(), phases: [] }
          : { id: 'p1', totalSpentUSD: 0, openingSpentUSD: 0, costsDerivedAt: new Date(), phases: [PH('sd', 'SD')] }
      )
    )
    await CostAdmin.setOpening({ currentUser: ADMIN, projectId: 'p1', data: { phases: { SD: 1234.567 }, unphasedUSD: 50 } })
    expect(db.phase.updateMany).toHaveBeenCalledWith({ where: { projectId: 'p1', phase: 'SD' }, data: { openingSpentUSD: 1234.57 } })
    expect(db.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { openingSpentUSD: 50 } })
    expect(db.$queryRaw).toHaveBeenCalled() // recomputed afterwards
  })
})
