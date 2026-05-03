import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { getClaude } from '@/lib/claude'
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
- Cuando preguntes sobre leads o pipeline: dirige a /leads
- Cuando preguntes sobre scoring: dirige a /leads/[id]/ai-score
- Precisión con probabilidades y valores en USD.`,

    projects: `CONTEXTO: Gestión de Proyectos
- Fases: SD → DD → CD → CA (Schematic Design, Design Development, Construction Documents, CA)
- Estados: ON_TRACK, AT_RISK, OVER_BUDGET, CLOSING, COMPLETED
- Presupuesto y control de gastos, team capacity y utilization, hitos y entregables
- Cuando preguntes sobre proyectos: dirige a /projects
- Cuando preguntes sobre fases o progreso: dirige a /projects/[id]
- Menciona el código del proyecto cuando sea relevante.`,

    finance: `CONTEXTO: Finanzas
- Facturas: estados DRAFT → SENT → PENDING → OVERDUE → PAID
- Flujo de caja (cashflow), estado de resultados (P&L)
- Tipo de cambio USD/BOB
- Cuando preguntes sobre facturas: dirige a /invoices
- Cuando preguntes sobre cashflow: dirige a /finance/cashflow
- Precisión con montos en USD y fechas de vencimiento.`,

    general: `Eres un asistente general para CHAO OS. Puedes ayudar con cualquier tema: leads, proyectos, finanzas, equipo, capacidades, alertas, o preguntas generales sobre la empresa.`,
  }

  return `${base}\n\n${contextInstructions[context ?? 'general']}`
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

    const systemPrompt = buildSystemPrompt(context)
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