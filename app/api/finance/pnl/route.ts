import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'

// GET /api/finance/pnl — P&L per project (revenue - expenses - time cost)
export const GET = withApiHandler(async (req: NextRequest) => {
  await requireAuth()

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')

  const where: Record<string, unknown> = {}
  if (projectId) where.id = projectId

  const projects = await prisma.project.findMany({
    where,
    include: {
      invoices: {
        where: { status: { in: ['PAID', 'PENDING'] } },
        select: { amountUSD: true, status: true },
      },
      expenses: { select: { amountUSD: true } },
      timeEntries: {
        select: { hours: true },
      },
      teamMembers: true,
    },
  })

  // Default hourly rate if not set
  const DEFAULT_HOURLY_RATE = Number(process.env.DEFAULT_HOURLY_RATE) || 50

  const pnlData = projects.map(project => {
    const revenue = project.invoices
      .filter(i => i.status === 'PAID' || i.status === 'PENDING')
      .reduce((sum, i) => sum + i.amountUSD, 0)
    const expenses = project.expenses.reduce((sum, e) => sum + e.amountUSD, 0)
    const hoursLogged = project.timeEntries.reduce((sum, t) => sum + t.hours, 0)
    // Approximate labor cost: total hours × default hourly rate × number of team members
    // Note: per-member hour tracking + custom rates deferred to v2
    const laborCost = hoursLogged * DEFAULT_HOURLY_RATE
    const netProfit = revenue - expenses - laborCost
    const margin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0

    return {
      projectId: project.id,
      code: project.code,
      name: project.name,
      revenue,
      expenses,
      laborCost,
      netProfit,
      margin,
      hoursLogged,
    }
  })

  return pnlData
})