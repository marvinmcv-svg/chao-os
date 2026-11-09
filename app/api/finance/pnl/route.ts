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
        where: { status: { not: 'DRAFT' } },
        select: { amountUSD: true, status: true },
      },
      // Only approved costs count; submitted/rejected ones are not real spend yet
      expenses: { where: { status: { in: ['APPROVED', 'REIMBURSED'] } }, select: { amountUSD: true } },
      timeEntries: {
        select: { hours: true, user: { select: { teamMember: { select: { hourlyRate: true } } } } },
      },
      teamMembers: true,
    },
  })

  // Default hourly rate if not set
  const DEFAULT_HOURLY_RATE = Number(process.env.DEFAULT_HOURLY_RATE) || 50

  const pnlData = projects.map(project => {
    // Revenue = everything invoiced (not drafts)
    const revenue = project.invoices.reduce((sum, i) => sum + i.amountUSD, 0)
    const expenses = project.expenses.reduce((sum, e) => sum + e.amountUSD, 0)
    const hoursLogged = project.timeEntries.reduce((sum, t) => sum + t.hours, 0)
    // Labor cost: each entry at the member's own cost rate, or the default
    const laborCost = project.timeEntries.reduce(
      (sum, t) => sum + t.hours * (t.user.teamMember?.hourlyRate ?? DEFAULT_HOURLY_RATE),
      0,
    )
    const netProfit = revenue - expenses - laborCost
    const margin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0

    return {
      projectId: project.id,
      status: project.status,
      feeUSD: project.totalBudgetUSD,
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