import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { ForbiddenError, NotFoundError } from '@/lib/result'

const UPDATE_ROLES = new Set(['ADMIN', 'PRINCIPAL'])

// GET /api/team/:id — full capacity detail for one team member
export const GET = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    await requireAuth()

    const member = await prisma.teamMember.findUnique({
      where: { id: params.id },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarInitials: true, role: true, capacityPercent: true },
        },
      },
    })
    if (!member) throw new NotFoundError('TeamMember', params.id)

    const now = new Date()
    const dayOfWeek = now.getDay()
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const monday = new Date(now)
    monday.setDate(now.getDate() - daysToMonday)
    monday.setHours(0, 0, 0, 0)

    const weekEntries = await prisma.timeEntry.findMany({
      where: { userId: member.userId, date: { gte: monday } },
      include: { project: { select: { name: true, code: true } }, phase: true },
    })

    const weeklyHours = weekEntries.reduce((sum, e) => sum + e.hours, 0)

    const upcomingTasks = await prisma.task.findMany({
      where: { assignedToId: member.userId, status: { not: 'DONE' } },
      orderBy: { dueDate: 'asc' },
      take: 10,
      include: { project: { select: { id: true, code: true, name: true } } },
    })

    const upcomingDeadlines = upcomingTasks.filter(t => {
      const due = new Date(t.dueDate)
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      return due <= weekFromNow
    })

    return {
      ...member,
      weeklyHoursLogged: weeklyHours,
      upcomingDeadlines,
      weekEntries,
    }
  },
)

const UpdateTeamMemberSchema = z.object({
  role: z.string().optional(),
  startDate: z.string().datetime().optional(),
  hourlyRate: z.number().positive().optional(),
  weeklyHoursCapacity: z.number().positive().optional(),
})

// PUT /api/team/:id — update role, startDate, hourlyRate, weeklyHoursCapacity
export const PUT = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()

    if (!UPDATE_ROLES.has(user.role)) {
      throw new ForbiddenError('Sin permiso')
    }

    const data = UpdateTeamMemberSchema.parse(await req.json())

    const updateData: Record<string, unknown> = {}
    if (data.role !== undefined) updateData.role = data.role
    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate)
    if (data.hourlyRate !== undefined) updateData.hourlyRate = data.hourlyRate
    if (data.weeklyHoursCapacity !== undefined) updateData.weeklyHoursCapacity = data.weeklyHoursCapacity

    return prisma.teamMember.update({
      where: { id: params.id },
      data: updateData,
      include: { user: { select: { id: true, name: true, avatarInitials: true, role: true } } },
    })
  },
)