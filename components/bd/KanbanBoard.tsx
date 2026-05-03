'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, GripVertical, ArrowRight, CheckCircle, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'

const STAGES = [
  { id: 'PROSPECT', label: 'Prospecto', color: 'g60' },
  { id: 'QUALIFIED', label: 'Calificado', color: 'blue' },
  { id: 'PROPOSAL', label: 'Propuesta', color: 'yellow' },
  { id: 'NEGOTIATION', label: 'Negociación', color: 'yellow' },
  { id: 'WON', label: 'Cerrado Ganado', color: 'green' },
  { id: 'LOST', label: 'Cerrado Perdido', color: 'red' },
]

const STAGE_COLORS: Record<string, string> = {
  PROSPECT: 'border-g60',
  QUALIFIED: 'border-blue-500/50',
  PROPOSAL: 'border-yellow-500/50',
  NEGOTIATION: 'border-yellow-500/50',
  WON: 'border-green-500/50',
  LOST: 'border-red-500/50',
}

interface Lead {
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
  onCardClick: (lead: Lead) => void
  onNewLead: () => void
  refreshTrigger: number
}

export function KanbanBoard({ onCardClick, onNewLead, refreshTrigger }: Props) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null)
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  useEffect(() => {
    fetchLeads()
  }, [refreshTrigger])

  async function fetchLeads() {
    try {
      const res = await fetch('/api/leads')
      const json = await res.json()
      if (json.success) setLeads(json.data)
    } catch (e) {
      console.error('Failed to fetch leads', e)
    } finally {
      setLoading(false)
    }
  }

  async function moveToStage(leadId: string, newStage: string, newSortOrder: number) {
    try {
      const res = await fetch(`/api/leads/${leadId}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineStage: newStage, sortOrder: newSortOrder }),
      })
      const json = await res.json()
      if (json.success) {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, pipelineStage: newStage, sortOrder: newSortOrder } : l))
      }
    } catch (e) {
      console.error('Failed to move lead', e)
      fetchLeads()
    }
  }

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, lead: Lead) => {
    setDraggedLead(lead)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', lead.id)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, stageId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stageId)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverStage(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, targetStage: string) => {
    e.preventDefault()
    setDragOverStage(null)
    if (!draggedLead) return
    if (draggedLead.pipelineStage === targetStage) {
      setDraggedLead(null)
      return
    }
    const leadsInTarget = leads.filter(l => l.pipelineStage === targetStage)
    const newSortOrder = leadsInTarget.length > 0 ? Math.max(...leadsInTarget.map(l => l.sortOrder)) + 1 : 0
    moveToStage(draggedLead.id, targetStage, newSortOrder)
    setDraggedLead(null)
  }, [draggedLead, leads])

  function getLeadsForStage(stage: string) {
    return leads
      .filter(l => l.pipelineStage === stage)
      .sort((a, b) => a.sortOrder - b.sortOrder)
  }

  function AIBadge({ score, recommendation }: { score: number | null; recommendation: string | null }) {
    if (!score) return null
    const variant = recommendation === 'GO' ? 'green' : recommendation === 'NO_GO' ? 'red' : 'yellow'
    return (
      <Badge variant={variant} className="text-xs">
        AI {score}
      </Badge>
    )
  }

  function ClosedBadge({ stage, converted }: { stage: string; converted: Lead['convertedToProject'] }) {
    if (stage === 'WON') {
      return (
        <div className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-green-400" />
          <span className="text-xs text-green-400">
            {converted ? `→ ${converted.code}` : 'Convertido'}
          </span>
        </div>
      )
    }
    if (stage === 'LOST') {
      return (
        <div className="flex items-center gap-1">
          <XCircle className="w-3 h-3 text-red-400" />
          <span className="text-xs text-red-400">Perdido</span>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-g40 text-sm font-mono">Cargando pipeline...</p>
      </div>
    )
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '500px' }}>
      {STAGES.map(stage => {
        const stageLeads = getLeadsForStage(stage.id)
        const isDropTarget = dragOverStage === stage.id && draggedLead?.pipelineStage !== stage.id

        return (
          <div
            key={stage.id}
            className={`flex-shrink-0 w-[280px] rounded-md transition-colors ${
              isDropTarget ? 'bg-g80 ring-2 ring-blue-500/50' : ''
            }`}
            onDragOver={e => handleDragOver(e, stage.id)}
            onDragLeave={handleDragLeave}
            onDrop={e => handleDrop(e, stage.id)}
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  stage.id === 'WON' ? 'bg-green-400' :
                  stage.id === 'LOST' ? 'bg-red-400' :
                  stage.id === 'QUALIFIED' ? 'bg-blue-400' :
                  stage.id === 'NEGOTIATION' ? 'bg-yellow-400' :
                  stage.id === 'PROPOSAL' ? 'bg-yellow-400' :
                  'bg-g60'
                }`} />
                <span className="text-sm font-mono text-g20">{stage.label}</span>
                <span className="text-xs font-mono text-g50 bg-g80 px-1.5 py-0.5 rounded">
                  {stageLeads.length}
                </span>
              </div>
              {stage.id === 'PROSPECT' && (
                <button
                  onClick={onNewLead}
                  className="p-1 text-g40 hover:text-white transition-colors"
                  title="Nuevo lead"
                >
                  <Plus className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Cards */}
            <div className="space-y-2">
              {stageLeads.map(lead => (
                <div
                  key={lead.id}
                  draggable
                  onDragStart={e => handleDragStart(e, lead)}
                  onDragEnd={() => { setDraggedLead(null); setDragOverStage(null) }}
                  onClick={() => onCardClick(lead)}
                  className={`bg-g85 border ${STAGE_COLORS[stage.id]} rounded-md p-3 cursor-pointer hover:border-g60 transition-all ${
                    draggedLead?.id === lead.id ? 'opacity-50' : ''
                  }`}
                >
                  {/* Drag handle + company */}
                  <div className="flex items-start gap-2 mb-2">
                    <GripVertical className="w-4 h-4 text-g50 mt-0.5 flex-shrink-0 cursor-grab" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{lead.projectName}</p>
                      <p className="text-xs text-g40 truncate">{lead.company}</p>
                    </div>
                  </div>

                  {/* Value + probability */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-mono text-g20">
                      {formatCurrency(lead.estimatedValueUSD)}
                    </span>
                    <span className="text-xs font-mono text-g40">
                      {lead.closeProbability}%
                    </span>
                  </div>

                  {/* AI score + assigned */}
                  <div className="flex items-center justify-between">
                    <AIBadge score={lead.aiScore} recommendation={lead.aiRecommendation} />
                    <span className="text-xs font-mono text-g50">{lead.assignedTo.name.split(' ')[0]}</span>
                  </div>

                  {/* Won/Lost badge */}
                  <ClosedBadge stage={lead.pipelineStage} converted={lead.convertedToProject} />
                </div>
              ))}

              {/* Drop indicator */}
              {isDropTarget && (
                <div className="border-2 border-dashed border-blue-500/30 rounded-md h-20 flex items-center justify-center">
                  <span className="text-xs text-g50 font-mono">Soltar aquí</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
