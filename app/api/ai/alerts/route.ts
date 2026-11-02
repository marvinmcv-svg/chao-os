import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { getClaude } from '@/lib/claude'
import { StudioService } from '@/services/StudioService'

// GET /api/ai/alerts — AI-generated budget and capacity alerts
export const GET = withApiHandler(async (_req: NextRequest) => {
  const user = await requireAuth()

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

  // Team utilisation — same calculation as the Studio page
  const capacity = await StudioService.getCapacity({ currentUser: user })

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
      status: { notIn: ['APPROVED', 'approved'] },
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

  const capacityAlerts = capacity.members
    .filter(tm => tm.utilizationPercent >= 90)
    .map(tm => ({
      teamMemberId: tm.id,
      name: tm.name,
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

  // Deterministic rule-based alerts — always available, and the fallback when
  // Claude is not configured or fails (previously the endpoint returned 500).
  type Alert = {
    id: string
    type: 'BUDGET_OVERRUN' | 'CAPACITY_OVERLOAD' | 'PAYMENT_OVERDUE' | 'MILESTONE_AT_RISK'
    severity: 'critical' | 'warning' | 'info'
    title: string
    description: string
    action: string
    projectId: string | null
    leadId: null
  }
  const ruleAlerts: Alert[] = [
    ...budgetAlerts.map((p): Alert => ({
      id: `budget-${p.projectId}`,
      type: 'BUDGET_OVERRUN',
      severity: p.percent >= 90 ? 'critical' : 'warning',
      title: `${p.code} · ${p.name}: ${p.percent}% del honorario consumido`,
      description: `$${Math.round(p.spent).toLocaleString('en-US')} de $${Math.round(p.budget).toLocaleString('en-US')} usados. PM: ${p.projectManager}.`,
      action: p.percent >= 100 ? 'Negociar adicional o cambio de alcance con el cliente.' : 'Revisar horas restantes por fase y ajustar el plan de trabajo.',
      projectId: p.projectId,
      leadId: null,
    })),
    ...capacityAlerts.map((t): Alert => ({
      id: `cap-${t.teamMemberId}`,
      type: 'CAPACITY_OVERLOAD',
      severity: t.utilization >= 110 ? 'critical' : 'warning',
      title: `${t.name} al ${t.utilization}% de capacidad`,
      description: `${t.role} con más carga asignada que horas disponibles.`,
      action: 'Reasignar tareas o mover entregables de baja prioridad.',
      projectId: null,
      leadId: null,
    })),
    ...paymentAlerts.map((p): Alert => ({
      id: `pay-${p.invoiceId}`,
      type: 'PAYMENT_OVERDUE',
      severity: p.severity === 'critical' ? 'critical' : 'warning',
      title: `${p.number} vencida hace ${p.daysOverdue} días`,
      description: `${p.clientName} · ${p.projectCode} — $${Math.round(p.amountUSD).toLocaleString('en-US')} pendiente.`,
      action: p.daysOverdue > 60 ? 'Escalar a socio y condicionar próximos entregables al pago.' : 'Enviar recordatorio de cobro y llamar al cliente.',
      projectId: null,
      leadId: null,
    })),
    ...milestoneAlerts.map((m): Alert => ({
      id: `ms-${m.milestoneId}`,
      type: 'MILESTONE_AT_RISK',
      severity: m.daysUntilDue <= 7 ? 'critical' : m.daysUntilDue <= 14 ? 'warning' : 'info',
      title: `Hito "${m.label}" vence en ${m.daysUntilDue} días`,
      description: `${m.projectCode} · ${m.projectName}`,
      action: 'Confirmar estado del entregable con el equipo y el cliente.',
      projectId: m.projectId,
      leadId: null,
    })),
  ].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : b.severity === 'critical' ? 1 : a.severity === 'warning' ? -1 : 1))

  let alerts: Alert[] = ruleAlerts
  let source: 'claude' | 'rules' = 'rules'

  if (process.env.ANTHROPIC_API_KEY && ruleAlerts.length > 0) {
    try {
      const claude = getClaude()
      const prompt = `Eres el asistente de gestión de CHAO Arquitectura. Reescribe y prioriza estas alertas para un socio del estudio, en español, concisas y accionables.

${JSON.stringify(ruleAlerts)}

Devuelve SOLO un array JSON con la misma estructura (id, type, severity, title, description, action, projectId, leadId), conservando id, type y projectId. Máximo 8 alertas, críticas primero.`
      const responseText = await claude.complete(prompt, { maxTokens: 2048, temperature: 0.3 })
      const jsonMatch = responseText.match(/\[[\s\S]*\]/m)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (Array.isArray(parsed) && parsed.length > 0) {
          alerts = parsed
          source = 'claude'
        }
      }
    } catch (e) {
      console.error('[ai/alerts] Claude unavailable, using rule-based alerts:', e instanceof Error ? e.message : e)
    }
  }

  return {
    alerts,
    source,
    generatedAt: new Date().toISOString(),
  }
})