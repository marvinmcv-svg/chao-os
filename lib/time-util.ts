import { prisma } from './prisma'

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