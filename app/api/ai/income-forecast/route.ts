import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { getClaude } from '@/lib/claude'

// GET /api/ai/income-forecast — revenue forecast based on pipeline probability × value
export const GET = withApiHandler(async (_req: NextRequest) => {
  await requireAuth()

  // Fetch active leads with estimated value and probability
  const leads = await prisma.lead.findMany({
    where: {
      pipelineStage: { in: ['PROSPECT', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION'] },
      estimatedValueUSD: { gt: 0 },
    },
    select: {
      id: true,
      projectName: true,
      company: true,
      estimatedValueUSD: true,
      closeProbability: true,
      pipelineStage: true,
      assignedTo: { select: { name: true } },
    },
    orderBy: { estimatedValueUSD: 'desc' },
  })

  // Fetch active projects with budget and paidToDate
  const projects = await prisma.project.findMany({
    where: { status: { in: ['ON_TRACK', 'AT_RISK', 'CLOSING'] } },
    include: {
      invoices: {
        where: { status: { in: ['PENDING', 'SENT'] } },
        select: { amountUSD: true, dueDate: true },
      },
      client: { select: { name: true } },
    },
  })

  // Calculate weighted pipeline
  const pipelineWeighted = leads.reduce((sum, l) => {
    return sum + l.estimatedValueUSD * (l.closeProbability / 100)
  }, 0)

  const pipelineRaw = leads.reduce((sum, l) => sum + l.estimatedValueUSD, 0)

  // Calculate committed revenue from active projects
  const committedRevenue = projects.reduce((sum, p) => sum + p.totalBudgetUSD, 0)

  // Expected this quarter — invoices due within current quarter
  const now = new Date()
  const quarterEnd = new Date(now)
  quarterEnd.setMonth(quarterEnd.getMonth() + 3 - (quarterEnd.getMonth() % 3))
  quarterEnd.setDate(0)

  const expectedThisQuarter = projects.reduce((sum, p) => {
    return sum + p.invoices
      .filter(inv => new Date(inv.dueDate) <= quarterEnd)
      .reduce((s, inv) => s + inv.amountUSD, 0)
  }, 0)

  // Leads closing this month
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const leadsClosingThisMonth = leads
    .filter(l => l.closeProbability >= 60 && l.pipelineStage === 'NEGOTIATION')
    .map(l => ({
      name: l.projectName,
      company: l.company,
      value: l.estimatedValueUSD,
      probability: l.closeProbability,
      assignedTo: l.assignedTo?.name ?? 'No asignado',
    }))

  // Projects invoicing this month
  const projectsInvoicingThisMonth = projects
    .filter(p => p.invoices.some(inv => {
      const due = new Date(inv.dueDate)
      return due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear()
    }))
    .map(p => {
      const totalInvoicing = p.invoices
        .filter(inv => {
          const due = new Date(inv.dueDate)
          return due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear()
        })
        .reduce((sum, inv) => sum + inv.amountUSD, 0)
      return {
        name: p.name,
        client: p.client?.name ?? 'N/A',
        value: totalInvoicing,
      }
    })

  // Determine confidence level based on data quality
  const hasProbabilityData = leads.some(l => l.closeProbability > 0)
  const activeProjectsCount = projects.length
  const confidenceLevel = (!hasProbabilityData || activeProjectsCount === 0) ? 'low'
    : (hasProbabilityData && activeProjectsCount >= 3) ? 'high'
    : 'medium'

  // Rule-based narrative (always available); Claude refines it when configured.
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
  const top = leadsClosingThisMonth[0]
  let narrative =
    `Pipeline ponderado de ${fmt(pipelineWeighted)} sobre ${leads.length} oportunidades (${fmt(pipelineRaw)} bruto). ` +
    `Se esperan ${fmt(expectedThisQuarter)} en cobros este trimestre de ${projects.length} proyectos activos. ` +
    (top ? `Prioridad: cerrar ${top.name} (${fmt(top.value)} al ${top.probability}%). ` : 'No hay negociaciones avanzadas: reforzar prospección. ') +
    `Confianza ${confidenceLevel === 'high' ? 'alta' : confidenceLevel === 'medium' ? 'media' : 'baja'}.`
  let source: 'claude' | 'rules' = 'rules'

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const claude = getClaude()
      const prompt = `Eres el asistente financiero de CHAO Arquitectura. Con estos datos escribe una narrativa en español (máx 400 caracteres) sobre el pipeline, los cierres del mes, la confianza y una recomendación.
Datos: ${JSON.stringify({ pipelineRaw, pipelineWeighted, leads: leads.length, leadsClosingThisMonth, committedRevenue, expectedThisQuarter, projectsInvoicingThisMonth, confidenceLevel })}
Devuelve SOLO JSON: {"narrative": "..."}`
      const responseText = await claude.complete(prompt, { maxTokens: 1024, temperature: 0.3 })
      const jsonMatch = responseText.match(/{[\s\S]*}/m)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.narrative) {
          narrative = parsed.narrative
          source = 'claude'
        }
      }
    } catch (e) {
      console.error('[ai/income-forecast] Claude unavailable, using rule-based narrative:', e instanceof Error ? e.message : e)
    }
  }

  return {
    forecast: {
      pipelineWeighted,
      pipelineRaw,
      committedRevenue,
      expectedThisQuarter,
      confidenceLevel: confidenceLevel as 'low' | 'medium' | 'high',
      narrative,
      leadsClosingThisMonth: leadsClosingThisMonth.slice(0, 5),
      projectsInvoicingThisMonth: projectsInvoicingThisMonth.slice(0, 5),
    },
    source,
    generatedAt: new Date().toISOString(),
  }
})