'use client'

import { useState, useEffect, useRef } from 'react'
import { X, User, Calendar, DollarSign, FolderKanban, CheckCircle, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Avatar } from '@/components/ui/Avatar'
import { formatCurrency, formatDate } from '@/lib/utils'
import { DocumentUpload } from './DocumentUpload'
import { DocumentList } from './DocumentList'

interface ProjectDetail {
  id: string
  code: string
  name: string
  currentPhase: string
  totalBudgetUSD: number
  totalSpentUSD: number
  overallProgressPercent: number
  status: string
  type: string
  contractType: string
  startDate: string
  estimatedEndDate: string
  client: { name: string; company: string; email: string; phone: string }
  projectManager: { name: string; email: string; avatarInitials: string; role: string }
  phases: {
    id: string
    phase: string
    label: string
    budgetUSD: number
    spentUSD: number
    progressPercent: number
    status: string
    startDate: string | null
    endDate: string | null
  }[]
  milestones: { id: string; label: string; dueDate: string; status: string }[]
  teamMembers: { role: string; user: { id: string; name: string; avatarInitials: string } }[]
  tasks: { id: string; title: string; status: string; dueDate: string; assignedTo: { name: string; avatarInitials: string } }[]
  _count: { tasks: number; documents: number }
}

interface Props {
  projectId: string | null
  open: boolean
  onClose: () => void
  onUpdate: () => void
}

export function ProjectDetailPanel({ projectId, open, onClose, onUpdate }: Props) {
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (projectId) {
      fetchProject()
    }
  }, [projectId])

  useEffect(() => {
    return () => controllerRef.current?.abort()
  }, [])

  useEffect(() => {
    if (!projectId) {
      setProject(null)
      setLoading(false)
      setError(null)
    }
  }, [projectId])

  async function fetchProject() {
    if (!projectId) return
    controllerRef.current?.abort()
    controllerRef.current = new AbortController()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}`, { signal: controllerRef.current.signal })
      const json = await res.json()
      if (json.success) setProject(json.data)
      else setError(json.error || 'Error al cargar el proyecto')
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setError('Error al cargar el proyecto')
    } finally {
      setLoading(false)
    }
  }

  // Escape key closes panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      
      {/* Panel */}
      <div className="fixed right-0 top-0 h-screen w-[520px] bg-g90 border-l border-g80 z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-g90 border-b border-g80 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-mono text-g40">{project?.code}</p>
            <h2 className="font-display text-xl text-white mt-0.5">{project?.name}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-g40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-g40 text-sm font-mono">Cargando...</div>
        ) : error ? (
          <div className="p-6 text-center text-red-500 text-sm">{error}</div>
        ) : project ? (
          <div className="p-6 space-y-6">
            {/* Status + Phase */}
            <div className="flex items-center gap-3">
              <Badge variant={project.status === 'ON_TRACK' ? 'green' : project.status === 'AT_RISK' ? 'yellow' : 'red'}>
                {project.status.replace('_', ' ')}
              </Badge>
              <Badge variant="blue">{project.currentPhase}</Badge>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-g85 border border-g80 rounded-md p-3">
                <p className="text-xs font-mono text-g40">Presupuesto</p>
                <p className="text-lg font-mono text-white mt-1">{formatCurrency(project.totalBudgetUSD)}</p>
              </div>
              <div className="bg-g85 border border-g80 rounded-md p-3">
                <p className="text-xs font-mono text-g40">Gastado</p>
                <p className="text-lg font-mono text-g20 mt-1">{formatCurrency(project.totalSpentUSD)}</p>
              </div>
              <div className="bg-g85 border border-g80 rounded-md p-3">
                <p className="text-xs font-mono text-g40">Avance</p>
                <p className="text-lg font-mono text-white mt-1">{project.overallProgressPercent}%</p>
              </div>
            </div>

            {/* Phases */}
            <div>
              <h3 className="text-xs font-mono text-g40 uppercase tracking-wider mb-3">Fases</h3>
              <div className="space-y-3">
                {project.phases.map(phase => {
                  const percent = phase.budgetUSD > 0 ? Math.round((phase.spentUSD / phase.budgetUSD) * 100) : 0
                  const overBudget = phase.spentUSD > phase.budgetUSD
                  return (
                    <div key={phase.id} className="bg-g85 border border-g80 rounded-md p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono text-white">{phase.label}</span>
                          <Badge variant={phase.status === 'COMPLETE' ? 'green' : phase.status === 'IN_PROGRESS' ? 'blue' : 'default'}>{phase.status.replace('_', ' ')}</Badge>
                        </div>
                        <span className="text-xs font-mono text-g40">{phase.progressPercent}%</span>
                      </div>
                      <ProgressBar
                        value={phase.progressPercent}
                        variant={overBudget ? 'red' : phase.progressPercent >= 80 ? 'green' : 'blue'}
                      />
                      <div className="flex justify-between mt-2 text-xs font-mono text-g40">
                        <span>Gastado: {formatCurrency(phase.spentUSD)}</span>
                        <span className={overBudget ? 'text-red-400' : ''}>Presupuesto: {formatCurrency(phase.budgetUSD)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Client info */}
            <div className="bg-g85 border border-g80 rounded-md p-4">
              <h3 className="text-xs font-mono text-g40 uppercase tracking-wider mb-3">Cliente</h3>
              <p className="text-white font-medium">{project.client.name}</p>
              <p className="text-sm text-g30 mt-0.5">{project.client.company}</p>
              <p className="text-xs text-g40 mt-1">{project.client.email}</p>
            </div>

            {/* Project Manager */}
            <div className="bg-g85 border border-g80 rounded-md p-4">
              <h3 className="text-xs font-mono text-g40 uppercase tracking-wider mb-3">Director de Proyecto</h3>
              <div className="flex items-center gap-3">
                <Avatar initials={project.projectManager?.avatarInitials ?? ''} size="md" />
                <div>
                  <p className="text-white font-medium">{project.projectManager.name}</p>
                  <p className="text-xs text-g40">{project.projectManager.role}</p>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="flex gap-4 text-sm">
              <div className="flex-1">
                <p className="text-xs font-mono text-g40">Inicio</p>
                <p className="text-g20 mt-0.5">{formatDate(project.startDate)}</p>
              </div>
              <div className="flex-1">
                <p className="text-xs font-mono text-g40">Fin estimado</p>
                <p className="text-g20 mt-0.5">{formatDate(project.estimatedEndDate)}</p>
              </div>
            </div>

            {/* Team */}
            {project.teamMembers.length > 0 && (
              <div>
                <h3 className="text-xs font-mono text-g40 uppercase tracking-wider mb-3">Equipo ({project.teamMembers.length})</h3>
                <div className="space-y-2">
                  {project.teamMembers.map((m, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2">
                        <Avatar initials={m.user?.avatarInitials ?? ''} size="sm" />
                        <span className="text-sm text-g20">{m.user.name}</span>
                      </div>
                      <span className="text-xs font-mono text-g40">{m.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tasks */}
            {project.tasks.length > 0 && (
              <div>
                <h3 className="text-xs font-mono text-g40 uppercase tracking-wider mb-3">Tareas activas ({project._count.tasks})</h3>
                <div className="space-y-2">
                  {project.tasks.slice(0, 5).map(task => (
                    <div key={task.id} className="flex items-center justify-between py-2 border-b border-g80/50 last:border-0">
                      <div className="flex items-center gap-2">
                        <Avatar initials={task.assignedTo?.avatarInitials ?? ''} size="sm" />
                        <span className="text-sm text-g20">{task.title}</span>
                      </div>
                      <div className="text-right">
                        <Badge variant={task.status === 'TODO' ? 'default' : task.status === 'IN_PROGRESS' ? 'blue' : 'green'}>{task.status}</Badge>
                        <p className="text-xs text-g40 mt-0.5">{formatDate(task.dueDate)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Documents */}
            <div>
              <h3 className="text-xs font-mono text-g40 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5" />
                Documentos
              </h3>
              <DocumentUpload projectId={project.id} onUploadComplete={() => {}} />
              <div className="mt-4">
                <DocumentList
                  projectId={project.id}
                  currentUserId={project.projectManager.id}
                  currentUserRole="ARCHITECT"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center text-g40 text-sm">Proyecto no encontrado</div>
        )}
      </div>
    </>
  )
}