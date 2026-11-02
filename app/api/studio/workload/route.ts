import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'

const DAY = 86_400_000

function mondayOf(d: Date) {
  const m = new Date(d)
  const dow = m.getDay()
  m.setDate(m.getDate() - (dow === 0 ? 6 : dow - 1))
  m.setHours(0, 0, 0, 0)
  return m
}

/**
 * GET /api/studio/workload?past=6&future=4
 *
 * Person × week heatmap (Mosaic / Vantagepoint-style resource view):
 *  - past weeks (incl. current): hours actually logged
 *  - current + future weeks: remaining estimated hours of open tasks,
 *    bucketed by due week (overdue open work lands in the current week)
 * Three queries regardless of team size.
 */
export const GET = withApiHandler(async (req: NextRequest) => {
  await requireAuth()
  const sp = new URL(req.url).searchParams
  const past = Math.min(12, Math.max(1, parseInt(sp.get('past') || '6', 10)))
  const future = Math.min(12, Math.max(0, parseInt(sp.get('future') || '4', 10)))

  const thisMonday = mondayOf(new Date())
  const start = new Date(thisMonday.getTime() - (past - 1) * 7 * DAY)
  const weeks = Array.from({ length: past + future }, (_, i) => {
    const s = new Date(start.getTime() + i * 7 * DAY)
    return { start: s.toISOString(), isCurrent: s.getTime() === thisMonday.getTime(), isFuture: s > thisMonday }
  })
  const end = new Date(start.getTime() + weeks.length * 7 * DAY)

  const [members, entries, tasks] = await Promise.all([
    prisma.teamMember.findMany({ include: { user: { select: { id: true, name: true, avatarInitials: true } } } }),
    prisma.timeEntry.findMany({ where: { date: { gte: start, lt: end } }, select: { userId: true, hours: true, date: true } }),
    prisma.task.findMany({
      where: { status: { not: 'DONE' } },
      select: { assignedToId: true, estimatedHours: true, loggedHours: true, dueDate: true },
    }),
  ])

  const idx = (d: Date) => Math.floor((mondayOf(d).getTime() - start.getTime()) / (7 * DAY))
  const currentIdx = past - 1

  const rows = members
    .map((m) => {
      const logged = new Array(weeks.length).fill(0)
      const planned = new Array(weeks.length).fill(0)
      for (const e of entries) if (e.userId === m.userId) {
        const i = idx(e.date)
        if (i >= 0 && i < weeks.length) logged[i] += e.hours
      }
      for (const t of tasks) if (t.assignedToId === m.userId) {
        const remaining = Math.max(0, t.estimatedHours - t.loggedHours)
        let i = idx(t.dueDate)
        if (i < currentIdx) i = currentIdx
        if (i < weeks.length) planned[i] += remaining
      }
      return {
        userId: m.userId,
        name: m.user.name,
        avatarInitials: m.user.avatarInitials,
        role: m.role,
        capacity: m.weeklyHoursCapacity,
        cells: weeks.map((w, i) => ({
          logged: Math.round(logged[i] * 10) / 10,
          planned: Math.round(planned[i] * 10) / 10,
          pct: m.weeklyHoursCapacity > 0
            ? Math.round(((w.isFuture ? planned[i] : w.isCurrent ? Math.max(logged[i], planned[i]) : logged[i]) / m.weeklyHoursCapacity) * 100)
            : 0,
        })),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return { weeks, members: rows }
})
