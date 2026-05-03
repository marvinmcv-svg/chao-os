import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// GET /api/team/:id — full capacity detail for one team member
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const member = await prisma.teamMember.findUnique({
      where: { id: params.id },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarInitials: true, role: true, capacityPercent: true },
        },
      },
    })

    if (!member) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Miembro no encontrado' } }, { status: 404 })
    }

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

    return Response.json({
      success: true,
      data: {
        ...member,
        weeklyHoursLogged: weeklyHours,
        upcomingDeadlines,
        weekEntries,
      },
    })
  } catch (error) {
    console.error('GET /api/team/:id error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}

const UpdateTeamMemberSchema = z.object({
  role: z.string().optional(),
  startDate: z.string().datetime().optional(),
  hourlyRate: z.number().positive().optional(),
  weeklyHoursCapacity: z.number().positive().optional(),
})

// PUT /api/team/:id — update role, startDate, hourlyRate, weeklyHoursCapacity
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    if (!['ADMIN', 'PRINCIPAL'].includes(session.user.role)) {
      return Response.json({ success: false, error: { code: 'FORBIDDEN', message: 'Sin permiso' } }, { status: 403 })
    }

    const body = await req.json()
    const parsed = UpdateTeamMemberSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } }, { status: 400 })
    }

    const data = parsed.data
    const updateData: any = {}
    if (data.role !== undefined) updateData.role = data.role
    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate)
    if (data.hourlyRate !== undefined) updateData.hourlyRate = data.hourlyRate
    if (data.weeklyHoursCapacity !== undefined) updateData.weeklyHoursCapacity = data.weeklyHoursCapacity

    const member = await prisma.teamMember.update({
      where: { id: params.id },
      data: updateData,
      include: { user: { select: { id: true, name: true, avatarInitials: true, role: true } } },
    })

    return Response.json({ success: true, data: member })
  } catch (error) {
    console.error('PUT /api/team/:id error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}