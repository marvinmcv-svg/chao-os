/**
 * CapacityService — capacity realism.
 *
 *  - Time-off: full-day absence spans with a request → approve flow.
 *    Only APPROVED spans reduce capacity.
 *  - Holidays: Bolivian statutory calendar (lib/calendar) + studio
 *    closures stored in StudioHoliday.
 *  - Allocations: forward plan of hours per person × project (× phase)
 *    × week, with move/merge for drag-to-reassign.
 *  - Planner / workload grids: availability-adjusted capacity per
 *    person-week, built in a constant number of queries.
 */
import { Prisma, TimeOffStatus, TimeOffType } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'
import { ForbiddenError, NotFoundError, ValidationError, InvalidStateError } from '@/lib/result'
import {
  type AbsenceSpan,
  type DayKey,
  type HolidayInfo,
  addDays,
  countWorkingDays,
  dayKey,
  holidaysBetween,
  mondayOf,
  parseDay,
  round1,
  todayKey,
  weekAvailability,
  weekStarts,
} from '@/lib/calendar'
import { NotificationService } from './NotificationService'

/** Can create/edit allocations and log absences for other people. */
export const PLANNER_ROLES = new Set(['PRINCIPAL', 'ADMIN', 'ARCHITECT_SENIOR'])
/** Can approve/reject absences and manage studio closures. */
export const APPROVER_ROLES = new Set(['PRINCIPAL', 'ADMIN'])

export const STUDIO_DEPARTMENT = process.env.STUDIO_DEPARTMENT || 'SCZ'

const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)')

export const timeOffInputSchema = z
  .object({
    userId: z.string().min(1).optional(),
    type: z.nativeEnum(TimeOffType).default('VACATION'),
    startDate: dayKeySchema,
    endDate: dayKeySchema,
    note: z.string().max(500).default(''),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'La fecha final debe ser igual o posterior a la inicial', path: ['endDate'] })

export const timeOffReviewSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) })

export const holidayInputSchema = z.object({ date: dayKeySchema, name: z.string().trim().min(2).max(120) })

export const allocationInputSchema = z.object({
  userId: z.string().min(1),
  projectId: z.string().min(1),
  phaseId: z.string().min(1).nullish(),
  weekStart: dayKeySchema,
  hours: z.number().min(0).max(80),
  note: z.string().max(300).optional(),
  /** Apply the same hours to this many consecutive weeks (1 = just this week). */
  repeatWeeks: z.number().int().min(1).max(26).default(1),
})

export const allocationPatchSchema = z
  .object({
    userId: z.string().min(1).optional(),
    weekStart: dayKeySchema.optional(),
    phaseId: z.string().min(1).nullish(),
    hours: z.number().min(0).max(80).optional(),
    note: z.string().max(300).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada que actualizar' })

// ─── Shared calendar context ───────────────────────────────────────────────

export interface CalendarContext {
  holidays: HolidayInfo[]
  holidayKeys: Set<DayKey>
  absencesByUser: Map<string, (AbsenceSpan & { type: TimeOffType })[]>
}

/** Holidays + approved absences overlapping [fromKey, toKey]. Two queries. */
export async function loadCalendar(fromKey: DayKey, toKey: DayKey): Promise<CalendarContext> {
  const [closures, timeOff] = await Promise.all([
    prisma.studioHoliday.findMany({ where: { date: { gte: parseDay(fromKey), lte: parseDay(toKey) } } }),
    prisma.timeOff.findMany({
      where: { status: 'APPROVED', startDate: { lte: parseDay(toKey) }, endDate: { gte: parseDay(fromKey) } },
      select: { userId: true, startDate: true, endDate: true, type: true },
    }),
  ])
  const holidays = holidaysBetween(fromKey, toKey, closures, STUDIO_DEPARTMENT)
  const absencesByUser = new Map<string, (AbsenceSpan & { type: TimeOffType })[]>()
  for (const t of timeOff) {
    const list = absencesByUser.get(t.userId) ?? []
    list.push({ start: dayKey(t.startDate), end: dayKey(t.endDate), type: t.type })
    absencesByUser.set(t.userId, list)
  }
  return { holidays, holidayKeys: new Set(holidays.map((h) => h.date)), absencesByUser }
}

function pct(hours: number, capacity: number): number {
  if (capacity <= 0) return hours > 0 ? 999 : 0
  return Math.round((hours / capacity) * 100)
}

async function assertTeamMember(userId: string) {
  const tm = await prisma.teamMember.findUnique({ where: { userId }, select: { id: true } })
  if (!tm) throw new ValidationError('La persona no es parte del equipo', 'userId')
}

// ─── Service ───────────────────────────────────────────────────────────────

export const CapacityService = {
  // ── Holidays ──────────────────────────────────────────────────────────

  async listHolidays(args: { from?: DayKey; to?: DayKey }) {
    const from = args.from ?? todayKey()
    const to = args.to ?? addDays(from, 365)
    const closures = await prisma.studioHoliday.findMany({ where: { date: { gte: parseDay(from), lte: parseDay(to) } } })
    return { department: STUDIO_DEPARTMENT, holidays: holidaysBetween(from, to, closures, STUDIO_DEPARTMENT) }
  },

  async createHoliday(args: { currentUser: AuthUser; data: z.infer<typeof holidayInputSchema> }) {
    if (!APPROVER_ROLES.has(args.currentUser.role)) throw new ForbiddenError('Solo dirección puede agregar cierres del estudio')
    try {
      return await prisma.studioHoliday.create({ data: { date: parseDay(args.data.date), name: args.data.name } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ValidationError('Ya existe un cierre en esa fecha', 'date')
      }
      throw e
    }
  },

  async deleteHoliday(args: { currentUser: AuthUser; id: string }) {
    if (!APPROVER_ROLES.has(args.currentUser.role)) throw new ForbiddenError('Solo dirección puede eliminar cierres del estudio')
    const found = await prisma.studioHoliday.findUnique({ where: { id: args.id } })
    if (!found) throw new NotFoundError('StudioHoliday', args.id)
    await prisma.studioHoliday.delete({ where: { id: args.id } })
    return { id: args.id }
  },

  // ── Time-off ──────────────────────────────────────────────────────────

  async listTimeOff(args: { currentUser: AuthUser; from?: DayKey; to?: DayKey; status?: TimeOffStatus }) {
    const from = args.from ?? addDays(todayKey(), -30)
    const where: Prisma.TimeOffWhereInput = { endDate: { gte: parseDay(from) } }
    if (args.to) where.startDate = { lte: parseDay(args.to) }
    if (args.status) where.status = args.status
    const [rows, closures] = await Promise.all([
      prisma.timeOff.findMany({
        where,
        orderBy: { startDate: 'asc' },
        include: {
          user: { select: { id: true, name: true, avatarInitials: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.studioHoliday.findMany({ where: { date: { gte: parseDay(from) } } }),
    ])
    const lastEnd = rows.reduce((m, r) => (dayKey(r.endDate) > m ? dayKey(r.endDate) : m), from)
    const holidayKeys = new Set(holidaysBetween(from, lastEnd, closures, STUDIO_DEPARTMENT).map((h) => h.date))
    return rows.map((r) => ({
      ...r,
      startDate: dayKey(r.startDate),
      endDate: dayKey(r.endDate),
      workingDays: countWorkingDays(dayKey(r.startDate), dayKey(r.endDate), holidayKeys),
      canReview: APPROVER_ROLES.has(args.currentUser.role) && r.status === 'PENDING',
      canDelete: APPROVER_ROLES.has(args.currentUser.role) || (r.userId === args.currentUser.id && r.status === 'PENDING'),
    }))
  },

  async createTimeOff(args: { currentUser: AuthUser; data: z.infer<typeof timeOffInputSchema> }) {
    const { currentUser, data } = args
    const userId = data.userId ?? currentUser.id
    const forSelf = userId === currentUser.id
    if (!forSelf && !PLANNER_ROLES.has(currentUser.role)) {
      throw new ForbiddenError('Solo puedes registrar tus propias ausencias')
    }
    await assertTeamMember(userId)

    const overlap = await prisma.timeOff.findFirst({
      where: {
        userId,
        status: { not: 'REJECTED' },
        startDate: { lte: parseDay(data.endDate) },
        endDate: { gte: parseDay(data.startDate) },
      },
    })
    if (overlap) throw new ValidationError('Ya hay una ausencia registrada que se superpone con esas fechas', 'startDate')

    // Directors' entries (for anyone) are approved on creation.
    const autoApprove = APPROVER_ROLES.has(currentUser.role)
    const created = await prisma.timeOff.create({
      data: {
        userId,
        type: data.type,
        note: data.note,
        startDate: parseDay(data.startDate),
        endDate: parseDay(data.endDate),
        status: autoApprove ? 'APPROVED' : 'PENDING',
        ...(autoApprove && { reviewedById: currentUser.id, reviewedAt: new Date() }),
      },
      include: { user: { select: { name: true } } },
    })

    if (!autoApprove) {
      const approvers = await prisma.user.findMany({ where: { role: { in: Array.from(APPROVER_ROLES) as never } }, select: { id: true } })
      await Promise.all(
        approvers.map((a) =>
          NotificationService.create({
            userId: a.id,
            type: 'CAPACITY_ALERT',
            title: 'Solicitud de ausencia',
            message: `${created.user.name} solicita ausencia del ${data.startDate} al ${data.endDate}`,
            linkUrl: '/studio?tab=absences',
          }),
        ),
      )
    }
    return created
  },

  async reviewTimeOff(args: { currentUser: AuthUser; id: string; status: 'APPROVED' | 'REJECTED' }) {
    if (!APPROVER_ROLES.has(args.currentUser.role)) throw new ForbiddenError('Solo dirección puede aprobar ausencias')
    const row = await prisma.timeOff.findUnique({ where: { id: args.id } })
    if (!row) throw new NotFoundError('TimeOff', args.id)
    if (row.status !== 'PENDING') throw new InvalidStateError('La solicitud ya fue revisada')
    const updated = await prisma.timeOff.update({
      where: { id: args.id },
      data: { status: args.status, reviewedById: args.currentUser.id, reviewedAt: new Date() },
    })
    if (row.userId !== args.currentUser.id) {
      await NotificationService.create({
        userId: row.userId,
        type: 'CAPACITY_ALERT',
        title: args.status === 'APPROVED' ? 'Ausencia aprobada' : 'Ausencia rechazada',
        message: `Tu ausencia del ${dayKey(row.startDate)} al ${dayKey(row.endDate)} fue ${args.status === 'APPROVED' ? 'aprobada' : 'rechazada'}`,
        linkUrl: '/studio?tab=absences',
      })
    }
    return updated
  },

  async deleteTimeOff(args: { currentUser: AuthUser; id: string }) {
    const row = await prisma.timeOff.findUnique({ where: { id: args.id } })
    if (!row) throw new NotFoundError('TimeOff', args.id)
    const isOwnerPending = row.userId === args.currentUser.id && row.status === 'PENDING'
    if (!isOwnerPending && !APPROVER_ROLES.has(args.currentUser.role)) {
      throw new ForbiddenError('No puedes eliminar esta ausencia')
    }
    await prisma.timeOff.delete({ where: { id: args.id } })
    return { id: args.id }
  },

  // ── Allocations ───────────────────────────────────────────────────────

  async upsertAllocation(args: { currentUser: AuthUser; data: z.infer<typeof allocationInputSchema> }) {
    const { currentUser, data } = args
    if (!PLANNER_ROLES.has(currentUser.role)) throw new ForbiddenError('No tienes permiso para planificar asignaciones')
    await assertTeamMember(data.userId)
    const project = await prisma.project.findUnique({
      where: { id: data.projectId },
      select: { id: true, status: true, phases: { select: { id: true } } },
    })
    if (!project) throw new NotFoundError('Project', data.projectId)
    if (project.status === 'COMPLETED') throw new InvalidStateError('El proyecto está completado')
    if (data.phaseId && !project.phases.some((p) => p.id === data.phaseId)) {
      throw new ValidationError('La fase no pertenece al proyecto', 'phaseId')
    }

    const weeks = Array.from({ length: data.repeatWeeks }, (_, i) => parseDay(addDays(mondayOf(data.weekStart), i * 7)))
    return prisma.$transaction(async (tx) => {
      const out = []
      for (const weekStart of weeks) {
        const key = { userId_projectId_weekStart: { userId: data.userId, projectId: data.projectId, weekStart } }
        if (data.hours === 0) {
          await tx.allocation.deleteMany({ where: { userId: data.userId, projectId: data.projectId, weekStart } })
          continue
        }
        out.push(
          await tx.allocation.upsert({
            where: key,
            create: { userId: data.userId, projectId: data.projectId, phaseId: data.phaseId ?? null, weekStart, hours: data.hours, note: data.note ?? '' },
            update: { hours: data.hours, phaseId: data.phaseId ?? null, ...(data.note !== undefined && { note: data.note }) },
          }),
        )
      }
      return out
    })
  },

  /**
   * Edit or move an allocation (drag-to-reassign). Moving onto a cell
   * that already holds the same project merges the hours into it.
   */
  async updateAllocation(args: { currentUser: AuthUser; id: string; data: z.infer<typeof allocationPatchSchema> }) {
    const { currentUser, id, data } = args
    if (!PLANNER_ROLES.has(currentUser.role)) throw new ForbiddenError('No tienes permiso para planificar asignaciones')
    const current = await prisma.allocation.findUnique({ where: { id } })
    if (!current) throw new NotFoundError('Allocation', id)

    const userId = data.userId ?? current.userId
    const weekStart = data.weekStart ? parseDay(mondayOf(data.weekStart)) : current.weekStart
    const hours = data.hours ?? current.hours
    if (userId !== current.userId) await assertTeamMember(userId)
    if (data.phaseId) {
      const ok = await prisma.phase.findFirst({ where: { id: data.phaseId, projectId: current.projectId }, select: { id: true } })
      if (!ok) throw new ValidationError('La fase no pertenece al proyecto', 'phaseId')
    }

    return prisma.$transaction(async (tx) => {
      if (hours === 0) {
        await tx.allocation.delete({ where: { id } })
        return { deleted: id, merged: false, allocation: null }
      }
      const moved = userId !== current.userId || weekStart.getTime() !== current.weekStart.getTime()
      if (moved) {
        const target = await tx.allocation.findUnique({
          where: { userId_projectId_weekStart: { userId, projectId: current.projectId, weekStart } },
        })
        if (target) {
          await tx.allocation.delete({ where: { id } })
          const merged = await tx.allocation.update({
            where: { id: target.id },
            data: { hours: Math.min(80, round1(target.hours + hours)), ...(data.phaseId !== undefined && { phaseId: data.phaseId }) },
          })
          return { deleted: id, merged: true, allocation: merged }
        }
      }
      const updated = await tx.allocation.update({
        where: { id },
        data: {
          userId,
          weekStart,
          hours,
          ...(data.phaseId !== undefined && { phaseId: data.phaseId }),
          ...(data.note !== undefined && { note: data.note }),
        },
      })
      return { deleted: null, merged: false, allocation: updated }
    })
  },

  async deleteAllocation(args: { currentUser: AuthUser; id: string }) {
    if (!PLANNER_ROLES.has(args.currentUser.role)) throw new ForbiddenError('No tienes permiso para planificar asignaciones')
    const found = await prisma.allocation.findUnique({ where: { id: args.id }, select: { id: true } })
    if (!found) throw new NotFoundError('Allocation', args.id)
    await prisma.allocation.delete({ where: { id: args.id } })
    return { id: args.id }
  },

  // ── Grids ─────────────────────────────────────────────────────────────

  /**
   * Resource planner: person × week (current week + `weeks - 1` ahead).
   * Each cell has availability-adjusted capacity, allocations and
   * open-task hours due that week (unscheduled demand signal).
   */
  async getPlanner(args: { currentUser: AuthUser; weeks?: number; from?: DayKey }) {
    const count = Math.min(16, Math.max(1, args.weeks ?? 8))
    const today = todayKey()
    const starts = weekStarts(args.from ?? today, count)
    const fromKey = starts[0]
    const toKey = addDays(starts[count - 1], 6)
    const currentMonday = mondayOf(today)

    const [members, allocations, tasks, projects, cal] = await Promise.all([
      prisma.teamMember.findMany({ include: { user: { select: { id: true, name: true, avatarInitials: true } } } }),
      prisma.allocation.findMany({
        where: { weekStart: { gte: parseDay(fromKey), lte: parseDay(toKey) } },
        include: {
          project: { select: { id: true, code: true, name: true } },
          phase: { select: { id: true, phase: true } },
        },
      }),
      prisma.task.findMany({
        where: { status: { not: 'DONE' }, dueDate: { lte: parseDay(toKey) } },
        select: { assignedToId: true, estimatedHours: true, loggedHours: true, dueDate: true },
      }),
      prisma.project.findMany({
        where: { status: { not: 'COMPLETED' } },
        orderBy: { code: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          currentPhase: true,
          phases: { select: { id: true, phase: true, label: true, status: true }, orderBy: { phase: 'asc' } },
          teamMembers: { select: { userId: true } },
        },
      }),
      loadCalendar(fromKey, toKey),
    ])

    const weekIndex = new Map(starts.map((s, i) => [s, i]))
    const rows = members
      .map((m) => {
        const absences = cal.absencesByUser.get(m.userId) ?? []
        const cells = starts.map((s) => {
          const av = weekAvailability(s, m.weeklyHoursCapacity, cal.holidayKeys, absences)
          return { capacity: av.capacityHours, holidayDays: av.holidayDays, timeOffDays: av.timeOffDays, allocated: 0, taskHours: 0, pct: 0, allocations: [] as {
            id: string; projectId: string; code: string; name: string; phaseId: string | null; phase: string | null; hours: number; note: string
          }[] }
        })
        for (const a of allocations) {
          if (a.userId !== m.userId) continue
          const i = weekIndex.get(dayKey(a.weekStart))
          if (i == null) continue
          cells[i].allocated += a.hours
          cells[i].allocations.push({
            id: a.id, projectId: a.projectId, code: a.project.code, name: a.project.name,
            phaseId: a.phaseId, phase: a.phase?.phase ?? null, hours: a.hours, note: a.note,
          })
        }
        for (const t of tasks) {
          if (t.assignedToId !== m.userId) continue
          const remaining = Math.max(0, t.estimatedHours - t.loggedHours)
          // overdue open work counts against the current week
          const k = dayKey(t.dueDate) < fromKey ? fromKey : mondayOf(dayKey(t.dueDate))
          const i = weekIndex.get(k)
          if (i != null) cells[i].taskHours += remaining
        }
        for (const c of cells) {
          c.allocated = round1(c.allocated)
          c.taskHours = round1(c.taskHours)
          c.pct = pct(c.allocated, c.capacity)
          c.allocations.sort((a, b) => b.hours - a.hours)
        }
        return {
          userId: m.userId,
          name: m.user.name,
          avatarInitials: m.user.avatarInitials,
          role: m.role,
          weeklyHours: m.weeklyHoursCapacity,
          cells,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    const weeks = starts.map((s, i) => ({
      start: s,
      isCurrent: s === currentMonday,
      holidays: cal.holidays.filter((h) => h.date >= s && h.date <= addDays(s, 6)),
      totals: {
        capacity: round1(rows.reduce((sum, r) => sum + r.cells[i].capacity, 0)),
        allocated: round1(rows.reduce((sum, r) => sum + r.cells[i].allocated, 0)),
      },
    }))

    return {
      weeks,
      members: rows,
      projects: projects.map((p) => ({ ...p, teamMembers: p.teamMembers.map((t) => t.userId) })),
      canEdit: PLANNER_ROLES.has(args.currentUser.role),
    }
  },

  /**
   * Person × week heatmap: past weeks show hours logged, the current
   * week max(logged, planned), future weeks planned (allocations).
   * Capacity per cell excludes holidays and approved absences.
   */
  async getWorkload(args: { past?: number; future?: number }) {
    const past = Math.min(12, Math.max(1, args.past ?? 6))
    const future = Math.min(12, Math.max(0, args.future ?? 4))
    const today = todayKey()
    const currentMonday = mondayOf(today)
    const starts = weekStarts(addDays(currentMonday, -(past - 1) * 7), past + future)
    const fromKey = starts[0]
    const toKey = addDays(starts[starts.length - 1], 6)

    const [members, entries, allocations, cal] = await Promise.all([
      prisma.teamMember.findMany({ include: { user: { select: { id: true, name: true, avatarInitials: true } } } }),
      prisma.timeEntry.groupBy({
        by: ['userId', 'date'],
        where: { date: { gte: parseDay(fromKey), lt: parseDay(addDays(toKey, 1)) } },
        _sum: { hours: true },
      }),
      prisma.allocation.groupBy({
        by: ['userId', 'weekStart'],
        where: { weekStart: { gte: parseDay(fromKey), lte: parseDay(toKey) } },
        _sum: { hours: true },
      }),
      loadCalendar(fromKey, toKey),
    ])

    const weekIndex = new Map(starts.map((s, i) => [s, i]))
    const weeks = starts.map((s) => ({
      start: s,
      isCurrent: s === currentMonday,
      isFuture: s > currentMonday,
      holidays: cal.holidays.filter((h) => h.date >= s && h.date <= addDays(s, 6)).map((h) => h.name),
    }))

    const rows = members
      .map((m) => {
        const logged = new Array(starts.length).fill(0)
        const planned = new Array(starts.length).fill(0)
        for (const e of entries) if (e.userId === m.userId) {
          const i = weekIndex.get(mondayOf(dayKey(e.date)))
          if (i != null) logged[i] += e._sum.hours ?? 0
        }
        for (const a of allocations) if (a.userId === m.userId) {
          const i = weekIndex.get(dayKey(a.weekStart))
          if (i != null) planned[i] += a._sum.hours ?? 0
        }
        const absences = cal.absencesByUser.get(m.userId) ?? []
        return {
          userId: m.userId,
          name: m.user.name,
          avatarInitials: m.user.avatarInitials,
          role: m.role,
          capacity: m.weeklyHoursCapacity,
          cells: weeks.map((w, i) => {
            const av = weekAvailability(w.start, m.weeklyHoursCapacity, cal.holidayKeys, absences)
            const shown = w.isFuture ? planned[i] : w.isCurrent ? Math.max(logged[i], planned[i]) : logged[i]
            return {
              logged: round1(logged[i]),
              planned: round1(planned[i]),
              capacity: av.capacityHours,
              holidayDays: av.holidayDays,
              timeOffDays: av.timeOffDays,
              pct: pct(shown, av.capacityHours),
            }
          }),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    return { weeks, members: rows }
  },
}
