import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getClaude } from '@/lib/claude'

// GET /api/ai/alerts — AI-generated budget and capacity alerts
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    // Fetch projects with budget/spent data
    const projects = await prisma.project.findMany({
      where: { status: { not: 'COMPLETED' } },
      select: {
        id: true,
        code: true,
        name: true,
        totalBudgetUSD: true,
        totalSpentUSD: true,
        status: true,
        projectManager: { select: { id: true, name: true } },
        phases: {
          select: { phase: true, budgetUSD: true, spentUSD: true, status: true },
        },
      },
    })

    // Fetch team members with capacity/utilization
    const teamMembers = await prisma.teamMember.findMany({
      where: { utilizationPercent: { gt: 0 } },
      include: { user: { select: { id: true, name: true } } },
    })

    // Fetch overdue invoices
    const overdueInvoices = await prisma.invoice.findMany({
      where: { status: 'OVERDUE' },
      include: {
        project: { select: { name: true, code: true } },
        client: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    })

    // Fetch at-risk milestones
    const now = new Date()
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const atRiskMilestones = await prisma.milestone.findMany({
      where: {
        status: { not: 'APPROVED' },
        dueDate: { lte: thirtyDaysFromNow, gte: now },
      },
      include: {
        project: { select: { id: true, name: true, code: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 5,
    })

    // Build context for Claude
    const budgetAlerts = projects
      .filter(p => p.totalBudgetUSD > 0 && (p.totalSpentUSD / p.totalBudgetUSD) >= 0.80)
      .map(p => ({
        projectId: p.id,
        code: p.code,
        name: p.name,
        budget: p.totalBudgetUSD,
        spent: p.totalSpentUSD,
        percent: Math.round((p.totalSpentUSD / p.totalBudgetUSD) * 100),
        status: p.status,
        projectManager: p.projectManager?.name ?? 'Sin asignar',
      }))

    const capacityAlerts = teamMembers
      .filter(tm => tm.utilizationPercent >= 100)
      .map(tm => ({
        teamMemberId: tm.id,
        name: tm.user.name,
        utilization: tm.utilizationPercent,
        role: tm.role,
      }))

    const paymentAlerts = overdueInvoices.map(inv => {
      const daysOverdue = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24))
      return {
        invoiceId: inv.id,
        number: inv.number,
        projectName: inv.project?.name ?? '',
        projectCode: inv.project?.code ?? '',
        clientName: inv.client.name,
        amountUSD: inv.amountUSD,
        daysOverdue,
        severity: daysOverdue > 30 ? 'critical' : 'warning',
      }
    })

    const milestoneAlerts = atRiskMilestones.map(m => {
      const daysUntilDue = Math.floor((new Date(m.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return {
        milestoneId: m.id,
        label: m.label,
        projectId: m.project.id,
        projectName: m.project.name,
        projectCode: m.project.code,
        dueDate: m.dueDate.toISOString(),
        daysUntilDue,
      }
    })

    // Call Claude to generate actionable alerts
    const claude = getClaude()

    const prompt = `Eres el asistente de gestión de proyectos de CHAO OS. Analiza los siguientes datos y genera alertas accionables en español.

## Datos de Alertas

### Proyectos con Sobre/Gasto de Presupuesto (≥80%):
${budgetAlerts.length > 0 ? budgetAlerts.map(p =>
  `- ${p.code} "${p.name}" — ${p.percent}% gastado ($${p.spent.toLocaleString()} / $${p.budget.toLocaleString()}), PM: ${p.projectManager}, estado: ${p.status}`
).join('\n') : 'Sin proyectos en presupuesto crítico'}

### Miembros del Equipo con Sobrecarga (≥100%):
${capacityAlerts.length > 0 ? capacityAlerts.map(t =>
  `- ${t.name} (${t.role}) — ${t.utilization}% de utilización`
).join('\n') : 'Sin miembros sobrecargados'}

### Facturas Vencidas:
${paymentAlerts.length > 0 ? paymentAlerts.map(p =>
  `- ${p.number} — ${p.projectCode} "${p.projectName}" — $${p.amountUSD.toLocaleString()}, ${p.daysOverdue} días de mora (${p.severity === 'critical' ? 'CRÍTICO >30 días' : 'ALERTA'})`
).join('\n') : 'Sin facturas vencidas'}

### Hitos en Riesgo (próximos 30 días):
${milestoneAlerts.length > 0 ? milestoneAlerts.map(m =>
  `- "${m.label}" — ${m.projectCode} "${m.projectName}" — vence en ${m.daysUntilDue} días (${m.dueDate.split('T')[0]})`
).join('\n') : 'Sin hitos en riesgo'}

## Instrucciones
Genera entre 3 y 8 alertas accionables. Cada alerta debe tener:
- id: string UUID v4
- type: uno de BUDGET_OVERRUN, CAPACITY_OVERLOAD, PAYMENT_OVERDUE, MILESTONE_AT_RISK
- severity: "critical" | "warning" | "info"
- title: título corto (max 80 chars)
- description: descripción del problema (max 200 chars)
- action: acción recomendada clara (max 150 chars)
- projectId: UUID del proyecto o null
- leadId: null siempre

## Reglas
- BUDGET_OVERRUN: proyectos ≥90% budget → critical, ≥80% → warning
- CAPACITY_OVERLOAD: ≥100% → critical, ≥90% → warning
- PAYMENT_OVERDUE: >30 días → critical, ≤30 días → warning
- MILESTONE_AT_RISK: ≤7 días → critical, ≤14 días → warning
- Máximo 8 alertas, priorizando criticales
- Todo en español
- Devuelve SOLO JSON válido array de alertas con la estructura exacta descrita`

    const responseText = await claude.complete(prompt, { maxTokens: 2048, temperature: 0.3 })

    let alerts: Array<{
      id: string
      type: 'BUDGET_OVERRUN' | 'CAPACITY_OVERLOAD' | 'PAYMENT_OVERDUE' | 'MILESTONE_AT_RISK'
      severity: 'critical' | 'warning' | 'info'
      title: string
      description: string
      action: string
      projectId: string | null
      leadId: null
    }> = []

    try {
      // Try to parse JSON from the response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/m)
      if (jsonMatch) {
        alerts = JSON.parse(jsonMatch[0])
      }
    } catch {
      // If parsing fails, fall back to empty alerts
      console.error('Failed to parse alerts JSON from Claude response')
    }

    return Response.json({
      success: true,
      data: {
        alerts,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('GET /api/ai/alerts error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}