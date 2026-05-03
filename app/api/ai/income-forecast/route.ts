import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getClaude } from '@/lib/claude'

// GET /api/ai/income-forecast — revenue forecast based on pipeline probability × value
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

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

    // Call Claude to generate narrative
    const claude = getClaude()

    const prompt = `Eres el asistente financiero de CHAO OS. Analiza los datos de forecast y genera una narrativa en español.

## Datos del Forecast

### Pipeline de Leads:
- Valor bruto total: $${pipelineRaw.toLocaleString()}
- Valor ponderado (probabilidad): $${pipelineWeighted.toLocaleString()}
- Total leads activos: ${leads.length}

### Leads en negociación (cerrando este mes):
${leadsClosingThisMonth.length > 0 ? leadsClosingThisMonth.map(l =>
  `- ${l.name} (${l.company}) — $${l.value.toLocaleString()} @ ${l.probability}% — Asignado a: ${l.assignedTo}`
).join('\n') : 'Sin leads cerrando este mes'}

### Ingresos Comprometidos:
- Proyectos activos: ${projects.length}
- Revenue comprometido: $${committedRevenue.toLocaleString()}
- Facturación esperada este trimestre: $${expectedThisQuarter.toLocaleString()}

### Proyectos facturando este mes:
${projectsInvoicingThisMonth.length > 0 ? projectsInvoicingThisMonth.map(p =>
  `- ${p.name} (${p.client}) — $${p.value.toLocaleString()}`
).join('\n') : 'Sin proyectos facturando este mes'}

### Nivel de confianza: ${confidenceLevel}

## Instrucciones
Genera una narrativa financiera en español (máx 400 caracteres) que:
1. Explique brevemente la situación del pipeline
2. Destaque los leads más importantes cerrando este mes
3. Indique el nivel de confianza del forecast
4. Dé una recomendación corta (qué hacer con el forecast)

Devuelve SOLO JSON válido con este formato exacto:
{
  "narrative": "texto narrativo en español, máximo 400 caracteres"
}`

    const responseText = await claude.complete(prompt, { maxTokens: 1024, temperature: 0.3 })

    let narrative = 'Forecast basado en datos actuales del pipeline y proyectos activos.'
    try {
      const jsonMatch = responseText.match(/{[\s\S]*}/m)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        narrative = parsed.narrative ?? narrative
      }
    } catch {
      console.error('Failed to parse narrative JSON from Claude response')
    }

    return Response.json({
      success: true,
      data: {
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
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('GET /api/ai/income-forecast error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}