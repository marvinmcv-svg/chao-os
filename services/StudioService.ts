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
 * Capacity realism: `weeklyHoursCapacity` is the *available* hours this
 * week (contract hours minus Bolivian/studio holidays and approved
 * absences), and pace compares logged hours with the hours expected up
 * to today on working days only.
 */
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'
import { addDays, expectedHoursToDate, mondayOf, parseDay, todayKey, weekAvailability } from '@/lib/calendar'
import { loadCalendar } from './CapacityService'

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
  async getCapacity(args: { currentUser: AuthUser; now?: Date }) {
    const today = todayKey(args.now)
    const mondayKey = mondayOf(today)
    const monday = parseDay(mondayKey)
    const nextMonday = parseDay(addDays(mondayKey, 7))

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
      where: { date: { gte: monday, lt: nextMonday } },
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

    // BATCH 3+4: holidays/closures and approved absences this week
    const cal = await loadCalendar(mondayKey, addDays(mondayKey, 6))

    const capacityData = members.map((member) => {
      const loggedHours = hoursByUser.get(member.userId) ?? 0
      const absences = cal.absencesByUser.get(member.userId) ?? []
      const av = weekAvailability(mondayKey, member.weeklyHoursCapacity, cal.holidayKeys, absences)
      const expected = expectedHoursToDate(mondayKey, today, member.weeklyHoursCapacity, cal.holidayKeys, absences)
      // Utilisation is measured against this week's *available* hours.
      const utilizationPercent =
        av.capacityHours > 0
          ? Math.round((loggedHours / av.capacityHours) * 100)
          : 0

      return {
        id: member.id,
        userId: member.userId,
        name: member.user.name,
        avatarInitials: member.user.avatarInitials,
        role: member.role,
        /** Available hours this week (contract hours minus holidays and absences). */
        weeklyHoursCapacity: av.capacityHours,
        baseWeeklyHours: member.weeklyHoursCapacity,
        holidayDays: av.holidayDays,
        timeOffDays: av.timeOffDays,
        expectedHoursToDate: expected,
        pacePercent: expected > 0 ? Math.round((loggedHours / expected) * 100) : 0,
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
    const totalExpected = capacityData.reduce((sum, m) => sum + m.expectedHoursToDate, 0)

    return {
      members: capacityData,
      summary: {
        avgUtilization,
        overloadedCount,
        totalCapacity,
        totalLogged,
        totalAvailable: totalCapacity - totalLogged,
        totalExpectedToDate: Math.round(totalExpected * 10) / 10,
        pacePercent: totalExpected > 0 ? Math.round((totalLogged / totalExpected) * 100) : 0,
        holidays: cal.holidays,
        peopleOut: capacityData.filter((m) => m.timeOffDays > 0).length,
      },
    }
  },
}