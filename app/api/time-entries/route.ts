import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const CreateTimeEntrySchema = z.object({
  projectId: z.string().cuid(),
  phaseId: z.string().cuid().optional(),
  taskId: z.string().cuid().optional(),
  description: z.string().min(1),
  hours: z.number().positive().max(24),
  date: z.string(), // ISO date string
})

// GET /api/time-entries — list entries (filter by userId, projectId, date range)
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const projectId = searchParams.get('projectId')
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const where: any = {}
    if (userId) where.userId = userId
    if (projectId) where.projectId = projectId
    if (from || to) {
      where.date = {}
      if (from) where.date.gte = new Date(from)
      if (to) where.date.lte = new Date(to + 'T23:59:59')
    }

    const entries = await prisma.timeEntry.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, avatarInitials: true } },
        project: { select: { id: true, code: true, name: true } },
        phase: { select: { id: true, phase: true, label: true } },
        task: { select: { id: true, title: true } },
      },
      orderBy: { date: 'desc' },
    })

    return Response.json({ success: true, data: entries })
  } catch (error) {
    console.error('GET /api/time-entries error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}

// POST /api/time-entries — create time entry
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const body = await req.json()
    const parsed = CreateTimeEntrySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } }, { status: 400 })
    }

    const data = parsed.data
    const entry = await prisma.timeEntry.create({
      data: {
        userId: session.user.id,
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

    await recalculateTeamUtilization(session.user.id)

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'TimeEntry',
        entityId: entry.id,
        payload: { hours: entry.hours, projectId: entry.projectId },
      },
    })

    return Response.json({ success: true, data: entry }, { status: 201 })
  } catch (error) {
    console.error('POST /api/time-entries error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}

// Utility: recalculate team member utilization for current week (exported for reuse in [id] route)
export async function recalculateTeamUtilization(userId: string) {
  const member = await prisma.teamMember.findUnique({ where: { userId } })
  if (!member) return

  const now = new Date()
  const dayOfWeek = now.getDay()
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysToMonday)
  monday.setHours(0, 0, 0, 0)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const entries = await prisma.timeEntry.aggregate({
    where: {
      userId,
      date: { gte: monday, lte: sunday },
    },
    _sum: { hours: true },
  })

  const loggedHours = entries._sum.hours || 0
  const capacity = member.weeklyHoursCapacity || 40
  const utilizationPercent = Math.round((loggedHours / capacity) * 100)

  await prisma.teamMember.update({
    where: { id: member.id },
    data: { weeklyHoursLogged: loggedHours, utilizationPercent },
  })
}