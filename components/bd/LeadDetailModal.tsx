'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { GoNoGoScore } from '@/components/bd/GoNoGoScore'
import { formatCurrency, formatDate } from '@/lib/utils'

const STAGE_LABELS: Record<string, string> = {
  PROSPECT: 'Prospecto',
  QUALIFIED: 'Calificado',
  PROPOSAL: 'Propuesta',
  NEGOTIATION: 'Negociación',
  WON: 'Cerrado Ganado',
  LOST: 'Cerrado Perdido',
}

const STAGE_VARIANT: Record<string, 'default' | 'green' | 'yellow' | 'red' | 'blue'> = {
  PROSPECT: 'default',
  QUALIFIED: 'blue',
  PROPOSAL: 'yellow',
  NEGOTIATION: 'yellow',
  WON: 'green',
  LOST: 'red',
}

interface AIScoreData {
  overallScore: number
  breakdown: {
    financialScore: number
    technicalScore: number
    commercialScore: number
    legalScore: number
    executionScore: number
  } | null
  recommendation: 'GO' | 'NO_GO' | 'REVIEW' | null
  summary: string | null
  keyStrengths: string[]
  keyRisks: string[]
  nextSteps: string[]
}

interface Lead {
  id: string
  projectName: string
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string
  estimatedValueUSD: number
  projectType: string
  pipelineStage: string
  closeProbability: number
  aiScore: number | null
  aiScoreBreakdown: { financialScore: number; technicalScore: number; commercialScore: number; legalScore: number; executionScore: number } | null
  aiRecommendation: string | null
  notes: string
  sourceType: string
  assignedTo: { id: string; name: string; email: string; avatarInitials: string; role: string }
  convertedToProject: { id: string; code: string; name: string } | null
  createdAt: string
}

interface Props {
  leadId: string | null
  open: boolean
  onClose: () => void
  onConvert: (leadId: string) => void
  onStageChange: (leadId: string, stage: string) => void
  onUpdate: () => void
}

export function LeadDetailModal({ leadId, open, onClose, onConvert, onStageChange, onUpdate }: Props) {
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(false)
  const [converting, setConverting] = useState(false)
  const [aiScoreData, setAiScoreData] = useState<AIScoreData | null>(null)
  const [scoring, setScoring] = useState(false)

  useEffect(() => {
    if (leadId && open) {
      fetchLead()
      fetchAIScore()
    }
    if (!open) {
      setLead(null)
      setAiScoreData(null)
    }
  }, [leadId, open])

  async function fetchLead() {
    if (!leadId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/leads/${leadId}`)
      const json = await res.json()
      if (json.success) setLead(json.data)
    } catch (e) {
      console.error('Failed to fetch lead', e)
    } finally {
      setLoading(false)
    }
  }

  async function fetchAIScore() {
    if (!leadId) return
    try {
      const res = await fetch(`/api/leads/${leadId}/ai-score`)
      const json = await res.json()
      if (json.success && json.data) setAiScoreData(json.data)
    } catch (e) {
      console.error('Failed to fetch AI score', e)
    }
  }

  async function handleRescore() {
    if (!leadId) return
    setScoring(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/ai-score`, { method: 'POST' })
      const json = await res.json()
      if (json.success && json.data) {
        setAiScoreData(json.data)
      }
    } catch (e) {
      console.error('Failed to rescore lead', e)
    } finally {
      setScoring(false)
    }
  }

  async function handleConvert() {
    if (!lead || !lead.convertedToProject) return
    setConverting(true)
    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, { method: 'POST' })
      const json = await res.json()
      if (json.success) {
        onConvert(lead.id)
        onUpdate()
      }
    } catch (e) {
      console.error('Failed to convert lead', e)
    } finally {
      setConverting(false)
    }
  }

  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title="Detalle del Lead" size="lg">
      {loading ? (
        <div className="text-center py-8 text-g40 text-sm font-mono">Cargando...</div>
      ) : lead ? (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-mono text-g40">{lead.company}</p>
              <h3 className="font-display text-2xl text-white mt-1">{lead.projectName}</h3>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={STAGE_VARIANT[lead.pipelineStage]}>{STAGE_LABELS[lead.pipelineStage]}</Badge>
                <span className="text-sm font-mono text-g30">{lead.projectType.toLowerCase()}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-display text-white">{formatCurrency(lead.estimatedValueUSD)}</p>
              <p className="text-sm font-mono text-g40">{lead.closeProbability}% probabilidad</p>
            </div>
          </div>

          {/* AI Score */}
          {(aiScoreData || lead.aiScore) && (
            <div className="bg-g80/50 border border-g80 rounded-md p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-mono text-g40 uppercase tracking-wider">Análisis Go/No-Go</h4>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRescore}
                  disabled={scoring}
                >
                  {scoring ? '⏳ Recalificando...' : '🔄 Recalificar con IA'}
                </Button>
              </div>
              <GoNoGoScore
                overallScore={aiScoreData?.overallScore ?? lead.aiScore ?? null}
                breakdown={aiScoreData?.breakdown ?? lead.aiScoreBreakdown}
                recommendation={aiScoreData?.recommendation as 'GO' | 'NO_GO' | 'REVIEW' | null ?? (lead.aiRecommendation as 'GO' | 'NO_GO' | 'REVIEW' | null)}
                loading={scoring}
              />
            </div>
          )}

          {/* Contact info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-mono text-g40 uppercase mb-1">Contacto</p>
              <p className="text-sm text-g20">{lead.contactName}</p>
              <p className="text-sm text-g30">{lead.contactEmail}</p>
              {lead.contactPhone && <p className="text-sm text-g30">{lead.contactPhone}</p>}
            </div>
            <div>
              <p className="text-xs font-mono text-g40 uppercase mb-1">Asignado a</p>
              <p className="text-sm text-g20">{lead.assignedTo.name}</p>
              <p className="text-sm text-g30">{lead.assignedTo.role}</p>
            </div>
          </div>

          {/* Stage actions (if not WON/LOST) */}
          {lead.pipelineStage !== 'WON' && lead.pipelineStage !== 'LOST' && (
            <div>
              <p className="text-xs font-mono text-g40 uppercase mb-2">Avanzar etapa</p>
              <div className="flex flex-wrap gap-2">
                {['QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON'].map(stage => (
                  <Button
                    key={stage}
                    variant="secondary"
                    size="sm"
                    onClick={() => onStageChange(lead.id, stage)}
                  >
                    {STAGE_LABELS[stage]} →
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Won lead — convert to project */}
          {lead.pipelineStage === 'WON' && !lead.convertedToProject && (
            <div className="bg-green-900/20 border border-green-800/50 rounded-md p-4">
              <p className="text-sm text-green-400 mb-3">Este lead está ganado. ¿Convertir a proyecto?</p>
              <Button onClick={handleConvert} disabled={converting}>
                {converting ? 'Convirtiendo...' : 'Convertir a Proyecto'}
              </Button>
            </div>
          )}

          {/* Already converted */}
          {lead.convertedToProject && (
            <div className="bg-green-900/20 border border-green-800/50 rounded-md p-4">
              <p className="text-sm text-green-400">✓ Convertido a proyecto</p>
              <p className="text-sm text-g20 mt-1">
                {lead.convertedToProject.code} — {lead.convertedToProject.name}
              </p>
            </div>
          )}

          {/* Lost */}
          {lead.pipelineStage === 'LOST' && (
            <div className="bg-red-900/20 border border-red-800/50 rounded-md p-4">
              <p className="text-sm text-red-400">Este lead se marcó como perdido.</p>
            </div>
          )}

          {/* Notes */}
          {lead.notes && (
            <div>
              <p className="text-xs font-mono text-g40 uppercase mb-1">Notas</p>
              <p className="text-sm text-g20 whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}

          {/* Meta */}
          <div className="pt-3 border-t border-g80 text-xs text-g50 font-mono">
            Creado {formatDate(lead.createdAt)} · Fuente: {lead.sourceType.toLowerCase()}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-g40 text-sm">Lead no encontrado</div>
      )}
    </Modal>
  )
}