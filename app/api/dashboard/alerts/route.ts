import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { StudioService } from '@/services/StudioService'

// GET /api/dashboard/alerts — actionable alerts across finance, budget, capacity, pipeline
export const GET = withApiHandler(async (_req: NextRequest) => {
  const user = await requireAuth()

  const alerts: { type: string; severity: 'red' | 'yellow' | 'blue' | 'green'; message: string; href?: string }[] = []

  // Overdue invoices
  const overdueInvoices = await prisma.invoice.findMany({
    where: { status: 'OVERDUE' },
    include: { project: { select: { name: true } }, client: { select: { name: true } } },
    orderBy: { dueDate: 'asc' },
    take: 3,
  })
  for (const inv of overdueInvoices) {
    const days = Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24))
    alerts.push({
      type: 'OVERDUE_INVOICE',
      severity: 'red',
      message: `${inv.number} · ${inv.project.name} — ${formatCurrency(inv.amountUSD)}, ${days} días de mora`,
      href: `/finance?invoice=${inv.id}`,
    })
  }

  // At-risk projects (over 80% budget, in-progress)
  const atRiskProjects = await prisma.project.findMany({
    where: { status: 'AT_RISK' },
    include: { phases: true },
    take: 3,
  })
  for (const proj of atRiskProjects) {
    const activePhase = proj.phases.find(p => p.status === 'IN_PROGRESS')
    if (activePhase && activePhase.budgetUSD > 0) {
      const spent = (activePhase.spentUSD / activePhase.budgetUSD) * 100
      if (spent >= 80) {
        alerts.push({
          type: 'BUDGET_ALERT',
          severity: 'yellow',
          message: `${proj.code} ${proj.name} — fase ${activePhase.phase}: ${Math.round(spent)}% del presupuesto utilizado con ${activePhase.progressPercent}% de avance`,
          href: `/projects?id=${proj.id}`,
        })
      }
    }
  }

  // Overloaded team members — same calculation as the Studio page
  const capacity = await StudioService.getCapacity({ currentUser: user })
  for (const m of capacity.members.filter((m) => m.isOverloaded).slice(0, 3)) {
    alerts.push({
      type: 'CAPACITY_ALERT',
      severity: 'yellow',
      message: `${m.name} al ${m.utilizationPercent}% de capacidad esta semana — considerar rebalancear`,
      href: '/studio',
    })
  }

  // High-probability negotiation leads
  const hotLeads = await prisma.lead.findMany({
    where: { pipelineStage: 'NEGOTIATION', closeProbability: { gte: 80 } },
    orderBy: { closeProbability: 'desc' },
    take: 2,
  })
  for (const lead of hotLeads) {
    alerts.push({
      type: 'OPPORTUNITY',
      severity: 'blue',
      message: `${lead.projectName} en negociación — ${lead.closeProbability}% probabilidad`,
      href: `/bd?lead=${lead.id}`,
    })
  }

  return alerts.slice(0, 6)
})

function formatCurrency(amount: number): string {
  if (amount >= 1000) return `$${Math.round(amount).toLocaleString('en-US')}`
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}