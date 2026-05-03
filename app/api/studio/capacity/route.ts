import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/studio/capacity — capacity grid for all team members
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const now = new Date()
    const dayOfWeek = now.getDay()
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    const monday = new Date(now)
    monday.setDate(now.getDate() - daysToMonday)
    monday.setHours(0, 0, 0, 0)

    const members = await prisma.teamMember.findMany({
      include: {
        user: {
          select: { id: true, name: true, avatarInitials: true, role: true, capacityPercent: true },
        },
      },
    })

    const capacityData = await Promise.all(
      members.map(async (member) => {
        const weekEntries = await prisma.timeEntry.aggregate({
          where: { userId: member.userId, date: { gte: monday } },
          _sum: { hours: true },
        })
        const loggedHours = weekEntries._sum.hours || 0

        const activeTasks = await prisma.task.count({
          where: { assignedToId: member.userId, status: { not: 'DONE' } },
        })

        const isOverloaded = member.utilizationPercent >= 90

        return {
          id: member.id,
          userId: member.userId,
          name: member.user.name,
          avatarInitials: member.user.avatarInitials,
          role: member.role,
          weeklyHoursCapacity: member.weeklyHoursCapacity,
          weeklyHoursLogged: loggedHours,
          utilizationPercent: member.weeklyHoursCapacity > 0
            ? Math.round((loggedHours / member.weeklyHoursCapacity) * 100)
            : 0,
          activeTasks,
          isOverloaded,
          startDate: member.startDate,
          hourlyRate: member.hourlyRate,
        }
      })
    )

    capacityData.sort((a, b) => b.utilizationPercent - a.utilizationPercent)

    const avgUtilization = capacityData.length > 0
      ? Math.round(capacityData.reduce((sum, m) => sum + m.utilizationPercent, 0) / capacityData.length)
      : 0
    const overloadedCount = capacityData.filter(m => m.isOverloaded).length
    const totalCapacity = capacityData.reduce((sum, m) => sum + m.weeklyHoursCapacity, 0)
    const totalLogged = capacityData.reduce((sum, m) => sum + m.weeklyHoursLogged, 0)

    return Response.json({
      success: true,
      data: {
        members: capacityData,
        summary: {
          avgUtilization,
          overloadedCount,
          totalCapacity,
          totalLogged,
          totalAvailable: totalCapacity - totalLogged,
        },
      },
    })
  } catch (error) {
    console.error('GET /api/studio/capacity error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}