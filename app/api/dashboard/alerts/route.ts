import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const alerts: { type: string; severity: 'red' | 'yellow' | 'blue' | 'green'; message: string }[] = []

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
        message: `${inv.number} — ${formatCurrency(inv.amountUSD)}, ${days} días de mora`,
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
            message: `${proj.code} — fase ${activePhase.phase}: ${Math.round(spent)}% del presupuesto utilizado`,
          })
        }
      }
    }

    // Overloaded team members
    const overloaded = await prisma.teamMember.findMany({
      where: { utilizationPercent: { gte: 90 } },
      include: { user: { select: { name: true } } },
      take: 3,
    })
    for (const m of overloaded) {
      alerts.push({
        type: 'CAPACITY_ALERT',
        severity: 'yellow',
        message: `${m.user.name} al ${m.utilizationPercent}% de capacidad — considerar rebalancear`,
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
      })
    }

    return Response.json({ success: true, data: alerts.slice(0, 6) })
  } catch (error) {
    console.error('GET /api/dashboard/alerts error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}

function formatCurrency(amount: number): string {
  if (amount >= 1000) return `$${Math.round(amount).toLocaleString('en-US')}`
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}