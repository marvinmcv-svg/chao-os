'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { FileText, Download, CheckCircle, Clock, AlertCircle } from 'lucide-react'

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
    NOT_STARTED: { label: 'No iniciado', bg: 'bg-gray-100', text: 'text-gray-600', icon: Clock },
    IN_PROGRESS: { label: 'En progreso', bg: 'bg-blue-100', text: 'text-blue-700', icon: Clock },
    COMPLETE: { label: 'Completado', bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle },
  }
  const c = map[status] || map.NOT_STARTED
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      <c.icon className="w-3 h-3" />
      {c.label}
    </span>
  )
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    SENT: { label: 'Enviada', color: 'text-blue-700 bg-blue-100' },
    PENDING: { label: 'Pendiente', color: 'text-yellow-700 bg-yellow-100' },
    PAID: { label: 'Pagada', color: 'text-green-700 bg-green-100' },
    OVERDUE: { label: 'Vencida', color: 'text-red-700 bg-red-100' },
  }
  const c = map[status] || { label: status, color: 'bg-gray-100 text-gray-700' }
  return <span className={`px-2 py-1 rounded text-xs font-medium ${c.color}`}>{c.label}</span>
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

    fetch(`/api/portal/project/${projectId}?token=${token}`)
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
          <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-gray-500">Cargando...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
        <p className="mt-4 text-gray-700 font-medium">{error}</p>
        <p className="text-sm text-gray-400 mt-1">Verifique su enlace de acceso.</p>
      </div>
    )
  }

  if (!data) return null

  const { project, phases, milestones, invoices, documents } = data
  const phaseLabels: Record<string, string> = { SD: 'ES', DD: 'DD', CD: 'CD', CA: 'CA' }

  return (
    <div className="space-y-8">
      {/* Project header */}
      <div>
        <p className="text-xs font-mono text-gray-400 uppercase tracking-wider">{project.code}</p>
        <h1 className="font-serif text-3xl text-gray-900 mt-1">{project.name}</h1>
        <p className="text-gray-500 mt-1 capitalize">{project.type.toLowerCase()}</p>
      </div>

      {/* Overall progress */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-sm text-gray-500 uppercase tracking-wider">Avance General</h2>
          <span className="font-mono text-2xl text-gray-900">{project.overallProgressPercent}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all"
            style={{ width: `${project.overallProgressPercent}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-400">
          <span>Inicio: {new Date(project.startDate).toLocaleDateString('es-BO')}</span>
          <span>Fin estimado: {new Date(project.estimatedEndDate).toLocaleDateString('es-BO')}</span>
        </div>
      </div>

      {/* Phases */}
      <section>
        <h2 className="font-mono text-sm text-gray-500 uppercase tracking-wider mb-4">Fases del Proyecto</h2>
        <div className="space-y-3">
          {phases.map(phase => (
            <div key={phase.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-lg text-gray-900">{phaseLabels[phase.phase] || phase.phase}</span>
                  <span className="font-medium text-gray-800">{phase.label}</span>
                </div>
                <PhaseStatusBadge status={phase.status} />
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                <div
                  className={`h-2 rounded-full ${
                    phase.status === 'COMPLETE' ? 'bg-green-500' :
                    phase.status === 'IN_PROGRESS' ? 'bg-blue-500' : 'bg-gray-300'
                  }`}
                  style={{ width: `${phase.progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>{phase.progressPercent}% completado</span>
                <span>Presupuesto: ${phase.budgetUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Milestones */}
      {milestones.length > 0 && (
        <section>
          <h2 className="font-mono text-sm text-gray-500 uppercase tracking-wider mb-4">Hitos</h2>
          <div className="space-y-2">
            {milestones.map(milestone => (
              <div key={milestone.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span className="text-gray-800">{milestone.label}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">{new Date(milestone.dueDate).toLocaleDateString('es-BO')}</p>
                  <p className="text-xs text-green-600">Aprobado</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <section>
          <h2 className="font-mono text-sm text-gray-500 uppercase tracking-wider mb-4">Documentos</h2>
          <div className="space-y-2">
            {documents.map(doc => (
              <a
                key={doc.id}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{doc.filename}</p>
                    {doc.phase && <p className="text-xs text-gray-400">Fase {phaseLabels[doc.phase] || doc.phase}</p>}
                  </div>
                </div>
                <Download className="w-4 h-4 text-gray-400" />
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Invoices */}
      {invoices.length > 0 && (
        <section>
          <h2 className="font-mono text-sm text-gray-500 uppercase tracking-wider mb-4">Facturas</h2>
          <div className="space-y-2">
            {invoices.map(inv => (
              <div key={inv.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <div>
                  <p className="font-mono text-sm text-gray-900">{inv.number}</p>
                  <p className="text-xs text-gray-400">{new Date(inv.issuedAt).toLocaleDateString('es-BO')}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm text-gray-900">
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