/**
 * Tipos para el cliente de Claude API
 */

export type ClaudeModel =
  | 'claude-sonnet-4-6'
  | 'claude-sonnet-4-7'
  | 'claude-opus-4-7'
  | 'claude-3-5-haiku'
  | 'claude-3-5-sonnet'
  | 'claude-3-opus'

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

export interface ClaudeTextBlock {
  type: 'text'
  text: string
}

export interface ClaudeMessage {
  role: 'user' | 'assistant'
  content: string | ClaudeTextBlock[]
}

// ---------------------------------------------------------------------------
// Respuesta completa
// ---------------------------------------------------------------------------

export interface ClaudeUsage {
  inputTokens: number
  outputTokens: number
}

export interface ClaudeResponse {
  id: string
  type: string
  role: string
  content: ClaudeTextBlock[]
  model: string
  stopReason: string | null
  stopSequence: string | null
  usage: ClaudeUsage
}

// ---------------------------------------------------------------------------
// Streaming chunks (SSE)
// ---------------------------------------------------------------------------

export type ClaudeStreamChunk =
  | { type: 'message_start'; message: { id: string; type: string; role: string; content: unknown[]; model: string } }
  | { type: 'content_block_start'; index: number; contentBlock: { type: string; text?: string } }
  | { type: 'content_block_delta'; index: number; delta: { type: string; text?: string } }
  | { type: 'message_delta'; delta: { type: string; text?: string }; stopReason?: string }
  | { type: 'message_stop' }