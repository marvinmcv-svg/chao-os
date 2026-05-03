'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Filter, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Avatar } from '@/components/ui/Avatar'
import { Tabs } from '@/components/ui/Tabs'
import { ProjectDetailPanel } from '@/components/projects/ProjectDetailPanel'
import { NewProjectModal } from '@/components/modals/NewProjectModal'

const tabs = [
  { id: 'fases', label: 'Fases' },
  { id: 'cronograma', label: 'Cronograma' },
  { id: 'documentos', label: 'Documentos' },
]

interface Project {
  id: string
  code: string
  name: string
  currentPhase: string
  overallProgressPercent: number
  totalBudgetUSD: number
  totalSpentUSD: number
  status: string
  client: { id: string; name: string; company: string }
  projectManager: { id: string; name: string; avatarInitials: string }
  phases: { phase: string; label: string; budgetUSD: number; spentUSD: number; progressPercent: number; status: string }[]
  _count: { tasks: number; invoices: number }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: 'green' | 'yellow' | 'red' | 'blue' | 'default' }> = {
    ON_TRACK: { label: 'En curso', variant: 'green' },
    AT_RISK: { label: 'En riesgo', variant: 'yellow' },
    OVER_BUDGET: { label: 'Sobre presupuesto', variant: 'red' },
    CLOSING: { label: 'Cierre', variant: 'blue' },
    COMPLETED: { label: 'Completado', variant: 'default' },
  }
  const config = map[status] || { label: status, variant: 'default' as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

function PhaseBadge({ phase }: { phase: string }) {
  const labels: Record<string, string> = { SD: 'ES', DD: 'DD', CD: 'CD', CA: 'CA' }
  return <Badge variant="default">{labels[phase] || phase}</Badge>
}

export default function ProjectsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('fases')
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [showNewProject, setShowNewProject] = useState(false)

  useEffect(() => {
    fetchProjects()
  }, [statusFilter])

  async function fetchProjects() {
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      const res = await fetch(`/api/projects?${params}`)
      const json = await res.json()
      if (json.success) setProjects(json.data)
    } catch (e) {
      console.error('Failed to fetch projects', e)
    } finally {
      setLoading(false)
    }
  }

  const filtered = projects.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-white">Proyectos</h1>
          <p className="text-g40 mt-1 text-sm font-mono">{projects.length} proyectos — CHAO OS</p>
        </div>
        <Button onClick={() => setShowNewProject(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Proyecto
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-g50" />
          <input
            type="text"
            placeholder="Buscar por nombre o código..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 bg-g90 border border-g70 rounded-md text-sm text-g20 placeholder:text-g50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="h-10 px-3 bg-g90 border border-g70 rounded-md text-sm text-g20 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los estados</option>
          <option value="ON_TRACK">En curso</option>
          <option value="AT_RISK">En riesgo</option>
          <option value="OVER_BUDGET">Sobre presupuesto</option>
          <option value="CLOSING">Cierre</option>
          <option value="COMPLETED">Completado</option>
        </select>
      </div>

      {/* Tab bar */}
      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab content */}
      {activeTab === 'fases' && (
        <div className="space-y-3">
          {loading ? (
            <div className="text-g40 text-sm font-mono py-8 text-center">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-g40 text-sm font-mono py-8 text-center">No hay proyectos</div>
          ) : (
            filtered.map(project => (
              <Card key={project.id} onClick={() => setSelectedProject(project.id)} className="hover:border-g75 transition-colors cursor-pointer">
                <CardContent className="p-0">
                  <div className="flex items-center">
                    {/* Left: code + name + client */}
                    <div className="flex-1 min-w-0 px-5 py-4">
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className="text-xs font-mono text-g40">{project.code}</span>
                        <PhaseBadge phase={project.currentPhase} />
                        <StatusBadge status={project.status} />
                      </div>
                      <p className="text-white font-medium truncate">{project.name}</p>
                      <p className="text-xs text-g40 mt-0.5">{project.client.company}</p>
                    </div>

                    {/* Budget / Progress */}
                    <div className="hidden md:flex items-center gap-12 px-6">
                      <div className="text-right">
                        <p className="text-xs font-mono text-g40">Presupuesto</p>
                        <p className="text-sm font-mono text-g20 mt-0.5">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(project.totalBudgetUSD)}
                        </p>
                      </div>
                      <div className="w-40">
                        <div className="flex justify-between text-xs font-mono text-g40 mb-1">
                          <span>Progreso</span>
                          <span>{project.overallProgressPercent}%</span>
                        </div>
                        <ProgressBar
                          value={project.overallProgressPercent}
                          variant={project.overallProgressPercent >= 80 ? 'green' : project.overallProgressPercent >= 50 ? 'blue' : 'default'}
                        />
                      </div>
                    </div>

                    {/* Right: arrow */}
                    <div className="px-5">
                      <ChevronRight className="w-5 h-5 text-g50" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'cronograma' && (
        <div className="bg-g85 border border-g80 rounded-md p-8 text-center">
          <p className="text-g40 text-sm font-mono">Cronograma Gantt — Sprint 2</p>
        </div>
      )}

      {activeTab === 'documentos' && (
        <div className="bg-g85 border border-g80 rounded-md p-8 text-center">
          <p className="text-g40 text-sm font-mono">Gestión documental — Sprint 2</p>
        </div>
      )}

      {/* Slide-in detail panel */}
      <ProjectDetailPanel
        projectId={selectedProject}
        open={!!selectedProject}
        onClose={() => setSelectedProject(null)}
        onUpdate={fetchProjects}
      />

      {/* New Project modal */}
      <NewProjectModal
        open={showNewProject}
        onClose={() => setShowNewProject(false)}
        onSuccess={() => {
          setShowNewProject(false)
          fetchProjects()
        }}
      />
    </div>
  )
}