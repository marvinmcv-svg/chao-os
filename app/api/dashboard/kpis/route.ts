import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'

// GET /api/dashboard/kpis — headline numbers for the dashboard
export const GET = withApiHandler(async (_req: NextRequest) => {
  await requireAuth()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [
    activeProjects,
    pipelineData,
    monthInvoices,
    teamUtilization,
  ] = await Promise.all([
    // Active projects count
    prisma.project.count({
      where: { status: { in: ['ON_TRACK', 'AT_RISK', 'OVER_BUDGET', 'CLOSING'] } },
    }),

    // Pipeline weighted value
    prisma.lead.findMany({
      where: { pipelineStage: { notIn: ['WON', 'LOST'] } },
      select: { estimatedValueUSD: true, closeProbability: true },
    }),

    // Month invoices total
    prisma.invoice.findMany({
      where: {
        issuedAt: { gte: startOfMonth, lt: startOfNextMonth },
      },
      select: { amountUSD: true, status: true },
    }),

    // Team utilization average
    prisma.teamMember.findMany({
      select: { utilizationPercent: true },
    }),
  ])

  const pipelineWeightedValue = pipelineData.reduce(
    (sum, lead) => sum + (lead.estimatedValueUSD * lead.closeProbability) / 100,
    0
  )

  const monthBilled = monthInvoices.reduce((sum, inv) => {
    if (inv.status === 'PAID' || inv.status === 'PENDING') return sum + inv.amountUSD
    return sum
  }, 0)

  const pendingInvoices = monthInvoices.filter(i => i.status === 'PENDING').length
  const overdueInvoices = monthInvoices.filter(i => i.status === 'OVERDUE').length

  const avgUtilization = teamUtilization.length > 0
    ? Math.round(teamUtilization.reduce((sum, m) => sum + m.utilizationPercent, 0) / teamUtilization.length)
    : 0

  return {
    activeProjects,
    pipelineWeightedValue: Math.round(pipelineWeightedValue),
    pipelineCount: pipelineData.length,
    monthBilled,
    pendingInvoices,
    overdueInvoices,
    teamUtilization: avgUtilization,
    overloadedCount: teamUtilization.filter(m => m.utilizationPercent >= 90).length,
  }
})