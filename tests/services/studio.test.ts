/**
 * StudioService unit tests — mocks @/lib/prisma.
 * Covers the capacity grid + the N+1 regression guard (groupBy must be
 * used instead of per-member aggregate/count queries).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma = {
    teamMember: { findMany: vi.fn() },
    timeEntry: {
      groupBy: vi.fn(),
      aggregate: vi.fn(),
    },
    task: {
      groupBy: vi.fn(),
      count: vi.fn(),
    },
  }
  return { prisma }
})

import { prisma } from '@/lib/prisma'
import { StudioService } from '@/services/StudioService'

const mockPrisma = prisma as unknown as {
  teamMember: { findMany: ReturnType<typeof vi.fn> }
  timeEntry: {
    groupBy: ReturnType<typeof vi.fn>
    aggregate: ReturnType<typeof vi.fn>
  }
  task: {
    groupBy: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
  }
}

function makeUser() {
  return {
    id: 'user_1',
    email: 'admin@chao-os.com',
    name: 'Ada Admin',
    role: 'ADMIN',
    avatarInitials: 'AA',
  } as any
}

function makeMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tm_1',
    userId: 'user_1',
    role: 'ARCHITECT',
    weeklyHoursCapacity: 40,
    weeklyHoursLogged: 0,
    utilizationPercent: 0,
    startDate: new Date('2026-01-01'),
    hourlyRate: 50,
    user: {
      id: 'user_1',
      name: 'Ana Architect',
      avatarInitials: 'AA',
      role: 'ARCHITECT',
      capacityPercent: 80,
    },
    ...overrides,
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('StudioService.getCapacity', () => {
  it('returns empty members and zeroed summary when there are no team members', async () => {
    mockPrisma.teamMember.findMany.mockResolvedValue([])
    mockPrisma.timeEntry.groupBy.mockResolvedValue([])
    mockPrisma.task.groupBy.mockResolvedValue([])

    const result = await StudioService.getCapacity({ currentUser: makeUser() })

    expect(result.members).toEqual([])
    expect(result.summary).toEqual({
      avgUtilization: 0,
      overloadedCount: 0,
      totalCapacity: 0,
      totalLogged: 0,
      totalAvailable: 0,
    })
  })

  it('computes utilization and logged hours from the batched groupBy', async () => {
    mockPrisma.teamMember.findMany.mockResolvedValue([
      makeMember({ weeklyHoursCapacity: 40 }),
    ])
    // user_1 logged 20 hours this week
    mockPrisma.timeEntry.groupBy.mockResolvedValue([
      { userId: 'user_1', _sum: { hours: 20 } },
    ])
    mockPrisma.task.groupBy.mockResolvedValue([
      { assignedToId: 'user_1', _count: { _all: 3 } },
    ])

    const result = await StudioService.getCapacity({ currentUser: makeUser() })

    expect(result.members[0]).toMatchObject({
      weeklyHoursLogged: 20,
      utilizationPercent: 50,
      activeTasks: 3,
      isOverloaded: false,
    })
  })

  it('flags members as overloaded at >= 90% utilization', async () => {
    mockPrisma.teamMember.findMany.mockResolvedValue([
      makeMember({ id: 'tm_over', userId: 'user_over', weeklyHoursCapacity: 40 }),
    ])
    mockPrisma.timeEntry.groupBy.mockResolvedValue([
      { userId: 'user_over', _sum: { hours: 36 } },
    ])
    mockPrisma.task.groupBy.mockResolvedValue([])

    const result = await StudioService.getCapacity({ currentUser: makeUser() })

    expect(result.members[0].utilizationPercent).toBe(90)
    expect(result.members[0].isOverloaded).toBe(true)
  })

  it('sorts members by utilization percent descending', async () => {
    mockPrisma.teamMember.findMany.mockResolvedValue([
      makeMember({
        id: 'tm_1',
        userId: 'user_1',
        weeklyHoursCapacity: 40,
        user: { id: 'user_1', name: 'Low', avatarInitials: 'L', role: 'ARCHITECT', capacityPercent: 80 },
      }),
      makeMember({
        id: 'tm_2',
        userId: 'user_2',
        weeklyHoursCapacity: 40,
        user: { id: 'user_2', name: 'High', avatarInitials: 'H', role: 'ARCHITECT', capacityPercent: 80 },
      }),
    ])
    mockPrisma.timeEntry.groupBy.mockResolvedValue([
      { userId: 'user_1', _sum: { hours: 10 } }, // 25%
      { userId: 'user_2', _sum: { hours: 32 } }, // 80%
    ])
    mockPrisma.task.groupBy.mockResolvedValue([])

    const result = await StudioService.getCapacity({ currentUser: makeUser() })

    expect(result.members[0].userId).toBe('user_2')
    expect(result.members[1].userId).toBe('user_1')
  })

  it('computes the summary aggregates across all members', async () => {
    mockPrisma.teamMember.findMany.mockResolvedValue([
      makeMember({
        id: 'tm_1',
        userId: 'user_1',
        weeklyHoursCapacity: 40,
        user: { id: 'user_1', name: 'A', avatarInitials: 'A', role: 'ARCHITECT', capacityPercent: 80 },
      }),
      makeMember({
        id: 'tm_2',
        userId: 'user_2',
        weeklyHoursCapacity: 30,
        user: { id: 'user_2', name: 'B', avatarInitials: 'B', role: 'BIM', capacityPercent: 80 },
      }),
    ])
    mockPrisma.timeEntry.groupBy.mockResolvedValue([
      { userId: 'user_1', _sum: { hours: 40 } }, // 100% -> overloaded
      { userId: 'user_2', _sum: { hours: 15 } }, // 50%
    ])
    mockPrisma.task.groupBy.mockResolvedValue([])

    const result = await StudioService.getCapacity({ currentUser: makeUser() })

    expect(result.summary).toEqual({
      avgUtilization: 75,
      overloadedCount: 1,
      totalCapacity: 70,
      totalLogged: 55,
      totalAvailable: 15,
    })
  })

  it('uses only batched groupBy queries (N+1 regression guard)', async () => {
    mockPrisma.teamMember.findMany.mockResolvedValue([
      makeMember(),
      makeMember({ id: 'tm_2', userId: 'user_2' }),
      makeMember({ id: 'tm_3', userId: 'user_3' }),
    ])
    mockPrisma.timeEntry.groupBy.mockResolvedValue([])
    mockPrisma.task.groupBy.mockResolvedValue([])

    await StudioService.getCapacity({ currentUser: makeUser() })

    expect(mockPrisma.timeEntry.groupBy).toHaveBeenCalledTimes(1)
    expect(mockPrisma.task.groupBy).toHaveBeenCalledTimes(1)
    expect(mockPrisma.timeEntry.aggregate).not.toHaveBeenCalled()
    expect(mockPrisma.task.count).not.toHaveBeenCalled()
  })
})