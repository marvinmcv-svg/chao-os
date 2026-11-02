import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { getClaude } from '@/lib/claude'
import { prisma } from '@/lib/prisma'
import type { ClaudeMessage } from '@/lib/types/claude'

type ChatContext = 'bd' | 'projects' | 'finance' | 'general'

interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  context?: ChatContext
}

function buildSystemPrompt(context?: ChatContext): string {
  const base = `Eres un asistente IA profesional para CHAO Arquitectura S.R.L., una firma de arquitectura en Santa Cruz de la Sierra, Bolivia. Estás integrado en CHAO OS, su sistema de gestión.

Tu rol es ser un asistente experto y proactivo que ayuda en todas las áreas del negocio. Responde en español, sé conciso pero accionable. Cuando menciones datos específicos, indica el módulo/página relevante.`

  const contextInstructions: Record<ChatContext, string> = {
    bd: `CONTEXTO: Desarrollo de Negocios (BD)
- Pipeline de leads: etapas PROSPECT → QUALIFIED → PROPOSAL → NEGOTIATION → WON/LOST
- Scoring con IA: margen, historial del cliente, capacidad del equipo, complejidad, competencia
- Métricas: valor ponderado del pipeline, tasa de conversión, tiempo promedio de cierre
- Recomendaciones GO/NO-GO para propuestas
- Cuando preguntes sobre leads o pipeline: dirige a /bd
- Cuando preguntes sobre scoring: dirige a Business Dev (/bd), abre el lead y usa "Calificar con IA"
- Precisión con probabilidades y valores en USD.`,

    projects: `CONTEXTO: Gestión de Proyectos
- Fases: SD → DD → CD → CA (Schematic Design, Design Development, Construction Documents, CA)
- Estados: ON_TRACK, AT_RISK, OVER_BUDGET, CLOSING, COMPLETED
- Presupuesto y control de gastos, team capacity y utilization, hitos y entregables
- Cuando preguntes sobre proyectos: dirige a /projects
- Cuando preguntes sobre fases o progreso: dirige a /projects (pestaña Cronograma para fases)
- Menciona el código del proyecto cuando sea relevante.`,

    finance: `CONTEXTO: Finanzas
- Facturas: estados DRAFT → SENT → PENDING → OVERDUE → PAID
- Flujo de caja (cashflow), estado de resultados (P&L)
- Tipo de cambio USD/BOB
- Cuando preguntes sobre facturas: dirige a /finance
- Cuando preguntes sobre cashflow: dirige a /finance (vista Análisis)
- Precisión con montos en USD y fechas de vencimiento.`,

    general: `Eres un asistente general para CHAO OS. Puedes ayudar con cualquier tema: leads, proyectos, finanzas, equipo, capacidades, alertas, o preguntas generales sobre la empresa.`,
  }

  return `${base}\n\n${contextInstructions[context ?? 'general']}`
}

/** Compact, live snapshot of studio data so answers are grounded in real numbers. */
async function buildDataSnapshot(): Promise<string> {
  try {
    const [projects, leads, invoices] = await Promise.all([
      prisma.project.findMany({
        where: { status: { not: 'COMPLETED' } },
        select: { code: true, name: true, status: true, currentPhase: true, overallProgressPercent: true, totalBudgetUSD: true, totalSpentUSD: true, estimatedEndDate: true, client: { select: { company: true } } },
        take: 30,
      }),
      prisma.lead.findMany({
        where: { pipelineStage: { notIn: ['WON', 'LOST'] } },
        select: { projectName: true, company: true, pipelineStage: true, estimatedValueUSD: true, closeProbability: true, aiScore: true },
        take: 30,
      }),
      prisma.invoice.findMany({
        where: { status: { in: ['SENT', 'PENDING', 'OVERDUE'] } },
        select: { number: true, status: true, amountUSD: true, dueDate: true, project: { select: { code: true } } },
        take: 30,
      }),
    ])
    const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
    return [
      `DATOS EN VIVO (${new Date().toISOString().slice(0, 10)}):`,
      'Proyectos activos:',
      ...projects.map((p) => `- ${p.code} ${p.name} (${p.client.company}) · ${p.status} · fase ${p.currentPhase} · avance ${p.overallProgressPercent}% · gastado ${usd(p.totalSpentUSD)}/${usd(p.totalBudgetUSD)} · fin ${p.estimatedEndDate.toISOString().slice(0, 10)}`),
      'Pipeline abierto:',
      ...leads.map((l) => `- ${l.projectName} (${l.company}) · ${l.pipelineStage} · ${usd(l.estimatedValueUSD)} @ ${l.closeProbability}%${l.aiScore != null ? ` · score IA ${l.aiScore}` : ''}`),
      'Facturas por cobrar:',
      ...invoices.map((i) => `- ${i.number} (${i.project.code}) · ${i.status} · ${usd(i.amountUSD)} · vence ${i.dueDate.toISOString().slice(0, 10)}`),
      'Usa solo estos datos para cifras concretas; si falta información, dilo.',
    ].join('\n')
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
        { status: 401 }
      )
    }

    const body = (await req.json()) as ChatRequest
    const { messages, context } = body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { success: false, error: { code: 'INVALID_REQUEST', message: 'messages es requerido y no puede estar vacío' } },
        { status: 400 }
      )
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'AI_NOT_CONFIGURED',
            message: 'El chat necesita ANTHROPIC_API_KEY en el servidor. Las alertas y el forecast siguen funcionando con reglas.',
          },
        },
        { status: 503 }
      )
    }

    const systemPrompt = `${buildSystemPrompt(context)}\n\n${await buildDataSnapshot()}`
    const claude = getClaude()

    const claudeStream = await claude.chatStream(
      messages as ClaudeMessage[],
      { system: systemPrompt, maxTokens: 2048 }
    )

    const reader = claudeStream.getReader()
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        let fullContent = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            if (value.type === 'content_block_delta' && value.delta.type === 'text_delta' && value.delta.text) {
              fullContent += value.delta.text
              const chunk = JSON.stringify({ content: value.delta.text })
              controller.enqueue(encoder.encode(`event: chunk\ndata: ${chunk}\n\n`))
            } else if (value.type === 'message_stop') {
              const usage = { inputTokens: 0, outputTokens: 0 }
              controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ content: fullContent, usage })}\n\n`))
            }
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Error desconocido'
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: errMsg })}\n\n`))
        } finally {
          controller.close()
        }
      },
      cancel() {
        reader.cancel()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('POST /api/ai/chat error:', error)
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } },
      { status: 500 }
    )
  }
}