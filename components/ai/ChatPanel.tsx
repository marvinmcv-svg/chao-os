'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, Bot, User, ChevronDown, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type MessageRole = 'user' | 'assistant'

interface Message {
  role: MessageRole
  content: string
  error?: boolean
}

type ChatContext = 'bd' | 'projects' | 'finance' | 'general'

const CONTEXT_LABELS: Record<ChatContext, string> = {
  bd: 'BD / Leads',
  projects: 'Proyectos',
  finance: 'Finanzas',
  general: 'General',
}

interface ChatPanelProps {
  onClose?: () => void
  /** Render inline inside the page instead of as a full-height drawer. */
  embedded?: boolean
}

const SUGGESTIONS = [
  '¿Qué proyectos están consumiendo honorario más rápido que su avance?',
  '¿Qué facturas debo cobrar esta semana?',
  'Resume el pipeline y dime qué lead priorizar',
]

export function ChatPanel({ onClose, embedded = false }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [context, setContext] = useState<ChatContext>('general')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [contextOpen, setContextOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    setError('')
    const userMessage: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMessage])
    setInput('')

    setLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    const allMessages = [...messages, userMessage]
    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: allMessages, context }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const json = await response.json()
        throw new Error(json.error?.message ?? `HTTP ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      setMessages(prev => {
        const updated = [...prev]
        const lastIdx = updated.length - 1
        updated[lastIdx] = { role: 'assistant', content: '' }
        return updated
      })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('event: ')) continue
          const eventType = line.slice(7).trim()
          const dataLine = lines[lines.indexOf(line) + 1]
          if (!dataLine?.startsWith('data: ')) continue

          const rawData = dataLine.slice(6)
          let data: { content?: string; error?: string }
          try {
            data = JSON.parse(rawData)
          } catch {
            continue
          }

          if (eventType === 'chunk' && data.content) {
            setMessages(prev => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              if (updated[lastIdx]?.role === 'assistant') {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: updated[lastIdx].content + data.content!,
                }
              }
              return updated
            })
          } else if (eventType === 'error') {
            setMessages(prev => {
              const updated = [...prev]
              const lastIdx = updated.length - 1
              updated[lastIdx] = { role: 'assistant', content: '', error: true }
              return updated
            })
            setError(data.error ?? 'Error desconocido')
            break
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setMessages(prev => {
        const updated = [...prev]
        const lastIdx = updated.length - 1
        updated[lastIdx] = { role: 'assistant', content: '', error: true }
        return updated
      })
      setError(err instanceof Error ? err.message : 'Error de conexión')
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [input, loading, messages, context])

  // Cleanup on unmount
  useEffect(() => {
    return () => abortControllerRef.current?.abort()
  }, [])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleContextSelect(ctx: ChatContext) {
    setContext(ctx)
    setContextOpen(false)
  }

  const body = (
      <div className={embedded ? 'h-[600px] bg-g85 border border-g80 rounded-lg flex flex-col overflow-hidden' : 'fixed right-0 top-0 h-[100dvh] w-full sm:w-[420px] bg-g90 border-l border-g70 z-[56] flex flex-col shadow-panel animate-slide-in-right'}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-g80">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-accent" />
            <span className="font-mono text-sm text-g20 uppercase">Asistente IA</span>
          </div>
          {!embedded && <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 text-g40 hover:text-white transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Bot className="w-12 h-12 text-g50 mx-auto mb-3" />
              <p className="text-g40 text-sm font-mono">¿En qué te puedo ayudar?</p>
              <p className="text-g40 text-xs mt-1">
                Responde con los datos en vivo del estudio. Elige un contexto para respuestas especializadas.
              </p>
              <div className="mt-5 flex flex-col items-center gap-2">
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); inputRef.current?.focus() }}
                    className="text-xs text-g20 px-3 py-1.5 rounded-full border border-g70 hover:border-accent/60 hover:text-white transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                'flex gap-2',
                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              <div
                className={cn(
                  'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
                  msg.role === 'user' ? 'bg-accent-muted' : 'bg-g80'
                )}
              >
                {msg.role === 'user'
                  ? <User className="w-4 h-4 text-accent" />
                  : <Bot className="w-4 h-4 text-g30" />}
              </div>

              <div
                className={cn(
                  'max-w-[75%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-g70 border border-g60 text-white'
                    : msg.error
                    ? 'bg-red-900/20 border border-red-800 text-red-400'
                    : 'bg-g85 border border-g80 text-g20',
                )}
              >
                {msg.content || (msg.error ? 'Error en la respuesta' : '')}
              </div>
            </div>
          ))}

          {loading && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex gap-2">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-g80 flex items-center justify-center">
                <Bot className="w-4 h-4 text-g30" />
              </div>
              <div className="bg-g85 border border-g80 rounded-lg px-3 py-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-g40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-g40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-g40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-2 p-2 bg-red-900/30 border border-red-800 rounded text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Input area */}
        <div className="p-4 border-t border-g80 space-y-3">
          {/* Context selector */}
          <div className="relative">
            <button
              onClick={() => setContextOpen(!contextOpen)}
              className="flex items-center gap-2 px-3 py-1.5 bg-g90 border border-g70 rounded text-g30 text-xs font-mono hover:border-g60 transition-colors"
            >
              <span>{CONTEXT_LABELS[context]}</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {contextOpen && (
              <div className="absolute bottom-full mb-1 left-0 bg-g85 border border-g80 rounded shadow-lg overflow-hidden z-10">
                {(Object.keys(CONTEXT_LABELS) as ChatContext[]).map(ctx => (
                  <button
                    key={ctx}
                    onClick={() => handleContextSelect(ctx)}
                    className={cn(
                      'block w-full text-left px-3 py-2 text-xs font-mono hover:bg-g80 transition-colors',
                      ctx === context ? 'text-accent bg-g80' : 'text-g30'
                    )}
                  >
                    {CONTEXT_LABELS[ctx]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input + Send */}
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu mensaje... (Ctrl+Enter para enviar)"
              rows={1}
              className={cn(
                'flex-1 bg-g90 border border-g70 rounded px-3 py-2 text-sm text-white font-mono',
                'placeholder:text-g60 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500',
                'min-h-[44px] max-h-[120px] overflow-y-auto'
              )}
              style={{ height: 'auto' }}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = Math.min(el.scrollHeight, 120) + 'px'
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className={cn(
                'flex-shrink-0 w-10 h-10 rounded bg-g05 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed',
                'flex items-center justify-center transition-colors'
              )}
            >
              <Send className="w-4 h-4 text-black" />
            </button>
          </div>

          <p className="text-g60 text-[10px] font-mono text-center">
            Enter = nueva línea · Ctrl/⌘ + Enter = enviar
          </p>
        </div>
      </div>
  )

  if (embedded) return body
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[55]" onClick={onClose} />
      {body}
    </>
  )
}
