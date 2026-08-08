/**
 * TimeEntryService — time tracking CRUD + utilization recalculation.
 *
 * All routes under /api/time-entries/* eventually delegate here. The
 * service:
 *   - Lists entries with flexible filters (userId, projectId, date
 *     range) and the full relation graph for the timesheet view.
 *   - On create: attributes the entry to the authenticated user,
 *     increments the task's loggedHours when a taskId is given, and
 *     recalculates the user's weekly utilization via the shared
 *     lib/time-util helper.
 *   - On delete: enforces ownership (owner OR ADMIN) with
 *     ForbiddenError → HTTP 403, decrements the task's hours, and
 *     recalculates utilization for the ENTRY's user (not the actor) so
 *     an admin deleting someone else's entry still fixes that user's
 *     capacity numbers.
 *   - Writes audit log entries for every mutation.
 *
 * Permission model:
 *   - Every method takes `currentUser: AuthUser` for audit + checks.
 *   - `delete()` throws ForbiddenError unless the caller owns the entry
 *     or is ADMIN (same rule the original route enforced inline).
 *   - All other methods are available to any authenticated user.
 *
 * Transactions:
 *   - create/delete use sequential writes (entry first, then task
 *     update, then utilization recalc) — matching the original routes.
 *     The entry is the source of truth; a failed utilization recalc
 *     only affects a display number, never the track record.
 */
import type { z } from 'zod'
import type { CreateTimeEntrySchema } from '@/lib/validations'
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'
import { recalculateTeamUtilization } from '@/lib/time-util'
import { ForbiddenError, NotFoundError } from '@/lib/result'

export type CreateTimeEntryInput = z.infer<typeof CreateTimeEntrySchema>

const ENTRY_INCLUDE = {
  user: { select: { id: true, name: true, avatarInitials: true } },
  project: { select: { id: true, code: true, name: true } },
  phase: { select: { id: true, phase: true, label: true } },
  task: { select: { id: true, title: true } },
}

export const TimeEntryService = {
  // ─── list ──────────────────────────────────────────────────────────────

  /**
   * List time entries with optional filters:
   *   - userId: entries for one team member
   *   - projectId: entries for one project
   *   - from/to: date range (to is inclusive of the whole day)
   * Ordered newest-first so the timesheet reads top-down.
   */
  async list(args: {
    currentUser: AuthUser
    userId?: string
    projectId?: string
    from?: string
    to?: string
  }) {
    const where: Record<string, unknown> = {}
    if (args.userId) where.userId = args.userId
    if (args.projectId) where.projectId = args.projectId
    if (args.from || args.to) {
      const dateFilter: Record<string, Date> = {}
      if (args.from) dateFilter.gte = new Date(args.from)
      if (args.to) dateFilter.lte = new Date(args.to + 'T23:59:59')
      where.date = dateFilter
    }

    return prisma.timeEntry.findMany({
      where,
      include: ENTRY_INCLUDE,
      orderBy: { date: 'desc' },
    })
  },

  // ─── create ────────────────────────────────────────────────────────────

  /**
   * Log a time entry for the authenticated user. If a taskId is given,
   * the task's consumed hours are incremented (the project reports
   * actual effort per task). After persisting, weekly utilization is
   * recalculated so capacity views stay current.
   */
  async create(args: { currentUser: AuthUser; data: CreateTimeEntryInput }) {
    const { currentUser, data } = args

    const entry = await prisma.timeEntry.create({
      data: {
        userId: currentUser.id,
        projectId: data.projectId,
        phaseId: data.phaseId,
        taskId: data.taskId,
        description: data.description,
        hours: data.hours,
        date: new Date(data.date),
      },
      include: {
        user: { select: { id: true, name: true, avatarInitials: true } },
        project: { select: { id: true, code: true, name: true } },
        phase: { select: { id: true, phase: true, label: true } },
      },
    })

    if (data.taskId) {
      await prisma.task.update({
        where: { id: data.taskId },
        data: { loggedHours: { increment: data.hours } },
      })
    }

    await recalculateTeamUtilization(currentUser.id)

    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        action: 'CREATE',
        entityType: 'TimeEntry',
        entityId: entry.id,
        payload: { hours: entry.hours, projectId: entry.projectId },
      },
    })

    return entry
  },

  // ─── delete ────────────────────────────────────────────────────────────

  /**
   * Delete a time entry. Permission: the entry's owner OR any ADMIN.
   * Decrements the linked task's hours (undo of create) and
   * recalculates utilization for the ENTRY's user — not the caller —
   * so admin-driven cleanup still keeps the affected member correct.
   */
  async delete(args: { currentUser: AuthUser; id: string }) {
    const entry = await prisma.timeEntry.findUnique({ where: { id: args.id } })
    if (!entry) throw new NotFoundError('TimeEntry', args.id)

    if (entry.userId !== args.currentUser.id && args.currentUser.role !== 'ADMIN') {
      throw new ForbiddenError('Sin permiso para eliminar esta entrada de tiempo')
    }

    await prisma.timeEntry.delete({ where: { id: args.id } })

    if (entry.taskId) {
      await prisma.task.update({
        where: { id: entry.taskId },
        data: { loggedHours: { decrement: entry.hours } },
      })
    }

    await recalculateTeamUtilization(entry.userId)

    await prisma.auditLog.create({
      data: {
        userId: args.currentUser.id,
        action: 'DELETE',
        entityType: 'TimeEntry',
        entityId: args.id,
        payload: { hours: entry.hours, projectId: entry.projectId },
      },
    })
  },
}