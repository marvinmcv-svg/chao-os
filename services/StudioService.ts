/**
 * StudioService — studio-wide dashboards. Today: the team capacity grid.
 *
 * Sprint 2.6 focuses on the N+1 query pattern in the original
 * GET /api/studio/capacity route: it ran `timeEntry.aggregate` + 
 * `task.count` INSIDE a per-member loop → 1 + 2N queries. For a studio
 * of 30 architects that is 61 round-trips per page load.
 *
 * The service replaces the loop with 2 batched groupBy queries:
 *   1. timeEntry.groupBy(userId) for week hours  — 1 query
 *   2. task.groupBy(assignedToId) for open tasks — 1 query
 * → constant 3 queries regardless of team size.
 *
 * Output shape is identical to the original route so the frontend
 * contract doesn't change: members sorted by utilization desc + a
 * summary block (avg utilization, overloaded count, capacity totals).
 */
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'

export const StudioService = {
  // ─── getCapacity ─────────────────────────────────────────────────────

  /**
   * Capacity grid for all team members of the current week.
   *
   * Per member: weekly hours logged (since Monday), utilization
   * percent (logged / capacity), open-task count, and the overloaded
   * flag (utilization >= 90%).
   *
   * Implementation notes:
   *  - Monday is computed the same way as lib/time-util (the week
   *    boundary the rest of the app uses).
   *  - Hours and task counts come from groupBy, never per-member
   *    queries (N+1 fix).
   *  - Members without any time entries or tasks fall out of the
   *    groupBy results naturally → 0 hours / 0 tasks.
   */
  async getCapacity(args: { currentUser: AuthUser }) {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const monday = new Date(now)
    monday.setDate(now.getDate() - daysToMonday)
    monday.setHours(0, 0, 0, 0)

    const members = await prisma.teamMember.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarInitials: true,
            role: true,
            capacityPercent: true,
          },
        },
      },
    })

    // BATCH 1: hours logged per user this week (single query)
    const weekAgg = await prisma.timeEntry.groupBy({
      by: ['userId'],
      where: { date: { gte: monday } },
      _sum: { hours: true },
    })
    const hoursByUser = new Map(weekAgg.map((r) => [r.userId, r._sum.hours ?? 0]))

    // BATCH 2: open tasks per user (single query)
    const taskAgg = await prisma.task.groupBy({
      by: ['assignedToId'],
      where: { status: { not: 'DONE' } },
      _count: { _all: true },
    })
    const tasksByUser = new Map(taskAgg.map((r) => [r.assignedToId, r._count._all]))

    const capacityData = members.map((member) => {
      const loggedHours = hoursByUser.get(member.userId) ?? 0
      const utilizationPercent =
        member.weeklyHoursCapacity > 0
          ? Math.round((loggedHours / member.weeklyHoursCapacity) * 100)
          : 0

      return {
        id: member.id,
        userId: member.userId,
        name: member.user.name,
        avatarInitials: member.user.avatarInitials,
        role: member.role,
        weeklyHoursCapacity: member.weeklyHoursCapacity,
        weeklyHoursLogged: loggedHours,
        utilizationPercent,
        activeTasks: tasksByUser.get(member.userId) ?? 0,
        isOverloaded: utilizationPercent >= 90,
        startDate: member.startDate,
        hourlyRate: member.hourlyRate,
      }
    })

    capacityData.sort((a, b) => b.utilizationPercent - a.utilizationPercent)

    const avgUtilization =
      capacityData.length > 0
        ? Math.round(
            capacityData.reduce((sum, m) => sum + m.utilizationPercent, 0) /
              capacityData.length,
          )
        : 0
    const overloadedCount = capacityData.filter((m) => m.isOverloaded).length
    const totalCapacity = capacityData.reduce((sum, m) => sum + m.weeklyHoursCapacity, 0)
    const totalLogged = capacityData.reduce((sum, m) => sum + m.weeklyHoursLogged, 0)

    return {
      members: capacityData,
      summary: {
        avgUtilization,
        overloadedCount,
        totalCapacity,
        totalLogged,
        totalAvailable: totalCapacity - totalLogged,
      },
    }
  },
}