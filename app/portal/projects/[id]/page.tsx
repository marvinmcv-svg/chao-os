'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { FileText, Download, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { PHASE, PROJECT_TYPE } from '@/lib/labels'

interface Phase {
  id: string
  phase: string
  label: string
  budgetUSD: number
  spentUSD: number
  progressPercent: number
  status: string
}

interface Milestone {
  id: string
  label: string
  dueDate: string
  status: string
}

interface Invoice {
  id: string
  number: string
  amountUSD: number
  status: string
  issuedAt: string
  dueDate: string
}

interface Document {
  id: string
  filename: string
  url: string
  uploadedAt: string
  phase: string | null
}

interface ProjectData {
  project: { id: string; code: string; name: string; type: string; currentPhase: string; overallProgressPercent: number; status: string; startDate: string; estimatedEndDate: string }
  phases: Phase[]
  milestones: Milestone[]
  invoices: Invoice[]
  documents: Document[]
}

function PhaseStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string; icon: any }> = {
    NOT_STARTED: { label: 'No iniciada', bg: 'bg-g80', text: 'text-g30', icon: Clock },
    IN_PROGRESS: { label: 'En progreso', bg: 'bg-blue-500/10', text: 'text-blue-300', icon: Clock },
    COMPLETE: { label: 'Completada', bg: 'bg-green-500/10', text: 'text-green-300', icon: CheckCircle },
  }
  const c = map[status] || map.NOT_STARTED
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-mono uppercase ${c.bg} ${c.text}`}>
      <c.icon className="w-3 h-3" />
      {c.label}
    </span>
  )
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    SENT: { label: 'Por pagar', color: 'status-blue' },
    PENDING: { label: 'Pendiente', color: 'status-yellow' },
    PAID: { label: 'Pagada', color: 'status-green' },
    OVERDUE: { label: 'Vencida', color: 'status-red' },
  }
  const c = map[status] || { label: status, color: 'bg-g80 text-g30' }
  return <span className={`px-2 py-0.5 rounded text-2xs font-mono uppercase ${c.color}`}>{c.label}</span>
}

export default function PortalProjectPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const projectId = params.id as string

  const [data, setData] = useState<ProjectData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setError('Token de acceso requerido')
      setLoading(false)
      return
    }

    fetch(`/api/portal/project/${encodeURIComponent(projectId)}?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setData(json.data)
        else setError(json.error?.message || 'Error al cargar')
      })
      .catch(() => setError('Error de conexión'))
      .finally(() => setLoading(false))
  }, [projectId, token])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-g70 border-t-accent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-g40">Cargando…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
        <p className="mt-4 text-g10 font-medium">{error}</p>
        <p className="text-sm text-g40 mt-1">Verifica tu enlace de acceso o solicita uno nuevo a tu director de proyecto.</p>
      </div>
    )
  }

  if (!data) return null

  const { project, phases, milestones, invoices, documents } = data
  const phaseLabels: Record<string, string> = { SD: 'EP', DD: 'DD', CD: 'DC', CA: 'AO' }

  return (
    <div className="space-y-8">
      {/* Project header */}
      <div>
        <p className="text-xs font-mono text-g40 uppercase tracking-wider">{project.code}</p>
        <h1 className="font-display text-3xl text-white mt-1">{project.name}</h1>
        <p className="text-g40 mt-1">{PROJECT_TYPE[project.type] ?? project.type}</p>
      </div>

      {/* Overall progress */}
      <div className="bg-g85 border border-g80 rounded-lg p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-sm text-g40 uppercase tracking-wider">Avance General</h2>
          <span className="font-mono text-2xl text-white">{project.overallProgressPercent}%</span>
        </div>
        <div className="w-full bg-g80 rounded-full h-2">
          <div
            className="bg-accent h-2 rounded-full transition-all"
            style={{ width: `${project.overallProgressPercent}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-g40">
          <span>Inicio: {new Date(project.startDate).toLocaleDateString('es-BO')}</span>
          <span>Fin estimado: {new Date(project.estimatedEndDate).toLocaleDateString('es-BO')}</span>
        </div>
      </div>

      {/* Phases */}
      <section>
        <h2 className="font-mono text-sm text-g40 uppercase tracking-wider mb-4">Fases del Proyecto</h2>
        <div className="space-y-3">
          {phases.map(phase => (
            <div key={phase.id} className="border border-g80 bg-g85 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-lg text-white">{phaseLabels[phase.phase] || phase.phase}</span>
                  <span className="font-medium text-g10">{PHASE[phase.phase]?.label ?? phase.label}</span>
                </div>
                <PhaseStatusBadge status={phase.status} />
              </div>
              <div className="w-full bg-g80 rounded-full h-1.5 mb-2">
                <div
                  className={`h-1.5 rounded-full ${
                    phase.status === 'COMPLETE' ? 'bg-green-400' :
                    phase.status === 'IN_PROGRESS' ? 'bg-blue-400' : 'bg-g60'
                  }`}
                  style={{ width: `${phase.progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-g40">
                <span>{phase.progressPercent}% completado</span>
                <span>Honorario: ${phase.budgetUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Milestones */}
      {milestones.length > 0 && (
        <section>
          <h2 className="font-mono text-sm text-g40 uppercase tracking-wider mb-4">Hitos</h2>
          <div className="space-y-2">
            {milestones.map(milestone => {
              const done = ['approved', 'APPROVED'].includes(milestone.status)
              const late = !done && new Date(milestone.dueDate) < new Date()
              return (
                <div key={milestone.id} className="flex items-center justify-between py-3 border-b border-g80 last:border-0">
                  <div className="flex items-center gap-3">
                    {done ? <CheckCircle className="w-5 h-5 text-green-400" /> : <Clock className={`w-5 h-5 ${late ? 'text-red-400' : 'text-g50'}`} />}
                    <span className={done ? 'text-g30' : 'text-g10'}>{milestone.label}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-g40 font-mono">{new Date(milestone.dueDate).toLocaleDateString('es-BO')}</p>
                    <p className={`text-2xs font-mono uppercase ${done ? 'text-green-300' : late ? 'text-red-300' : 'text-g40'}`}>{done ? 'Aprobado' : late ? 'Vencido' : 'Pendiente'}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <section>
          <h2 className="font-mono text-sm text-g40 uppercase tracking-wider mb-4">Documentos</h2>
          <div className="space-y-2">
            {documents.map(doc => (
              <a
                key={doc.id}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 border border-g80 bg-g85 rounded-lg hover:border-g70 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-g40" />
                  <div>
                    <p className="text-sm font-medium text-g10">{doc.filename}</p>
                    {doc.phase && <p className="text-xs text-g40">Fase {phaseLabels[doc.phase] || doc.phase}</p>}
                  </div>
                </div>
                <Download className="w-4 h-4 text-g40" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <section>
          <h2 className="font-mono text-sm text-g40 uppercase tracking-wider mb-4">Facturas</h2>
          <div className="space-y-2">
            {invoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between p-3 border border-g80 bg-g85 rounded-lg">
                <div>
                  <p className="font-mono text-sm text-white">{inv.number}</p>
                  <p className="text-xs text-g40">{new Date(inv.issuedAt).toLocaleDateString('es-BO')}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-white">
                    ${inv.amountUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </p>
                  <InvoiceStatusBadge status={inv.status} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}