/**
 * TimeEntryService unit tests — mocks @/lib/prisma and @/lib/time-util.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma = {
    timeEntry: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    task: { update: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return { prisma }
})

vi.mock('@/lib/time-util', () => ({
  recalculateTeamUtilization: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { recalculateTeamUtilization } from '@/lib/time-util'
import { TimeEntryService } from '@/services/TimeEntryService'
import { ForbiddenError, NotFoundError } from '@/lib/result'

const mockPrisma = prisma as unknown as {
  timeEntry: {
    findMany: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  task: { update: ReturnType<typeof vi.fn> }
  auditLog: { create: ReturnType<typeof vi.fn> }
}
const mockRecalc = recalculateTeamUtilization as unknown as ReturnType<typeof vi.fn>

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_1',
    email: 'arch@chao-os.com',
    name: 'Ana Architect',
    role: 'ARCHITECT',
    avatarInitials: 'AA',
    ...overrides,
  } as any
}

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'te_1',
    userId: 'user_1',
    projectId: 'proj_1',
    phaseId: 'phase_1',
    taskId: 'task_1',
    description: 'Design review',
    hours: 2.5,
    date: new Date('2026-06-12'),
    user: { id: 'user_1', name: 'Ana Architect', avatarInitials: 'AA' },
    project: { id: 'proj_1', code: 'P-2026-001', name: 'Tower Renovation' },
    phase: { id: 'phase_1', phase: 'SD', label: 'Schematic Design' },
    task: { id: 'task_1', title: 'Facade study' },
    ...overrides,
  } as any
}

const VALID_CREATE = {
  projectId: 'proj_1',
  phaseId: 'phase_1',
  taskId: 'task_1',
  description: 'Design review',
  hours: 2.5,
  date: '2026-06-12T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TimeEntryService.list', () => {
  it('returns all entries with no filters', async () => {
    mockPrisma.timeEntry.findMany.mockResolvedValue([
      makeEntry(),
      makeEntry({ id: 'te_2' }),
    ])

    const result = await TimeEntryService.list({ currentUser: makeUser() })

    expect(result).toHaveLength(2)
    expect(mockPrisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { date: 'desc' } }),
    )
  })

  it('passes userId and projectId filters when provided', async () => {
    mockPrisma.timeEntry.findMany.mockResolvedValue([])

    await TimeEntryService.list({
      currentUser: makeUser(),
      userId: 'user_9',
      projectId: 'proj_9',
    })

    expect(mockPrisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_9', projectId: 'proj_9' } }),
    )
  })

  it('builds an inclusive date range with end-of-day for the to bound', async () => {
    mockPrisma.timeEntry.findMany.mockResolvedValue([])

    await TimeEntryService.list({
      currentUser: makeUser(),
      from: '2026-06-01',
      to: '2026-06-07',
    })

    expect(mockPrisma.timeEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          date: {
            gte: new Date('2026-06-01'),
            lte: new Date('2026-06-07T23:59:59'),
          },
        },
      }),
    )
  })
})

describe('TimeEntryService.create', () => {
  it('creates the entry for the authenticated user and writes audit log', async () => {
    mockPrisma.timeEntry.create.mockResolvedValue(makeEntry())
    mockRecalc.mockResolvedValue(undefined)

    await TimeEntryService.create({ currentUser: makeUser(), data: VALID_CREATE })

    expect(mockPrisma.timeEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user_1',
          projectId: 'proj_1',
          hours: 2.5,
          date: new Date('2026-06-12T00:00:00.000Z'),
        }),
      }),
    )
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CREATE',
          entityType: 'TimeEntry',
          payload: { hours: 2.5, projectId: 'proj_1' },
        }),
      }),
    )
  })

  it('increments task loggedHours when a taskId is present', async () => {
    mockPrisma.timeEntry.create.mockResolvedValue(makeEntry({ taskId: 'task_1' }))
    mockRecalc.mockResolvedValue(undefined)

    await TimeEntryService.create({ currentUser: makeUser(), data: VALID_CREATE })

    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task_1' },
        data: { loggedHours: { increment: 2.5 } },
      }),
    )
  })

  it('does not touch the task when no taskId is present', async () => {
    const { taskId: _omit, ...noTask } = VALID_CREATE
    mockPrisma.timeEntry.create.mockResolvedValue(makeEntry({ taskId: null }))
    mockRecalc.mockResolvedValue(undefined)

    await TimeEntryService.create({
      currentUser: makeUser(),
      data: { ...noTask, taskId: undefined } as any,
    })

    expect(mockPrisma.task.update).not.toHaveBeenCalled()
  })

  it('recalculates weekly utilization for the user', async () => {
    mockPrisma.timeEntry.create.mockResolvedValue(makeEntry())
    mockRecalc.mockResolvedValue(undefined)

    await TimeEntryService.create({ currentUser: makeUser(), data: VALID_CREATE })

    expect(mockRecalc).toHaveBeenCalledWith('user_1')
  })
})

describe('TimeEntryService.delete', () => {
  it('allows the owner to delete and recalculates for the entry user', async () => {
    const entry = makeEntry()
    mockPrisma.timeEntry.findUnique.mockResolvedValue(entry)
    mockPrisma.timeEntry.delete.mockResolvedValue(entry)
    mockRecalc.mockResolvedValue(undefined)

    await TimeEntryService.delete({ currentUser: makeUser(), id: 'te_1' })

    expect(mockPrisma.timeEntry.delete).toHaveBeenCalledWith({ where: { id: 'te_1' } })
    expect(mockRecalc).toHaveBeenCalledWith('user_1')
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'DELETE', entityType: 'TimeEntry' }),
      }),
    )
  })

  it('allows an ADMIN to delete someone elses entry', async () => {
    mockPrisma.timeEntry.findUnique.mockResolvedValue(makeEntry({ userId: 'user_other' }))
    mockPrisma.timeEntry.delete.mockResolvedValue({})
    mockRecalc.mockResolvedValue(undefined)

    await TimeEntryService.delete({ currentUser: makeUser({ role: 'ADMIN' }), id: 'te_1' })

    expect(mockPrisma.timeEntry.delete).toHaveBeenCalledWith({ where: { id: 'te_1' } })
  })

  it('throws ForbiddenError for a non-owner, non-admin caller', async () => {
    mockPrisma.timeEntry.findUnique.mockResolvedValue(makeEntry({ userId: 'user_other' }))

    await expect(
      TimeEntryService.delete({ currentUser: makeUser(), id: 'te_1' }),
    ).rejects.toThrow(ForbiddenError)
    expect(mockPrisma.timeEntry.delete).not.toHaveBeenCalled()
  })

  it('decrements task loggedHours when the entry has a taskId', async () => {
    const entry = makeEntry({ taskId: 'task_7', hours: 3 })
    mockPrisma.timeEntry.findUnique.mockResolvedValue(entry)
    mockPrisma.timeEntry.delete.mockResolvedValue(entry)
    mockRecalc.mockResolvedValue(undefined)

    await TimeEntryService.delete({ currentUser: makeUser(), id: 'te_1' })

    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'task_7' },
        data: { loggedHours: { decrement: 3 } },
      }),
    )
  })

  it('throws NotFoundError when the entry does not exist', async () => {
    mockPrisma.timeEntry.findUnique.mockResolvedValue(null)

    await expect(
      TimeEntryService.delete({ currentUser: makeUser(), id: 'missing' }),
    ).rejects.toThrow(NotFoundError)
    expect(mockPrisma.timeEntry.delete).not.toHaveBeenCalled()
  })
})