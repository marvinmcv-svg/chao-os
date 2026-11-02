import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { StudioService } from '@/services/StudioService'

const ACTIVE = ['ON_TRACK', 'AT_RISK', 'OVER_BUDGET', 'CLOSING'] as const

// GET /api/dashboard/kpis — headline numbers for the dashboard
export const GET = withApiHandler(async (_req: NextRequest) => {
  const user = await requireAuth()

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  const [activeProjects, openLeads, closedLeads, invoices, payments, capacity] = await Promise.all([
    prisma.project.findMany({
      where: { status: { in: [...ACTIVE] } },
      select: { id: true, totalBudgetUSD: true, totalSpentUSD: true, status: true },
    }),
    prisma.lead.findMany({
      where: { pipelineStage: { notIn: ['WON', 'LOST'] } },
      select: { estimatedValueUSD: true, closeProbability: true },
    }),
    prisma.lead.groupBy({ by: ['pipelineStage'], where: { pipelineStage: { in: ['WON', 'LOST'] } }, _count: { _all: true } }),
    prisma.invoice.findMany({
      select: { amountUSD: true, status: true, issuedAt: true, dueDate: true, projectId: true, payments: { select: { amountUSD: true } } },
    }),
    prisma.payment.findMany({ where: { paidAt: { gte: sixMonthsAgo } }, select: { amountUSD: true, paidAt: true } }),
    // Same source of truth as the Studio page (hours logged this week / capacity)
    StudioService.getCapacity({ currentUser: user }),
  ])

  const pipelineWeightedValue = openLeads.reduce((s, l) => s + (l.estimatedValueUSD * l.closeProbability) / 100, 0)
  const pipelineRawValue = openLeads.reduce((s, l) => s + l.estimatedValueUSD, 0)

  const billable = invoices.filter((i) => i.status !== 'DRAFT')
  const paidOf = (i: (typeof invoices)[number]) =>
    i.status === 'PAID' ? i.amountUSD : i.payments.reduce((s, p) => s + p.amountUSD, 0)

  const monthBilled = billable.filter((i) => i.issuedAt >= startOfMonth).reduce((s, i) => s + i.amountUSD, 0)
  const monthCollected = payments.filter((p) => p.paidAt >= startOfMonth).reduce((s, p) => s + p.amountUSD, 0)

  const open = billable.filter((i) => i.status !== 'PAID')
  const receivables = open.reduce((s, i) => s + Math.max(0, i.amountUSD - paidOf(i)), 0)
  const overdue = open.filter((i) => i.status === 'OVERDUE' || i.dueDate < now)
  const overdueAmount = overdue.reduce((s, i) => s + Math.max(0, i.amountUSD - paidOf(i)), 0)

  // Backlog = contracted fee on active projects not yet invoiced
  const activeIds = new Set(activeProjects.map((p) => p.id))
  const invoicedActive = billable.filter((i) => activeIds.has(i.projectId)).reduce((s, i) => s + i.amountUSD, 0)
  const contractedActive = activeProjects.reduce((s, p) => s + p.totalBudgetUSD, 0)
  const backlog = Math.max(0, contractedActive - invoicedActive)

  const won = closedLeads.find((g) => g.pipelineStage === 'WON')?._count._all ?? 0
  const lost = closedLeads.find((g) => g.pipelineStage === 'LOST')?._count._all ?? 0

  // 6-month billed vs collected trend
  const trend = Array.from({ length: 6 }, (_, k) => {
    const start = new Date(now.getFullYear(), now.getMonth() - 5 + k, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - 4 + k, 1)
    return {
      month: start.toLocaleDateString('es-BO', { month: 'short' }).replace('.', ''),
      billed: billable.filter((i) => i.issuedAt >= start && i.issuedAt < end).reduce((s, i) => s + i.amountUSD, 0),
      collected: payments.filter((p) => p.paidAt >= start && p.paidAt < end).reduce((s, p) => s + p.amountUSD, 0),
    }
  })

  return {
    activeProjects: activeProjects.length,
    atRiskProjects: activeProjects.filter((p) => p.status === 'AT_RISK' || p.status === 'OVER_BUDGET').length,
    pipelineWeightedValue: Math.round(pipelineWeightedValue),
    pipelineRawValue: Math.round(pipelineRawValue),
    pipelineCount: openLeads.length,
    winRate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
    monthBilled,
    monthCollected,
    receivables,
    overdueAmount,
    pendingInvoices: open.length - overdue.length,
    overdueInvoices: overdue.length,
    backlog,
    teamUtilization: capacity.summary.avgUtilization,
    hoursLogged: capacity.summary.totalLogged,
    hoursCapacity: capacity.summary.totalCapacity,
    overloadedCount: capacity.summary.overloadedCount,
    trend,
  }
})
