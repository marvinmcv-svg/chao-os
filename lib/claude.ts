/**
 * Cliente de Claude API — CHAO OS
 * Usa Anthropic Messages API via fetch nativo (sin paquete anthropic)
 *
 * Exports:
 *   Claude        — clase cliente con chat(), complete(), chatStream(), chatWithRetry(), completeWithRetry()
 *   ClaudeError   — errores con códigos: RATE_LIMIT, API_ERROR, TIMEOUT, INVALID_REQUEST
 *   getClaude()   — instancia singleton
 *   scoreLead()   — scoring Go/No-Go de leads (función de alto nivel)
 *   generateProposalDraft() — genera memo de propuesta (función de alto nivel)
 */

// Re-export de tipos
export type { ClaudeMessage, ClaudeResponse, ClaudeStreamChunk, ClaudeModel } from './types/claude'

import type { ClaudeMessage, ClaudeResponse, ClaudeStreamChunk, ClaudeModel } from './types/claude'

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------

export class ClaudeError extends Error {
  constructor(
    public readonly code: 'RATE_LIMIT' | 'API_ERROR' | 'TIMEOUT' | 'INVALID_REQUEST',
    message: string,
    public readonly status?: number,
    public readonly retryAfter?: number
  ) {
    super(message)
    this.name = 'ClaudeError'
  }
}

// ---------------------------------------------------------------------------
// Configuración desde env
// ---------------------------------------------------------------------------

interface ClaudeConfig {
  apiKey: string
  model: ClaudeModel
  maxTokens: number
}

function getEnvConfig(): ClaudeConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY no está definida en las variables de entorno')
  }

  return {
    apiKey,
    model: (process.env.CLAUDE_MODEL as ClaudeModel) ?? 'claude-sonnet-4-6',
    maxTokens: Number(process.env.CLAUDE_MAX_TOKENS ?? '4096'),
  }
}

// ---------------------------------------------------------------------------
// Cliente principal
// ---------------------------------------------------------------------------

export interface ChatOptions {
  model?: ClaudeModel
  maxTokens?: number
  temperature?: number
  system?: string
}

export interface CompleteOptions {
  model?: ClaudeModel
  maxTokens?: number
  temperature?: number
}

interface ClaudeInitConfig {
  apiKey?: string
  model?: ClaudeModel
  maxTokens?: number
}

export class Claude {
  private readonly apiKey: string
  private readonly model: ClaudeModel
  private readonly maxTokens: number
  private readonly baseUrl = 'https://api.anthropic.com/v1/messages'

  constructor(config?: ClaudeInitConfig) {
    const env = getEnvConfig()
    this.apiKey = config?.apiKey ?? env.apiKey
    this.model = config?.model ?? env.model
    this.maxTokens = config?.maxTokens ?? env.maxTokens
  }

  // -------------------------------------------------------------------------
  // Métodos públicos
  // -------------------------------------------------------------------------

  /**
   * Chat con historial de mensajes — retorna respuesta completa
   */
  async chat(messages: ClaudeMessage[], options: ChatOptions = {}): Promise<ClaudeResponse> {
    const { model = this.model, maxTokens = this.maxTokens, temperature, system } = options

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: messages.map(normalizeMessage),
    }

    if (system) body.system = system
    if (temperature !== undefined) body.temperature = temperature

    const response = await this.request(body)
    if (!response.ok) await this.handleErrorResponse(response)

    const data = await response.json()

    return {
      id: data.id,
      type: data.type,
      role: data.role,
      content: (data.content as Array<{ type: string; text?: string }>).map((block) => ({
        type: block.type as 'text',
        text: block.text ?? '',
      })),
      model: data.model,
      stopReason: data.stop_reason,
      stopSequence: data.stop_sequence,
      usage: {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      },
    }
  }

  /**
   * Completion de texto único (con prompt como mensaje de usuario)
   */
  async complete(prompt: string, options: CompleteOptions = {}): Promise<string> {
    const { model = this.model, maxTokens = this.maxTokens, temperature } = options

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }

    if (temperature !== undefined) body.temperature = temperature

    const response = await this.request(body)
    if (!response.ok) await this.handleErrorResponse(response)

    const data = await response.json()
    const textBlock = (data.content as Array<{ type: string; text?: string }>).find(
      (block) => block.type === 'text'
    )
    return textBlock?.text ?? ''
  }

  /**
   * Chat con streaming SSE — retorna ReadableStream para Next.js App Router
   *
   * Uso en route handler:
   *   const stream = await claude.chatStream(messages)
   *   return new Response(stream, {
   *     headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
   *   })
   */
  async chatStream(
    messages: ClaudeMessage[],
    options: ChatOptions = {}
  ): Promise<ReadableStream<ClaudeStreamChunk>> {
    const { model = this.model, maxTokens = this.maxTokens, temperature, system } = options

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: messages.map(normalizeMessage),
      stream: true,
    }

    if (system) body.system = system
    if (temperature !== undefined) body.temperature = temperature

    const response = await this.request(body)
    if (!response.ok) await this.handleErrorResponse(response)

    if (!response.body) {
      throw new ClaudeError('API_ERROR', 'Respuesta sin cuerpo (body)', response.status)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    return new ReadableStream<ClaudeStreamChunk>({
      async pull(controller) {
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          return
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            controller.close()
            return
          }

          try {
            const event = JSON.parse(data) as {
              type?: string
              index?: number
              delta?: { type?: string; text?: string }
              content_block?: { type?: string; text?: string }
              usage?: { input_tokens?: number; output_tokens?: number }
              stop_reason?: string
              message?: { id?: string }
            }

            switch (event.type) {
              case 'message_start':
                controller.enqueue({
                  type: 'message_start',
                  message: {
                    id: event.message?.id ?? '',
                    type: 'message',
                    role: 'assistant',
                    content: [],
                    model: model,
                  },
                })
                break

              case 'content_block_start':
                controller.enqueue({
                  type: 'content_block_start',
                  index: event.index ?? 0,
                  contentBlock: { type: event.content_block?.type || 'text', text: event.content_block?.text },
                })
                break

              case 'content_block_delta':
                controller.enqueue({
                  type: 'content_block_delta',
                  index: event.index ?? 0,
                  delta: { type: event.delta?.type || 'text_delta', text: event.delta?.text },
                })
                break

              case 'message_delta':
                controller.enqueue({
                  type: 'message_delta',
                  delta: { type: event.delta?.type || 'text_delta', text: event.delta?.text },
                  stopReason: event.stop_reason,
                })
                break

              case 'message_stop':
                controller.enqueue({ type: 'message_stop' })
                break
            }
          } catch {
            // Ignorar líneas JSON inválidas que no se puedan parsear
          }
        }
      },
      cancel() {
        reader.cancel()
      },
    })
  }

  /**
   * Chat con reintento automático — 3 intentos: 1s, 2s, 4s
   * Reintenta en 429 (rate limit), 500, 502, 503
   */
  async chatWithRetry(messages: ClaudeMessage[], options: ChatOptions = {}): Promise<ClaudeResponse> {
    const delays = [1000, 2000, 4000]
    let lastError: ClaudeError | null = null

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        return await this.chat(messages, options)
      } catch (error) {
        if (!(error instanceof ClaudeError)) throw error

        const isRetryable =
          error.code === 'RATE_LIMIT' ||
          (error.code === 'API_ERROR' && error.status && [500, 502, 503].includes(error.status))

        if (!isRetryable || attempt === delays.length) throw error

        const delay =
          error.code === 'RATE_LIMIT' && error.retryAfter
            ? error.retryAfter * 1000
            : delays[attempt]

        await sleep(delay)
        lastError = error
      }
    }

    throw lastError
  }

  /**
   * Complete con reintento automático
   */
  async completeWithRetry(prompt: string, options: CompleteOptions = {}): Promise<string> {
    const delays = [1000, 2000, 4000]
    let lastError: ClaudeError | null = null

    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        return await this.complete(prompt, options)
      } catch (error) {
        if (!(error instanceof ClaudeError)) throw error

        const isRetryable =
          error.code === 'RATE_LIMIT' ||
          (error.code === 'API_ERROR' && error.status && [500, 502, 503].includes(error.status))

        if (!isRetryable || attempt === delays.length) throw error

        const delay =
          error.code === 'RATE_LIMIT' && error.retryAfter
            ? error.retryAfter * 1000
            : delays[attempt]

        await sleep(delay)
        lastError = error
      }
    }

    throw lastError
  }

  // -------------------------------------------------------------------------
  // Helpers privados
  // -------------------------------------------------------------------------

  private async request(body: Record<string, unknown>): Promise<Response> {
    return fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorBody: { type?: string; error?: { type?: string; message?: string } } = {}
    try {
      errorBody = await response.json()
    } catch {
      // Ignorar errores de parsing del body de error
    }

    const message = errorBody?.error?.message ?? `HTTP ${response.status}`

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') ?? 0)
      throw new ClaudeError('RATE_LIMIT', message, response.status, retryAfter)
    }

    if ([500, 502, 503].includes(response.status)) {
      throw new ClaudeError('API_ERROR', message, response.status)
    }

    if (response.status === 400) {
      throw new ClaudeError('INVALID_REQUEST', message, response.status)
    }

    throw new ClaudeError('API_ERROR', message, response.status)
  }
}

// ---------------------------------------------------------------------------
// Instancia singleton
// ---------------------------------------------------------------------------

let _instance: Claude | null = null

export function getClaude(): Claude {
  if (!_instance) _instance = new Claude()
  return _instance
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function normalizeMessage(
  msg: ClaudeMessage | { role: string; content: string }
): { role: 'user' | 'assistant'; content: string } {
  return {
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content:
      typeof msg.content === 'string'
        ? msg.content
        : (msg.content as Array<{ type: string; text: string }>)
            .map((c) => c.text)
            .join(''),
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Funciones de alto nivel para rutas existentes
// ---------------------------------------------------------------------------

interface LeadScoringInput {
  projectName: string
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string
  estimatedValueUSD: number
  projectType: string
  pipelineStage: string
  closeProbability: number
  sourceType: string
  notes: string
  assignedToName: string
  industry?: string
  country?: string
  contactFrequency?: string
}

interface AIScoreResult {
  financialScore: number
  technicalScore: number
  commercialScore: number
  legalScore: number
  executionScore: number
  overallScore: number
  recommendation: 'GO' | 'NO_GO' | 'REVIEW'
  summary: string
  keyStrengths: string[]
  keyRisks: string[]
  nextSteps: string[]
}

/**
 * Scores a lead's Go/No-Go viability using structured AI analysis.
 * Returns scores for 5 dimensions plus overall recommendation.
 */
export async function scoreLead(lead: LeadScoringInput): Promise<AIScoreResult> {
  const DIMENSION_DEFINITIONS = `
DEFINICIONES DE LAS 5 DIMENSIONES:
1. FINANCIERO (0-100): Evalúa la salud financiera del lead/prospecto.
   - Historial de pagos y solvencia crediticia
   - Capacidad de inversión (relación presupuesto/ingresos)
   - Estabilidad financiera de la empresa
   - Riesgos de flujo de caja durante el proyecto
   - Márgenes de rentabilidad esperados

2. TÉCNICO (0-100): Evalúa la factibilidad técnica del proyecto.
   - Complejidad arquitectónica y necesidades técnicas
   - Disponibilidad de recursos tecnológicos
   - Requisitos de personal especializado
   - Infraestructura disponible
   - Potenciales cuellos de botella técnicos

3. COMERCIAL (0-100): Evalúa el potencial comercial y estratégico.
   - Tamaño del proyecto y valor estimado
   - Potencial de negocio a largo plazo
   - Posición competitiva en el mercado
   - Ajuste del proyecto con capacidades de la firma
   - Potencial de referencias y nuevos clientes

4. LEGAL (0-100): Evalúa el riesgo legal y contractual.
   - Claridad en documentos y contratos
   - Riesgos regulatorios y de cumplimiento
   - Historial legal del cliente
   - Complejidad de approvals y permisos
   - Exposición a litigios

5. EJECUCIÓN (0-100): Evalúa la probabilidad de ejecución exitosa.
   - Disponibilidad del equipo y capacidad
   - Experiencia previa en proyectos similares
   - Calidad de comunicación con el cliente
   - Timeline realista y recursos adecuados
   - Historial de entrega a tiempo
`

  const prompt = `Eres un analista senior de negocios para una firma de arquitectura en Bolivia. Analiza el siguiente lead y determina si es recomendable avanzar con una propuesta comercial.

${DIMENSION_DEFINITIONS}

INFORMACIÓN DEL LEAD:
- Nombre del proyecto: ${lead.projectName}
- Empresa: ${lead.company}
- Contacto: ${lead.contactName}
- Email: ${lead.contactEmail}
- Teléfono: ${lead.contactPhone || 'No disponible'}
- Tipo de proyecto: ${lead.projectType}
- Valor estimado (USD): ${lead.estimatedValueUSD.toLocaleString('es-BO')}
- Etapa en pipeline: ${lead.pipelineStage}
- Probabilidad de cierre (%): ${lead.closeProbability}
- Fuente: ${lead.sourceType}
- Asignado a: ${lead.assignedToName}
${lead.industry ? `- Industria: ${lead.industry}` : ''}
${lead.country ? `- País: ${lead.country}` : ''}
${lead.contactFrequency ? `- Frecuencia de contacto: ${lead.contactFrequency}` : ''}
${lead.notes ? `- Notas: ${lead.notes}` : ''}

REGLAS DE RECOMENDACIÓN:
- GO: overallScore >= 70, solución sólida en finanzas, técnica y ejecución
- NO_GO: overallScore < 50, riesgos financieros altos o viabilidad técnica cuestionable
- REVIEW: 50 <= overallScore < 70, necesita revisión adicional de ciertos aspectos

IDIOMA: Responde TODA la evaluación en español. Los campos keyStrengths, keyRisks y nextSteps deben ser máximo 3 elementos cada uno.

FORMATO DE RESPUESTA (JSON estricto):
{
  "financialScore": 0-100,
  "technicalScore": 0-100,
  "commercialScore": 0-100,
  "legalScore": 0-100,
  "executionScore": 0-100,
  "overallScore": 0-100,
  "recommendation": "GO" | "NO_GO" | "REVIEW",
  "summary": "2-3 sentence executive summary in Spanish",
  "keyStrengths": ["strength1", "strength2", "strength3"],
  "keyRisks": ["risk1", "risk2", "risk3"],
  "nextSteps": ["step1", "step2", "step3"]
}`

  const claude = getClaude()
  const responseText = await claude.complete(prompt, { maxTokens: 2048, temperature: 0.3 })

  const jsonMatch = responseText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error(`Claude response did not contain valid JSON: ${responseText.slice(0, 200)}`)
  }

  const parsed = JSON.parse(jsonMatch[0]) as AIScoreResult

  if (!['GO', 'NO_GO', 'REVIEW'].includes(parsed.recommendation)) {
    throw new Error(`Invalid recommendation from Claude: ${parsed.recommendation}`)
  }

  const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)))
  parsed.financialScore = clamp(parsed.financialScore)
  parsed.technicalScore = clamp(parsed.technicalScore)
  parsed.commercialScore = clamp(parsed.commercialScore)
  parsed.legalScore = clamp(parsed.legalScore)
  parsed.executionScore = clamp(parsed.executionScore)
  parsed.overallScore = clamp(parsed.overallScore)

  return parsed
}

// ---------------------------------------------------------------------------
// Tipos y función existente para generateProposalDraft
// ---------------------------------------------------------------------------

interface FirmInfo {
  name: string
  location: string
  founded: number
  services: string
}

interface LeadInfo {
  projectName: string
  company: string
  contactName: string
  contactEmail: string
  projectType: string
  estimatedValueUSD: number
  pipelineStage: string
  sourceType: string
  closeProbability: number
  notes: string
  assignedTo: string
}

export interface ProjectContext {
  code: string
  name: string
  client: { name: string | null; company: string | null; email: string | null }
  type: string
  contractType: string
  currentPhase: string
  totalBudgetUSD: number
  totalSpentUSD: number
  status: string
  startDate: Date
  estimatedEndDate: Date
  phases: Array<{
    phase: string
    label: string
    budgetUSD: number
    progressPercent: number
    status: string
    startDate: Date | null
    endDate: Date | null
  }>
  milestones: Array<{ label: string; dueDate: Date; status: string }>
}

interface GenerateProposalDraftParams {
  firm: FirmInfo
  lead: LeadInfo
  project: ProjectContext | null
}

/**
 * Generates a formal Spanish proposal memo using Claude AI.
 */
export async function generateProposalDraft(params: GenerateProposalDraftParams): Promise<string> {
  const { firm, lead, project } = params

  const today = new Date().toLocaleDateString('es-BO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const projectInfo = project
    ? `
PROYECTO EXISTENTE:
- Código: ${project.code}
- Nombre: ${project.name}
- Cliente: ${project.client?.name ?? 'N/A'} (${project.client?.company ?? 'N/A'})
- Tipo: ${project.type}
- Contrato: ${project.contractType}
- Fase actual: ${project.currentPhase}
- Presupuesto total: USD ${project.totalBudgetUSD.toLocaleString('es-BO')}
- Gastado: USD ${project.totalSpentUSD.toLocaleString('es-BO')}
- Estado: ${project.status}
- Inicio: ${new Date(project.startDate).toLocaleDateString('es-BO')}
- Fin estimado: ${new Date(project.estimatedEndDate).toLocaleDateString('es-BO')}
- Fases:
${project.phases.map((p) => `  • ${p.phase} — ${p.label}: ${p.progressPercent}% completo, presupuesto USD ${p.budgetUSD.toLocaleString('es-BO')}`).join('\n')}
- Hitos:
${project.milestones.map((m) => `  • ${m.label} — vence ${new Date(m.dueDate).toLocaleDateString('es-BO')}, estado: ${m.status}`).join('\n')}
`.trim()
    : 'El lead aún no ha sido convertido a proyecto.'

  return `MEMORÁNDUM DE PROPUESTA

Para: ${lead.contactName}
Empresa: ${lead.company}
De: ${firm.name}
Fecha: ${today}
Asunto: Propuesta de Servicios de Arquitectura — ${lead.projectName}

Estimado/a ${lead.contactName}:

Por medio de la presente, ${firm.name} presenta su propuesta de servicios profesionales de arquitectura para el proyecto "${lead.projectName}", ubicado en ${lead.company}.

1. RESUMEN EJECUTIVO

${firm.name}, fundada en ${firm.founded} en ${firm.location}, es una firma de arquitectura reconocida por su compromiso con el diseño de calidad y la satisfacción del cliente. Hemos trabajado en proyectos residenciales, comerciales e institucionales que reflejan nuestra dedicación a la excelencia arquitectónica.

Para el proyecto "${lead.projectName}", proponemos un enfoque integral que abarca desde el diseño esquemático hasta la administración de la construcción, garantizando coherencia estética y funcional en cada etapa. Nuestro equipo está convencido de que podemos entregar un proyecto que supere las expectativas del cliente.

2. ALCANCE DEL PROYECTO

Tipo de proyecto: ${lead.projectType}
Fuente de contacto: ${lead.sourceType}
Probabilidad de cierre estimada: ${lead.closeProbability}%
${lead.notes ? `Notas adicionales: ${lead.notes}` : ''}

SERVICIOS INCLUIDOS:
• Diseño Esquemático (SD)
• Desarrollo del Diseño (DD)
• Documentos de Construcción (CD)
• Administración de Construcción (CA)

3. CRONOGRAMA TENTATIVO

El desarrollo del proyecto se estima en un período de 12 a 18 meses, dependiendo de la complejidad y los tiempos de aprobación del cliente. A continuación se presenta un cronograma tentativo por fase:

• Fase SD (Diseño Esquemático): Meses 1-3
• Fase DD (Desarrollo del Diseño): Meses 4-7
• Fase CD (Documentos de Construcción): Meses 8-13
• Fase CA (Administración de Construcción): Meses 14-18

4. INVERSIÓN ESTIMADA (USD)

Valor total estimado del proyecto: USD ${lead.estimatedValueUSD.toLocaleString('es-BO')}

Nota: Esta estimación está sujeta a ajuste según los requerimientos finales del cliente y la complejidad del diseño.

5. TÉRMINOS Y CONDICIONES

• Forma de pago: A convenir según tipo de contrato (${lead.projectType === 'RESIDENTIAL' ? 'Fee Fijo' : 'Por porcentaje'})
• Anticipo: 30% a la firma del contrato
• Pagos parciales: Según avance de cada fase
• Validez de la propuesta: 30 días naturales

6. PRÓXIMOS PASOS

1. Reunión inicial para definir requerimientos específicos
2. Firma del contrato de servicios
3. Inicio de la Fase SD (Diseño Esquemático)
4. Presentación de anteproyecto y ajustes
5. Avance hacia desarrollo final

INFORMACIÓN DEL PROYECTO:
${projectInfo}

---
${firm.name}
${firm.location}
Servicios: ${firm.services}

Este documento es una propuesta preliminar y está sujeto a términos y condiciones finales acordados entre las partes.`
}