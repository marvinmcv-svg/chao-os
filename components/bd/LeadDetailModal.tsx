'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Sparkles, ArrowRight, Mail, Phone, CheckCircle2, XCircle, FolderPlus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { GoNoGoScore } from '@/components/bd/GoNoGoScore'
import { api } from '@/lib/api-client'
import { PIPELINE_STAGE, PROJECT_TYPE, SOURCE_TYPE, USER_ROLE, meta } from '@/lib/labels'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

const FLOW = ['PROSPECT', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON'] as const

interface AIScoreData {
  overallScore: number
  breakdown: Record<string, number> | null
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
  aiScoreBreakdown: Record<string, number> | null
  aiRecommendation: string | null
  aiAnalysis?: string | null
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
  onConvert: (leadId: string, projectId?: string) => void
  onStageChange: (leadId: string, stage: string) => void
  onUpdate: () => void
}

export function LeadDetailModal({ leadId, open, onClose, onConvert, onStageChange, onUpdate }: Props) {
  const [lead, setLead] = useState<Lead | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ai, setAi] = useState<AIScoreData | null>(null)
  const [prob, setProb] = useState('')

  const fetchLead = useCallback(async () => {
    if (!leadId) return
    setLoading(true)
    setError(null)
    try {
      const [l, s] = await Promise.all([api<Lead>(`/api/leads/${leadId}`), api<AIScoreData | null>(`/api/leads/${leadId}/ai-score`).catch(() => null)])
      setLead(l)
      setProb(String(l.closeProbability))
      setAi(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lead no encontrado')
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    if (leadId && open) fetchLead()
    if (!open) {
      setLead(null)
      setAi(null)
    }
  }, [leadId, open, fetchLead])

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción')
    } finally {
      setBusy(null)
    }
  }

  // Previously these buttons only refreshed the board without calling the API.
  const changeStage = (stage: string) =>
    act(stage, async () => {
      if (!lead) return
      await api(`/api/leads/${lead.id}/stage`, { method: 'PATCH', body: JSON.stringify({ pipelineStage: stage }) })
      await fetchLead()
      onStageChange(lead.id, stage)
    })

  const saveProbability = () =>
    act('prob', async () => {
      if (!lead) return
      const n = Math.max(0, Math.min(100, Math.round(Number(prob))))
      if (n === lead.closeProbability) return
      await api(`/api/leads/${lead.id}`, { method: 'PUT', body: JSON.stringify({ closeProbability: n }) })
      await fetchLead()
      onUpdate()
    })

  const rescore = () =>
    act('ai', async () => {
      if (!lead) return
      setAi(await api<AIScoreData>(`/api/leads/${lead.id}/ai-score`, { method: 'POST' }))
      onUpdate()
    })

  // Previously guarded by `if (!lead.convertedToProject) return` — inverted,
  // so conversion could never run.
  const convert = () =>
    act('convert', async () => {
      if (!lead || lead.convertedToProject) return
      const project = await api<{ id: string }>(`/api/leads/${lead.id}/convert`, { method: 'POST' })
      onConvert(lead.id, project?.id)
      onUpdate()
    })

  if (!open) return null

  const stage = lead ? meta(PIPELINE_STAGE, lead.pipelineStage) : null
  const stageIdx = lead ? FLOW.indexOf(lead.pipelineStage as (typeof FLOW)[number]) : -1
  const closed = lead?.pipelineStage === 'WON' || lead?.pipelineStage === 'LOST'
  const next = stageIdx >= 0 && stageIdx < FLOW.length - 1 ? FLOW[stageIdx + 1] : null

  return (
    <Modal open={open} onClose={onClose} title={lead?.projectName ?? 'Lead'} description={lead ? `${lead.company} · ${PROJECT_TYPE[lead.projectType] ?? lead.projectType}` : undefined} size="xl">
      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
      {loading && !lead ? (
        <div className="space-y-4"><Skeleton className="h-16" /><Skeleton className="h-48" /></div>
      ) : lead && stage ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          <div className="space-y-6 min-w-0">
            {/* Stage stepper */}
            <div>
              <div className="flex items-center gap-1">
                {FLOW.map((s, i) => {
                  const reached = lead.pipelineStage !== 'LOST' && i <= stageIdx
                  return (
                    <button
                      key={s}
                      disabled={!!busy || closed || s === lead.pipelineStage}
                      onClick={() => changeStage(s)}
                      className={cn(
                        'flex-1 h-8 text-2xs font-mono uppercase tracking-wider rounded transition-colors',
                        reached ? (s === 'WON' ? 'bg-green-500/20 text-green-300' : 'bg-g70 text-white') : 'bg-g85 text-g40 border border-g80',
                        !closed && s !== lead.pipelineStage && 'hover:border-g60 hover:text-g10'
                      )}
                      title={closed ? 'Lead cerrado' : `Mover a ${PIPELINE_STAGE[s].label}`}
                    >
                      {PIPELINE_STAGE[s].label}
                    </button>
                  )
                })}
              </div>
              {!closed && (
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {next && (
                    <Button size="sm" onClick={() => changeStage(next)} loading={busy === next}>
                      Avanzar a {PIPELINE_STAGE[next].label} <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="danger" onClick={() => changeStage('LOST')} loading={busy === 'LOST'}>
                    <XCircle className="w-3.5 h-3.5" /> Marcar perdido
                  </Button>
                </div>
              )}
              {lead.pipelineStage === 'LOST' && (
                <div className="flex items-center justify-between gap-3 mt-3 p-3 rounded-md bg-red-950/30 border border-red-900/50">
                  <p className="text-sm text-red-300">Lead marcado como perdido.</p>
                  <Button size="sm" variant="secondary" onClick={() => changeStage('QUALIFIED')} loading={busy === 'QUALIFIED'}>Reabrir</Button>
                </div>
              )}
            </div>

            {lead.pipelineStage === 'WON' && !lead.convertedToProject && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-green-950/30 border border-green-900/60">
                <div>
                  <p className="text-sm text-green-300">Lead ganado</p>
                  <p className="text-xs text-g40 mt-0.5">Crea el proyecto con sus 4 fases y el cliente en un paso.</p>
                </div>
                <Button onClick={convert} loading={busy === 'convert'}>
                  <FolderPlus className="w-4 h-4" /> Convertir a proyecto
                </Button>
              </div>
            )}
            {lead.convertedToProject && (
              <Link href={`/projects?id=${lead.convertedToProject.id}`} className="flex items-center justify-between p-4 rounded-lg bg-green-950/30 border border-green-900/60 hover:border-green-700">
                <span className="flex items-center gap-2 text-sm text-green-300">
                  <CheckCircle2 className="w-4 h-4" /> Proyecto {lead.convertedToProject.code} — {lead.convertedToProject.name}
                </span>
                <ArrowRight className="w-4 h-4 text-green-300" />
              </Link>
            )}

            {/* AI */}
            <section className="rounded-lg border border-g80 bg-g85 p-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-2xs font-mono text-g40 uppercase tracking-[0.14em] flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-accent" /> Análisis Go / No-Go
                </h4>
                <Button variant="secondary" size="sm" onClick={rescore} loading={busy === 'ai'}>
                  {ai || lead.aiScore != null ? 'Recalificar' : 'Calificar'}
                </Button>
              </div>
              {ai || lead.aiScore != null ? (
                <GoNoGoScore
                  overallScore={ai?.overallScore ?? lead.aiScore}
                  breakdown={ai?.breakdown ?? lead.aiScoreBreakdown}
                  recommendation={(ai?.recommendation ?? lead.aiRecommendation) as 'GO' | 'NO_GO' | 'REVIEW' | null}
                  loading={busy === 'ai'}
                />
              ) : (
                <p className="text-sm text-g40">Aún sin calificar. Evalúa honorario, riesgo, capacidad del equipo y probabilidad antes de invertir en una propuesta.</p>
              )}
              {(ai?.summary || lead.aiAnalysis) && <p className="text-sm text-g20 mt-4 leading-relaxed">{ai?.summary ?? lead.aiAnalysis}</p>}
              {ai && (ai.keyStrengths.length > 0 || ai.keyRisks.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  {ai.keyStrengths.length > 0 && (
                    <div>
                      <p className="text-2xs font-mono text-green-300 uppercase mb-1">Fortalezas</p>
                      <ul className="space-y-1 text-xs text-g20 list-disc pl-4">{ai.keyStrengths.map((s) => <li key={s}>{s}</li>)}</ul>
                    </div>
                  )}
                  {ai.keyRisks.length > 0 && (
                    <div>
                      <p className="text-2xs font-mono text-red-300 uppercase mb-1">Riesgos</p>
                      <ul className="space-y-1 text-xs text-g20 list-disc pl-4">{ai.keyRisks.map((s) => <li key={s}>{s}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </section>

            {lead.notes && (
              <section>
                <h4 className="text-2xs font-mono text-g40 uppercase tracking-[0.14em] mb-1.5">Notas</h4>
                <p className="text-sm text-g20 whitespace-pre-wrap leading-relaxed">{lead.notes}</p>
              </section>
            )}
          </div>

          {/* Sidebar facts */}
          <aside className="space-y-4">
            <div className="rounded-lg border border-g80 bg-g85 p-4">
              <p className="text-2xs font-mono text-g40 uppercase tracking-wider">Honorario estimado</p>
              <p className="font-display text-3xl text-white mt-1 tabular">{formatCurrency(lead.estimatedValueUSD)}</p>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-g80">
                <label htmlFor="prob" className="text-2xs font-mono text-g40 uppercase">Probabilidad</label>
                <div className="flex items-center gap-1">
                  <input
                    id="prob"
                    type="number"
                    min={0}
                    max={100}
                    value={prob}
                    disabled={closed}
                    onChange={(e) => setProb(e.target.value)}
                    onBlur={saveProbability}
                    onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                    className="w-16 h-7 px-2 text-right text-sm font-mono bg-g95 border border-g70 rounded text-g10 focus:outline-none focus:ring-1 focus:ring-accent/60 tabular"
                  />
                  <span className="text-xs text-g40">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-2xs font-mono text-g40 uppercase">Ponderado</span>
                <span className="text-sm font-mono text-g10 tabular">{formatCurrency((lead.estimatedValueUSD * lead.closeProbability) / 100)}</span>
              </div>
              <div className="mt-3"><Badge variant={stage.variant} dot>{stage.label}</Badge></div>
            </div>

            <div className="rounded-lg border border-g80 bg-g85 p-4 space-y-2">
              <p className="text-2xs font-mono text-g40 uppercase tracking-wider">Contacto</p>
              <p className="text-sm text-white">{lead.contactName}</p>
              <a href={`mailto:${lead.contactEmail}`} className="flex items-center gap-2 text-xs text-g30 hover:text-white"><Mail className="w-3.5 h-3.5" />{lead.contactEmail}</a>
              {lead.contactPhone && <a href={`tel:${lead.contactPhone}`} className="flex items-center gap-2 text-xs text-g30 hover:text-white"><Phone className="w-3.5 h-3.5" />{lead.contactPhone}</a>}
            </div>

            <div className="rounded-lg border border-g80 bg-g85 p-4">
              <p className="text-2xs font-mono text-g40 uppercase tracking-wider mb-2">Responsable</p>
              <div className="flex items-center gap-3">
                <Avatar initials={lead.assignedTo.avatarInitials} />
                <div>
                  <p className="text-sm text-white">{lead.assignedTo.name}</p>
                  <p className="text-xs text-g40">{USER_ROLE[lead.assignedTo.role] ?? lead.assignedTo.role}</p>
                </div>
              </div>
            </div>

            <p className="text-2xs font-mono text-g50">
              Creado {formatDate(lead.createdAt)} · Fuente: {SOURCE_TYPE[lead.sourceType] ?? lead.sourceType}
            </p>
          </aside>
        </div>
      ) : null}
    </Modal>
  )
}
