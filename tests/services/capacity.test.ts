/**
 * CapacityService unit tests — mocks @/lib/prisma.
 * Covers permissions, the absence approval flow, allocation upsert /
 * move-merge semantics, and the planner grid aggregation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('@/lib/prisma', () => {
  const prisma: Record<string, any> = {
    teamMember: { findUnique: vi.fn(), findMany: vi.fn() },
    timeOff: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    studioHoliday: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    allocation: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    project: { findUnique: vi.fn(), findMany: vi.fn() },
    phase: { findFirst: vi.fn() },
    task: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    notification: { create: vi.fn() },
  }
  prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma))
  return { prisma }
})

import { prisma } from '@/lib/prisma'
import { CapacityService } from '@/services/CapacityService'
import { ForbiddenError, InvalidStateError, ValidationError } from '@/lib/result'

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

const user = (role: string, id = `u_${role.toLowerCase()}`) =>
  ({ id, role, name: role, email: `${id}@x.bo`, avatarInitials: 'XX' }) as any

const ADMIN = user('ADMIN')
const SENIOR = user('ARCHITECT_SENIOR')
const ARCH = user('ARCHITECT', 'u_arch')

beforeEach(() => {
  vi.clearAllMocks()
  db.teamMember.findUnique.mockResolvedValue({ id: 'tm' })
  db.timeOff.findFirst.mockResolvedValue(null)
  db.timeOff.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'to_1', ...data, user: { name: 'Ana' } }))
  db.user.findMany.mockResolvedValue([{ id: 'u_principal' }, { id: 'u_admin' }])
  db.notification.create.mockResolvedValue({})
})

// ─── Time-off ────────────────────────────────────────────────────────────────

describe('CapacityService.createTimeOff', () => {
  const input = { type: 'VACATION' as const, startDate: '2026-12-01', endDate: '2026-12-05', note: '' }

  it('creates a PENDING request for yourself and notifies approvers', async () => {
    const res = await CapacityService.createTimeOff({ currentUser: ARCH, data: input })
    expect(res.status).toBe('PENDING')
    expect(db.timeOff.create.mock.calls[0][0].data).toMatchObject({
      userId: 'u_arch',
      startDate: new Date('2026-12-01T00:00:00Z'),
      endDate: new Date('2026-12-05T00:00:00Z'),
    })
    expect(db.notification.create).toHaveBeenCalledTimes(2)
  })

  it('auto-approves when a director registers it, for anyone', async () => {
    const res = await CapacityService.createTimeOff({ currentUser: ADMIN, data: { ...input, userId: 'u_arch' } })
    expect(res).toMatchObject({ status: 'APPROVED', reviewedById: ADMIN.id, userId: 'u_arch' })
    expect(db.notification.create).not.toHaveBeenCalled()
  })

  it('forbids an architect from registering absences for someone else', async () => {
    await expect(CapacityService.createTimeOff({ currentUser: ARCH, data: { ...input, userId: 'u_other' } })).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('rejects overlapping non-rejected absences', async () => {
    db.timeOff.findFirst.mockResolvedValue({ id: 'existing' })
    await expect(CapacityService.createTimeOff({ currentUser: ARCH, data: input })).rejects.toBeInstanceOf(ValidationError)
    expect(db.timeOff.findFirst.mock.calls[0][0].where.status).toEqual({ not: 'REJECTED' })
  })

  it('rejects people who are not on the team', async () => {
    db.teamMember.findUnique.mockResolvedValue(null)
    await expect(CapacityService.createTimeOff({ currentUser: ADMIN, data: { ...input, userId: 'ghost' } })).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('CapacityService.reviewTimeOff / deleteTimeOff', () => {
  const pending = { id: 'to_1', userId: 'u_arch', status: 'PENDING', startDate: new Date('2026-12-01T00:00:00Z'), endDate: new Date('2026-12-05T00:00:00Z') }

  it('only directors can review', async () => {
    await expect(CapacityService.reviewTimeOff({ currentUser: SENIOR, id: 'to_1', status: 'APPROVED' })).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('approves and notifies the requester', async () => {
    db.timeOff.findUnique.mockResolvedValue(pending)
    db.timeOff.update.mockResolvedValue({ ...pending, status: 'APPROVED' })
    await CapacityService.reviewTimeOff({ currentUser: ADMIN, id: 'to_1', status: 'APPROVED' })
    expect(db.timeOff.update.mock.calls[0][0].data).toMatchObject({ status: 'APPROVED', reviewedById: ADMIN.id })
    expect(db.notification.create.mock.calls[0][0].data).toMatchObject({ userId: 'u_arch', title: 'Ausencia aprobada' })
  })

  it('refuses to review twice', async () => {
    db.timeOff.findUnique.mockResolvedValue({ ...pending, status: 'APPROVED' })
    await expect(CapacityService.reviewTimeOff({ currentUser: ADMIN, id: 'to_1', status: 'REJECTED' })).rejects.toBeInstanceOf(InvalidStateError)
  })

  it('lets the owner withdraw a pending request but not an approved one', async () => {
    db.timeOff.findUnique.mockResolvedValueOnce(pending)
    await expect(CapacityService.deleteTimeOff({ currentUser: ARCH, id: 'to_1' })).resolves.toEqual({ id: 'to_1' })
    db.timeOff.findUnique.mockResolvedValueOnce({ ...pending, status: 'APPROVED' })
    await expect(CapacityService.deleteTimeOff({ currentUser: ARCH, id: 'to_1' })).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('CapacityService holidays', () => {
  it('only directors add closures; duplicates are a validation error', async () => {
    await expect(CapacityService.createHoliday({ currentUser: SENIOR, data: { date: '2026-12-24', name: 'Nochebuena' } })).rejects.toBeInstanceOf(ForbiddenError)
    db.studioHoliday.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }))
    await expect(CapacityService.createHoliday({ currentUser: ADMIN, data: { date: '2026-12-24', name: 'Nochebuena' } })).rejects.toBeInstanceOf(ValidationError)
  })

  it('lists statutory holidays merged with closures', async () => {
    db.studioHoliday.findMany.mockResolvedValue([{ id: 'c1', date: new Date('2026-12-24T00:00:00Z'), name: 'Nochebuena' }])
    const res = await CapacityService.listHolidays({ from: '2026-12-01', to: '2026-12-31' })
    expect(res.holidays.map((h) => h.name)).toEqual(['Nochebuena', 'Navidad'])
  })
})

// ─── Allocations ─────────────────────────────────────────────────────────────

describe('CapacityService.upsertAllocation', () => {
  const base = { userId: 'u_arch', projectId: 'p1', phaseId: 'ph1', weekStart: '2026-11-11', hours: 16, repeatWeeks: 1 }

  beforeEach(() => {
    db.project.findUnique.mockResolvedValue({ id: 'p1', status: 'ON_TRACK', phases: [{ id: 'ph1' }] })
    db.allocation.upsert.mockImplementation(({ create }: any) => Promise.resolve({ id: 'a', ...create }))
  })

  it('requires a planner role', async () => {
    await expect(CapacityService.upsertAllocation({ currentUser: ARCH, data: base })).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('normalises to Monday and repeats across consecutive weeks', async () => {
    const res = await CapacityService.upsertAllocation({ currentUser: SENIOR, data: { ...base, repeatWeeks: 3 } })
    expect(res).toHaveLength(3)
    expect(db.allocation.upsert.mock.calls.map((c: any[]) => c[0].create.weekStart.toISOString().slice(0, 10))).toEqual([
      '2026-11-09',
      '2026-11-16',
      '2026-11-23',
    ])
  })

  it('treats 0 hours as removal', async () => {
    await CapacityService.upsertAllocation({ currentUser: SENIOR, data: { ...base, hours: 0 } })
    expect(db.allocation.deleteMany).toHaveBeenCalledTimes(1)
    expect(db.allocation.upsert).not.toHaveBeenCalled()
  })

  it('rejects completed projects and foreign phases', async () => {
    db.project.findUnique.mockResolvedValueOnce({ id: 'p1', status: 'COMPLETED', phases: [] })
    await expect(CapacityService.upsertAllocation({ currentUser: SENIOR, data: base })).rejects.toBeInstanceOf(InvalidStateError)
    await expect(CapacityService.upsertAllocation({ currentUser: SENIOR, data: { ...base, phaseId: 'other' } })).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('CapacityService.updateAllocation (drag-to-reassign)', () => {
  const current = { id: 'a1', userId: 'u_arch', projectId: 'p1', phaseId: null, weekStart: new Date('2026-11-09T00:00:00Z'), hours: 12 }

  beforeEach(() => {
    db.allocation.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.id === 'a1' ? current : null),
    )
    db.allocation.update.mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data }))
  })

  it('moves to an empty cell', async () => {
    const res = await CapacityService.updateAllocation({ currentUser: SENIOR, id: 'a1', data: { userId: 'u_b', weekStart: '2026-11-18' } })
    expect(res.merged).toBe(false)
    expect(db.allocation.update.mock.calls[0][0].data).toMatchObject({ userId: 'u_b', weekStart: new Date('2026-11-16T00:00:00Z'), hours: 12 })
  })

  it('merges into an existing allocation of the same project', async () => {
    db.allocation.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.id === 'a1' ? current : { id: 'a2', hours: 10 }),
    )
    const res = await CapacityService.updateAllocation({ currentUser: SENIOR, id: 'a1', data: { userId: 'u_b' } })
    expect(res).toMatchObject({ merged: true, deleted: 'a1' })
    expect(db.allocation.delete).toHaveBeenCalledWith({ where: { id: 'a1' } })
    expect(db.allocation.update.mock.calls[0][0]).toMatchObject({ where: { id: 'a2' }, data: { hours: 22 } })
  })

  it('deletes when hours are set to 0', async () => {
    const res = await CapacityService.updateAllocation({ currentUser: SENIOR, id: 'a1', data: { hours: 0 } })
    expect(res.deleted).toBe('a1')
    expect(db.allocation.delete).toHaveBeenCalled()
  })

  it('requires a planner role', async () => {
    await expect(CapacityService.updateAllocation({ currentUser: ARCH, id: 'a1', data: { hours: 4 } })).rejects.toBeInstanceOf(ForbiddenError)
  })
})

// ─── Planner grid ────────────────────────────────────────────────────────────

describe('CapacityService.getPlanner', () => {
  it('builds availability-adjusted cells with allocations and task demand', async () => {
    db.teamMember.findMany.mockResolvedValue([
      { userId: 'u_a', weeklyHoursCapacity: 40, role: 'Arquitecta', user: { id: 'u_a', name: 'Ana', avatarInitials: 'AN' } },
    ])
    db.allocation.findMany.mockResolvedValue([
      { id: 'a1', userId: 'u_a', projectId: 'p1', phaseId: null, weekStart: new Date('2026-11-02T00:00:00Z'), hours: 20, note: '', project: { id: 'p1', code: 'P-1', name: 'Casa' }, phase: null },
      { id: 'a2', userId: 'u_a', projectId: 'p2', phaseId: null, weekStart: new Date('2026-11-02T00:00:00Z'), hours: 16, note: '', project: { id: 'p2', code: 'P-2', name: 'Torre' }, phase: null },
    ])
    db.task.findMany.mockResolvedValue([
      { assignedToId: 'u_a', estimatedHours: 10, loggedHours: 4, dueDate: new Date('2026-10-20T12:00:00Z') }, // overdue → first week
      { assignedToId: 'u_a', estimatedHours: 8, loggedHours: 0, dueDate: new Date('2026-11-12T12:00:00Z') },
    ])
    db.project.findMany.mockResolvedValue([])
    db.studioHoliday.findMany.mockResolvedValue([])
    db.timeOff.findMany.mockResolvedValue([])

    const res = await CapacityService.getPlanner({ currentUser: SENIOR, weeks: 2, from: '2026-11-04' })

    expect(res.weeks.map((w) => w.start)).toEqual(['2026-11-02', '2026-11-09'])
    expect(res.weeks[0].holidays.map((h) => h.name)).toEqual(['Todos Santos'])
    const [w0, w1] = res.members[0].cells
    expect(w0).toMatchObject({ capacity: 32, holidayDays: 1, allocated: 36, pct: 113, taskHours: 6 })
    expect(w0.allocations.map((a) => a.code)).toEqual(['P-1', 'P-2'])
    expect(w1).toMatchObject({ capacity: 40, allocated: 0, taskHours: 8 })
    expect(res.weeks[0].totals).toEqual({ capacity: 32, allocated: 36 })
    expect(res.canEdit).toBe(true)
  })
})
