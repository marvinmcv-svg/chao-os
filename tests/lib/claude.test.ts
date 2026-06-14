/**
 * TEST 9: claude.test.ts
 *
 * Verifies the Anthropic API client (lib/claude.ts, 726 lines, 24KB).
 * This is the most expensive code to break ($$$ per API call) and the
 * highest-stakes output (proposals sent to real clients).
 *
 * Mocking strategy:
 *  - vi.stubGlobal('fetch', ...) to control API responses
 *  - ANTHROPIC_API_KEY set in beforeAll
 *  - vi.useFakeTimers() for retry tests (avoids real 1s+2s+4s waits)
 *  - No DB, no Next runtime
 *
 * Coverage:
 *  - ClaudeError construction (name, code, status, retryAfter)
 *  - Claude constructor (config precedence, env fallback, missing API key)
 *  - Claude.chat (request shape, response parsing, error mapping 429/500/400)
 *  - Claude.complete (returns text from first text block)
 *  - Claude.chatWithRetry (retries 429, retries 500, exhausts 4 attempts)
 *  - Claude.completeWithRetry (retry logic)
 *  - Claude.chatStream (SSE event parsing)
 *  - scoreLead (JSON parsing, score clamping, recommendation validation)
 *  - generateProposalDraft (Spanish memo, "no convertido" fallback)
 *  - getClaude singleton
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import {
  Claude,
  ClaudeError,
  getClaude,
  scoreLead,
  generateProposalDraft,
  type ClaudeStreamChunk,
} from '@/lib/claude'

const API_KEY = 'test-api-key-12345'

// ─── Fetch mocking helpers ─────────────────────────────────────────────────

type MockResponse = {
  status?: number
  body: unknown
  headers?: Record<string, string>
}

function stubFetch(response: MockResponse) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(response.body), {
        status: response.status ?? 200,
        headers: response.headers,
      })
    )
  )
}

function stubFetchSequence(responses: MockResponse[]) {
  let i = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const r = responses[Math.min(i++, responses.length - 1)]
      return new Response(JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: r.headers,
      })
    })
  )
}

function stubFetchStream(sseEvents: string[]) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      for (const e of sseEvents) {
        controller.enqueue(encoder.encode(e + '\n'))
      }
      controller.close()
    },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(stream, { status: 200 }))
  )
}

// Read all chunks from a stream (drives the producer's pull() until done)
async function readAllChunks(stream: ReadableStream<ClaudeStreamChunk>): Promise<ClaudeStreamChunk[]> {
  const chunks: ClaudeStreamChunk[] = []
  const reader = stream.getReader()
  // Cap at 100 iterations to avoid infinite loops in tests
  for (let i = 0; i < 100; i++) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  reader.releaseLock()
  return chunks
}

// ─── Setup ────────────────────────────────────────────────────────────────

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY = API_KEY
  process.env.CLAUDE_MODEL = 'claude-sonnet-4-6'
  process.env.CLAUDE_MAX_TOKENS = '4096'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ─── ClaudeError ──────────────────────────────────────────────────────────

describe('ClaudeError', () => {
  it('constructs with code, message, status, retryAfter', () => {
    const err = new ClaudeError('RATE_LIMIT', 'Too many requests', 429, 30)
    expect(err.code).toBe('RATE_LIMIT')
    expect(err.message).toBe('Too many requests')
    expect(err.status).toBe(429)
    expect(err.retryAfter).toBe(30)
  })

  it('is an Error subclass with name = "ClaudeError"', () => {
    const err = new ClaudeError('API_ERROR', 'Server error', 500)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ClaudeError')
  })
})

// ─── Claude constructor ───────────────────────────────────────────────────

describe('Claude constructor', () => {
  it('uses provided config over env', () => {
    const client = new Claude({ apiKey: 'explicit-key', model: 'claude-opus-4-7', maxTokens: 8192 })
    // Internal fields are private; we verify behavior by making a request
    stubFetch({ body: { content: [{ type: 'text', text: 'ok' }] } })
    return client.complete('hi').then(() => {
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
      const init = call[1] as RequestInit
      expect((init.headers as Record<string, string>)['x-api-key']).toBe('explicit-key')
      const body = JSON.parse(init.body as string)
      expect(body.model).toBe('claude-opus-4-7')
      expect(body.max_tokens).toBe(8192)
    })
  })

  it('falls back to env config when no config provided', () => {
    stubFetch({ body: { content: [{ type: 'text', text: 'ok' }] } })
    const client = new Claude()
    return client.complete('hi').then(() => {
      const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
      expect((init.headers as Record<string, string>)['x-api-key']).toBe(API_KEY)
    })
  })

  it('throws when ANTHROPIC_API_KEY is missing', () => {
    const original = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    try {
      expect(() => new Claude()).toThrow(/ANTHROPIC_API_KEY/)
    } finally {
      process.env.ANTHROPIC_API_KEY = original
    }
  })
})

// ─── Claude.chat ──────────────────────────────────────────────────────────

describe('Claude.chat', () => {
  it('sends POST to /v1/messages with correct headers and body', async () => {
    stubFetch({
      body: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello back' }],
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      },
    })
    const client = new Claude()
    await client.chat([{ role: 'user', content: 'Hello' }])

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe('https://api.anthropic.com/v1/messages')
    const init = call[1] as RequestInit
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe(API_KEY)
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['content-type']).toBe('application/json')
    const body = JSON.parse(init.body as string)
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }])
    expect(body.model).toBe('claude-sonnet-4-6')
  })

  it('parses response into ClaudeResponse shape (camelCase mapping)', async () => {
    stubFetch({
      body: {
        id: 'msg_2',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'response text' }],
        model: 'claude-sonnet-4-6',
        stop_reason: 'max_tokens',
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    })
    const client = new Claude()
    const response = await client.chat([{ role: 'user', content: 'hi' }])
    expect(response.id).toBe('msg_2')
    expect(response.role).toBe('assistant')
    expect(response.content[0].text).toBe('response text')
    expect(response.stopReason).toBe('max_tokens')
    expect(response.usage.inputTokens).toBe(100)
    expect(response.usage.outputTokens).toBe(50)
  })

  it('throws ClaudeError(RATE_LIMIT) with retryAfter on 429', async () => {
    stubFetch({
      status: 429,
      headers: { 'retry-after': '60' },
      body: { error: { type: 'rate_limit_error', message: 'Too many requests' } },
    })
    const client = new Claude()
    await expect(client.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      name: 'ClaudeError',
      code: 'RATE_LIMIT',
      status: 429,
      retryAfter: 60,
    })
  })

  it('throws ClaudeError(API_ERROR) on 500 and ClaudeError(INVALID_REQUEST) on 400', async () => {
    stubFetch({ status: 500, body: { error: { message: 'Server error' } } })
    const client = new Claude()
    await expect(client.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      code: 'API_ERROR',
      status: 500,
    })

    stubFetch({ status: 400, body: { error: { message: 'Bad request' } } })
    await expect(client.chat([{ role: 'user', content: 'hi' }])).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      status: 400,
    })
  })
})

// ─── Claude.complete ──────────────────────────────────────────────────────

describe('Claude.complete', () => {
  it('returns text from the first text block', async () => {
    stubFetch({
      body: {
        content: [
          { type: 'text', text: 'first block' },
          { type: 'text', text: 'second block' }, // complete() takes only the first
        ],
      },
    })
    const client = new Claude()
    const text = await client.complete('What is 2+2?')
    expect(text).toBe('first block')
  })
})

// ─── Claude.chatWithRetry ─────────────────────────────────────────────────

describe('Claude.chatWithRetry', () => {
  it('succeeds on first try without retrying', async () => {
    stubFetch({
      body: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    })
    const client = new Claude()
    const response = await client.chatWithRetry([{ role: 'user', content: 'hi' }])
    expect(response.content[0].text).toBe('ok')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 and succeeds on second attempt', async () => {
    stubFetchSequence([
      { status: 429, headers: { 'retry-after': '1' }, body: { error: { message: 'rate limit' } } },
      {
        body: {
          id: 'msg_2',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    ])
    vi.useFakeTimers()
    const client = new Claude()
    const promise = client.chatWithRetry([{ role: 'user', content: 'hi' }])
    await vi.advanceTimersByTimeAsync(2000) // 1s retry-after + buffer
    const response = await promise
    expect(response.content[0].text).toBe('ok')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('retries on 500 and succeeds on second attempt', async () => {
    stubFetchSequence([
      { status: 500, body: { error: { message: 'server' } } },
      {
        body: {
          id: 'msg_3',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'recovered' }],
          model: 'claude-sonnet-4-6',
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      },
    ])
    vi.useFakeTimers()
    const client = new Claude()
    const promise = client.chatWithRetry([{ role: 'user', content: 'hi' }])
    await vi.advanceTimersByTimeAsync(2000)
    const response = await promise
    expect(response.content[0].text).toBe('recovered')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws after exhausting 4 attempts (1 + 3 retries)', async () => {
    stubFetch({ status: 500, body: { error: { message: 'persistent' } } })
    vi.useFakeTimers()
    const client = new Claude()
    const promise = client.chatWithRetry([{ role: 'user', content: 'hi' }])
    // Attach a catch handler to avoid unhandled promise rejection warnings
    const caught = promise.catch((e) => e)
    // Advance through all retry delays: 1s + 2s + 4s = 7s
    await vi.advanceTimersByTimeAsync(8000)
    const err = await caught
    expect(err).toBeInstanceOf(ClaudeError)
    expect((err as ClaudeError).code).toBe('API_ERROR')
    expect(fetch).toHaveBeenCalledTimes(4)
  })
})

// ─── Claude.completeWithRetry ─────────────────────────────────────────────

describe('Claude.completeWithRetry', () => {
  it('retries on 429 and succeeds on second attempt', async () => {
    stubFetchSequence([
      { status: 429, headers: { 'retry-after': '1' }, body: { error: { message: 'rate' } } },
      { body: { content: [{ type: 'text', text: 'recovered text' }] } },
    ])
    vi.useFakeTimers()
    const client = new Claude()
    const promise = client.completeWithRetry('hi')
    await vi.advanceTimersByTimeAsync(2000)
    const text = await promise
    expect(text).toBe('recovered text')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

// ─── Claude.chatStream ────────────────────────────────────────────────────

describe('Claude.chatStream', () => {
  it('parses message_start event with message id', async () => {
    stubFetchStream([
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_stream_1"}}\n',
    ])
    const client = new Claude()
    const stream = await client.chatStream([{ role: 'user', content: 'hi' }])
    const chunks = await readAllChunks(stream)
    const start = chunks.find((c) => c.type === 'message_start')
    expect(start).toBeDefined()
    if (start && start.type === 'message_start') {
      expect(start.message.id).toBe('msg_stream_1')
    }
  })

  it('parses content_block_delta event with text payload', async () => {
    stubFetchStream([
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n',
    ])
    const client = new Claude()
    const stream = await client.chatStream([{ role: 'user', content: 'hi' }])
    const chunks = await readAllChunks(stream)
    const delta = chunks.find((c) => c.type === 'content_block_delta')
    expect(delta).toBeDefined()
    if (delta && delta.type === 'content_block_delta') {
      expect(delta.delta.text).toBe('Hello')
    }
  })
})

// ─── scoreLead ────────────────────────────────────────────────────────────

describe('scoreLead', () => {
  const validScore = {
    financialScore: 80,
    technicalScore: 75,
    commercialScore: 90,
    legalScore: 70,
    executionScore: 85,
    overallScore: 80,
    recommendation: 'GO' as const,
    summary: 'Strong lead',
    keyStrengths: ['s1', 's2', 's3'],
    keyRisks: ['r1', 'r2', 'r3'],
    nextSteps: ['n1', 'n2', 'n3'],
  }

  const sampleLead = {
    projectName: 'Casa Test',
    company: 'Test Co',
    contactName: 'Jane Doe',
    contactEmail: 'jane@test.com',
    contactPhone: '+591 70000000',
    estimatedValueUSD: 50000,
    projectType: 'RESIDENTIAL',
    pipelineStage: 'QUALIFIED',
    closeProbability: 60,
    sourceType: 'REFERRAL',
    notes: 'Hot lead',
    assignedToName: 'Marvin',
  }

  it('parses JSON response and returns AIScoreResult', async () => {
    stubFetch({ body: { content: [{ type: 'text', text: JSON.stringify(validScore) }] } })
    const result = await scoreLead(sampleLead)
    expect(result.recommendation).toBe('GO')
    expect(result.overallScore).toBe(80)
    expect(result.keyStrengths).toHaveLength(3)
  })

  it('clamps out-of-range scores to 0-100 with rounding', async () => {
    stubFetch({
      body: {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...validScore,
            financialScore: 150, // out of range
            technicalScore: -20, // out of range
            overallScore: 75.6,  // rounds to 76
          }),
        }],
      },
    })
    const result = await scoreLead(sampleLead)
    expect(result.financialScore).toBe(100)
    expect(result.technicalScore).toBe(0)
    expect(result.overallScore).toBe(76)
  })

  it('throws when response contains no JSON', async () => {
    stubFetch({ body: { content: [{ type: 'text', text: 'No JSON here' }] } })
    await expect(scoreLead(sampleLead)).rejects.toThrow(/did not contain valid JSON/)
  })

  it('throws when recommendation is not GO/NO_GO/REVIEW', async () => {
    stubFetch({
      body: {
        content: [{
          type: 'text',
          text: JSON.stringify({ ...validScore, recommendation: 'MAYBE' }),
        }],
      },
    })
    await expect(scoreLead(sampleLead)).rejects.toThrow(/Invalid recommendation/)
  })
})

// ─── generateProposalDraft ────────────────────────────────────────────────

describe('generateProposalDraft', () => {
  const firm = {
    name: 'Chao Arquitectura',
    location: 'Santa Cruz, Bolivia',
    founded: 2010,
    services: 'Diseño arquitectónico, urbanismo',
  }
  const lead = {
    projectName: 'Casa Familia Perez',
    company: 'Inversiones Perez SRL',
    contactName: 'Juan Perez',
    contactEmail: 'juan@perez.com',
    projectType: 'RESIDENTIAL',
    estimatedValueUSD: 80000,
    pipelineStage: 'PROPOSAL',
    sourceType: 'REFERRAL',
    closeProbability: 70,
    notes: 'Cliente referido',
    assignedTo: 'Marvin',
  }

  it('returns a Spanish proposal memo with firm + lead info', async () => {
    stubFetch({ body: { content: [{ type: 'text', text: 'proposal response' }] } })
    const memo = await generateProposalDraft({ firm, lead, project: null })
    // Memo is generated client-side from the template (no Claude call for content)
    expect(memo).toContain('MEMORÁNDUM DE PROPUESTA')
    expect(memo).toContain('Chao Arquitectura')
    expect(memo).toContain('Casa Familia Perez')
    expect(memo).toContain('Juan Perez')
    expect(memo).toContain('Inversiones Perez SRL')
    // Should include the 4 phases
    expect(memo).toContain('Diseño Esquemático (SD)')
    expect(memo).toContain('Desarrollo del Diseño (DD)')
    expect(memo).toContain('Documentos de Construcción (CD)')
    expect(memo).toContain('Administración de Construcción (CA)')
  })

  it('uses "no convertido" fallback when project is null', async () => {
    stubFetch({ body: { content: [{ type: 'text', text: 'unused' }] } })
    const memo = await generateProposalDraft({ firm, lead, project: null })
    expect(memo).toContain('no ha sido convertido a proyecto')
  })
})

// ─── getClaude singleton ──────────────────────────────────────────────────

describe('getClaude', () => {
  it('returns the same instance on multiple calls', () => {
    const a = getClaude()
    const b = getClaude()
    expect(a).toBe(b)
    expect(a).toBeInstanceOf(Claude)
  })
})
