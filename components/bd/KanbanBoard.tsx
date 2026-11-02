'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, CheckCircle2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Skeleton } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'
import { PIPELINE_STAGE } from '@/lib/labels'
import { cn, formatCompact } from '@/lib/utils'

const STAGES = ['PROSPECT', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const

const STAGE_DOT: Record<string, string> = {
  PROSPECT: 'bg-g40',
  QUALIFIED: 'bg-blue-400',
  PROPOSAL: 'bg-yellow-400',
  NEGOTIATION: 'bg-orange-400',
  WON: 'bg-green-400',
  LOST: 'bg-red-400',
}

export interface KanbanLead {
  id: string
  projectName: string
  company: string
  contactName: string
  estimatedValueUSD: number
  closeProbability: number
  pipelineStage: string
  sortOrder: number
  aiScore: number | null
  aiRecommendation: string | null
  assignedTo: { id: string; name: string; avatarInitials: string }
  convertedToProject: { id: string; code: string; name: string } | null
}

interface Props {
  onCardClick: (lead: KanbanLead) => void
  onNewLead: () => void
  refreshTrigger: number
  filter?: string
}

export function KanbanBoard({ onCardClick, onNewLead, refreshTrigger, filter = '' }: Props) {
  const [leads, setLeads] = useState<KanbanLead[] | null>(null)
  const [dragged, setDragged] = useState<KanbanLead | null>(null)
  const [overStage, setOverStage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchLeads = useCallback(async () => {
    try {
      setLeads(await api<KanbanLead[]>('/api/leads'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el pipeline')
      setLeads([])
    }
  }, [])

  useEffect(() => { fetchLeads() }, [fetchLeads, refreshTrigger])

  const moveToStage = useCallback(async (lead: KanbanLead, stage: string, sortOrder: number) => {
    // optimistic
    setLeads((prev) => prev?.map((l) => (l.id === lead.id ? { ...l, pipelineStage: stage, sortOrder, closeProbability: stage === 'WON' ? 100 : stage === 'LOST' ? 0 : l.closeProbability } : l)) ?? prev)
    try {
      await api(`/api/leads/${lead.id}/stage`, { method: 'PATCH', body: JSON.stringify({ pipelineStage: stage, sortOrder }) })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo mover el lead')
      fetchLeads()
    }
  }, [fetchLeads])

  const q = filter.trim().toLowerCase()
  const visible = (leads ?? []).filter((l) => !q || l.projectName.toLowerCase().includes(q) || l.company.toLowerCase().includes(q) || l.contactName.toLowerCase().includes(q))

  if (leads === null) {
    return (
      <div className="grid grid-flow-col auto-cols-[minmax(176px,1fr)] gap-3 overflow-x-auto">
        {STAGES.map((s) => <Skeleton key={s} className="h-80 rounded-lg" />)}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="grid grid-flow-col auto-cols-[minmax(176px,1fr)] gap-3 overflow-x-auto pb-3 -mx-1 px-1">
        {STAGES.map((stage) => {
          const meta = PIPELINE_STAGE[stage]
          const items = visible.filter((l) => l.pipelineStage === stage).sort((a, b) => a.sortOrder - b.sortOrder)
          const total = items.reduce((s, l) => s + l.estimatedValueUSD, 0)
          const weighted = items.reduce((s, l) => s + (l.estimatedValueUSD * l.closeProbability) / 100, 0)
          const isTarget = overStage === stage && dragged?.pipelineStage !== stage
          return (
            <div
              key={stage}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverStage(stage) }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null) }}
              onDrop={(e) => {
                e.preventDefault()
                setOverStage(null)
                if (!dragged || dragged.pipelineStage === stage) return setDragged(null)
                const max = items.length ? Math.max(...items.map((l) => l.sortOrder)) + 1 : 0
                moveToStage(dragged, stage, max)
                setDragged(null)
              }}
              className={cn(
                'flex flex-col rounded-lg border bg-g90/60 min-h-[420px] transition-colors',
                isTarget ? 'border-accent/60 bg-accent-muted' : 'border-g80'
              )}
            >
              <div className="px-3 pt-3 pb-2 border-b border-g80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn('w-2 h-2 rounded-full', STAGE_DOT[stage])} />
                    <span className="text-sm text-g10">{meta.label}</span>
                    <span className="text-2xs font-mono text-g40 bg-g80 px-1.5 rounded tabular">{items.length}</span>
                  </div>
                  {stage === 'PROSPECT' && (
                    <button onClick={onNewLead} className="p-1 rounded text-g40 hover:text-white hover:bg-g80" aria-label="Nuevo lead">
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-2xs font-mono text-g40 mt-1 tabular">
                  {formatCompact(total)}
                  {stage !== 'WON' && stage !== 'LOST' && total > 0 && <span className="text-g50"> · pond. {formatCompact(weighted)}</span>}
                </p>
              </div>

              <div className="flex-1 p-2 space-y-2">
                {items.map((lead) => (
                  <div
                    key={lead.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => { setDragged(lead); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', lead.id) }}
                    onDragEnd={() => { setDragged(null); setOverStage(null) }}
                    onClick={() => onCardClick(lead)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onCardClick(lead) }}
                    className={cn(
                      'group bg-g85 border border-g80 rounded-md p-3 cursor-grab active:cursor-grabbing hover:border-g60 transition-all',
                      dragged?.id === lead.id && 'opacity-40'
                    )}
                  >
                    <p className="text-sm text-white leading-snug line-clamp-2">{lead.projectName}</p>
                    <p className="text-xs text-g40 truncate mt-0.5">{lead.company}</p>

                    <div className="flex items-end justify-between mt-3">
                      <div>
                        <p className="text-sm font-mono text-g10 tabular">{formatCompact(lead.estimatedValueUSD)}</p>
                        {stage !== 'WON' && stage !== 'LOST' && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className="w-12 h-1 rounded-full bg-g80 overflow-hidden">
                              <div className="h-full bg-g30" style={{ width: `${lead.closeProbability}%` }} />
                            </div>
                            <span className="text-2xs font-mono text-g40 tabular">{lead.closeProbability}%</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {lead.aiScore != null && (
                          <Badge variant={lead.aiRecommendation === 'GO' ? 'green' : lead.aiRecommendation === 'NO_GO' ? 'red' : 'yellow'} className="normal-case">
                            {lead.aiScore}
                          </Badge>
                        )}
                        <Avatar initials={lead.assignedTo.avatarInitials} size="xs" title={lead.assignedTo.name} />
                      </div>
                    </div>

                    {stage === 'WON' && (
                      <p className="flex items-center gap-1 mt-2 text-2xs font-mono text-green-300">
                        <CheckCircle2 className="w-3 h-3" />
                        {lead.convertedToProject ? `Proyecto ${lead.convertedToProject.code}` : 'Pendiente de convertir'}
                      </p>
                    )}
                    {stage === 'LOST' && (
                      <p className="flex items-center gap-1 mt-2 text-2xs font-mono text-red-300">
                        <XCircle className="w-3 h-3" /> Perdido
                      </p>
                    )}
                  </div>
                ))}

                {items.length === 0 && !isTarget && (
                  <p className="text-center text-2xs font-mono text-g50 py-6">Arrastra aquí</p>
                )}
                {isTarget && (
                  <div className="border border-dashed border-accent/50 rounded-md h-16 flex items-center justify-center text-2xs font-mono text-accent">
                    Soltar en {meta.label}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
