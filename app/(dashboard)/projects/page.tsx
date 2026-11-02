'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Search, ChevronRight, FolderKanban, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Avatar } from '@/components/ui/Avatar'
import { Tabs, Segmented } from '@/components/ui/Tabs'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { ProjectDetailPanel } from '@/components/projects/ProjectDetailPanel'
import { ProjectTimeline, type TimelineProject } from '@/components/projects/ProjectTimeline'
import { NewProjectModal } from '@/components/modals/NewProjectModal'
import { api, asList } from '@/lib/api-client'
import { DOCUMENT_STATUS_META } from '@/components/projects/document-meta'
import { PHASE, PROJECT_STATUS, meta } from '@/lib/labels'
import { cn, formatCompact, formatDate } from '@/lib/utils'

interface Project extends TimelineProject {
  currentPhase: string
  projectManager: { id: string; name: string; avatarInitials: string }
  client: { id: string; name: string; company: string }
  _count: { tasks: number; invoices: number }
}

interface Doc {
  id: string
  filename: string
  phase: string | null
  status: string
  sizeBytes: number | null
  uploadedAt: string
  uploadedBy: { name: string; avatarInitials: string }
  project: { id: string; code: string; name: string }
}

const STATUS_FILTERS = [
  { id: 'ALL', label: 'Todos' },
  { id: 'ON_TRACK', label: 'En curso' },
  { id: 'AT_RISK', label: 'En riesgo' },
  { id: 'OVER_BUDGET', label: 'Sobre presup.' },
  { id: 'CLOSING', label: 'Cierre' },
  { id: 'COMPLETED', label: 'Completados' },
] as const

function ProjectsInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [view, setView] = useState('list')
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]['id']>('ALL')
  const [selected, setSelected] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [docs, setDocs] = useState<Doc[] | null>(null)

  // Deep links: /projects?id=… opens the panel, ?new=1 opens the modal
  useEffect(() => {
    const id = params.get('id')
    if (id) setSelected(id)
    if (params.get('new')) setShowNew(true)
  }, [params])

  const fetchProjects = useCallback(async () => {
    setError(null)
    try {
      // The endpoint returns a page object `{ projects, total, … }`, not an
      // array — reading `data` as an array crashed this page before.
      const data = await api<unknown>('/api/projects?limit=200')
      setProjects(asList<Project>(data, 'projects'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los proyectos')
      setProjects([])
    }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  useEffect(() => {
    if (view === 'docs' && docs === null) {
      api<Doc[]>('/api/documents').then(setDocs).catch(() => setDocs([]))
    }
  }, [view, docs])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (projects ?? []).filter(
      (p) =>
        (statusFilter === 'ALL' || p.status === statusFilter) &&
        (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.client.company.toLowerCase().includes(q))
    )
  }, [projects, search, statusFilter])

  const totals = useMemo(() => {
    const active = (projects ?? []).filter((p) => p.status !== 'COMPLETED')
    return {
      fee: active.reduce((s, p) => s + p.totalBudgetUSD, 0),
      spent: active.reduce((s, p) => s + p.totalSpentUSD, 0),
      active: active.length,
    }
  }, [projects])

  function closePanel() {
    setSelected(null)
    if (params.get('id')) router.replace('/projects')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proyectos"
        subtitle={
          projects
            ? `${totals.active} activos · ${formatCompact(totals.fee)} en honorarios · ${totals.fee > 0 ? Math.round((totals.spent / totals.fee) * 100) : 0}% consumido`
            : 'Cargando…'
        }
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4" /> Nuevo proyecto
          </Button>
        }
      />

      <Tabs
        tabs={[
          { id: 'list', label: 'Cartera', count: projects?.length },
          { id: 'timeline', label: 'Cronograma y honorarios' },
          { id: 'docs', label: 'Documentos' },
        ]}
        activeTab={view}
        onTabChange={setView}
      />

      {error && <ErrorBanner message={error} onRetry={fetchProjects} />}

      {view !== 'docs' && (
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-g50" />
            <input
              type="search"
              placeholder="Buscar por nombre, código o cliente…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 bg-g90 border border-g80 rounded-md text-sm text-g10 placeholder:text-g50 focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
          </div>
          <div className="overflow-x-auto">
            <Segmented options={STATUS_FILTERS.map((f) => ({ id: f.id, label: f.label }))} value={statusFilter} onChange={setStatusFilter} />
          </div>
        </div>
      )}

      {view === 'list' && (
        <div className="space-y-2">
          {projects === null &&
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[84px] rounded-lg" />)}
          {projects && filtered.length === 0 && (
            <div className="bg-g85 border border-g80 rounded-lg">
              <EmptyState
                icon={FolderKanban}
                title={search || statusFilter !== 'ALL' ? 'Ningún proyecto coincide con el filtro' : 'Aún no hay proyectos'}
                action={<Button size="sm" onClick={() => setShowNew(true)}><Plus className="w-4 h-4" /> Nuevo proyecto</Button>}
              />
            </div>
          )}
          {filtered.map((p) => {
            const st = meta(PROJECT_STATUS, p.status)
            const spent = p.totalBudgetUSD > 0 ? Math.round((p.totalSpentUSD / p.totalBudgetUSD) * 100) : 0
            const burnAhead = spent - p.overallProgressPercent
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className="w-full text-left bg-g85 border border-g80 rounded-lg hover:border-g70 hover:bg-[#1c1c1b] transition-colors grid grid-cols-[1fr_auto] lg:grid-cols-[minmax(0,1fr)_120px_220px_120px_auto] items-center gap-4 lg:gap-6 px-5 py-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xs font-mono text-g40">{p.code}</span>
                    <Badge variant="outline">{PHASE[p.currentPhase]?.short ?? p.currentPhase}</Badge>
                    <Badge variant={st.variant} dot>{st.label}</Badge>
                  </div>
                  <p className="text-white font-medium truncate">{p.name}</p>
                  <p className="text-xs text-g40 truncate">{p.client.company}</p>
                </div>

                <div className="hidden lg:block">
                  <p className="text-2xs font-mono text-g40 uppercase">Honorario</p>
                  <p className="text-sm font-mono text-g10 mt-0.5 tabular">{formatCompact(p.totalBudgetUSD)}</p>
                </div>

                <div className="hidden lg:block">
                  <div className="flex justify-between text-2xs font-mono text-g40 mb-1.5 tabular">
                    <span>Avance {p.overallProgressPercent}%</span>
                    <span className={cn(burnAhead > 10 && 'text-yellow-300', spent > 100 && 'text-red-300')}>Gasto {spent}%</span>
                  </div>
                  <ProgressBar value={p.overallProgressPercent} marker={spent} variant={spent > 100 ? 'red' : p.overallProgressPercent >= 80 ? 'green' : 'default'} />
                </div>

                <div className="hidden lg:flex items-center gap-2 min-w-0">
                  <Avatar initials={p.projectManager.avatarInitials} size="sm" title={p.projectManager.name} />
                  <span className="text-xs text-g30 truncate">{p.projectManager.name.split(' ')[0]}</span>
                </div>

                <ChevronRight className="w-4 h-4 text-g50" />
              </button>
            )
          })}
          {projects && filtered.length > 0 && (
            <p className="text-2xs font-mono text-g50 pt-1">La marca blanca sobre la barra indica el % del honorario ya consumido. Si va por delante del avance, el proyecto pierde margen.</p>
          )}
        </div>
      )}

      {view === 'timeline' &&
        (projects === null ? (
          <Skeleton className="h-96 rounded-lg" />
        ) : filtered.length === 0 ? (
          <div className="bg-g85 border border-g80 rounded-lg"><EmptyState icon={FolderKanban} title="Sin proyectos para mostrar" /></div>
        ) : (
          <ProjectTimeline projects={filtered} onSelect={setSelected} />
        ))}

      {view === 'docs' && (
        <div className="bg-g85 border border-g80 rounded-lg overflow-hidden">
          {docs === null ? (
            <div className="p-5 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : docs.length === 0 ? (
            <EmptyState icon={FileText} title="Aún no hay documentos" description="Sube planos y entregables desde el detalle de cada proyecto." />
          ) : (
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Archivo</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Fase</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Subido por</TableHead>
                  <TableHead className="text-right">Fecha</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {docs.map((d) => {
                  const st = DOCUMENT_STATUS_META[d.status] ?? { label: d.status, variant: 'default' as const }
                  return (
                    <TableRow key={d.id} onClick={() => setSelected(d.project.id)}>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-g40 flex-shrink-0" />
                          <span className="text-g10 truncate max-w-[280px]">{d.filename}</span>
                        </div>
                      </TableCell>
                      <TableCell><span className="font-mono text-2xs text-g40 mr-2">{d.project.code}</span>{d.project.name}</TableCell>
                      <TableCell>{d.phase ? PHASE[d.phase]?.short : '—'}</TableCell>
                      <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar initials={d.uploadedBy.avatarInitials} size="xs" />
                          <span className="text-xs">{d.uploadedBy.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono text-g40">{formatDate(d.uploadedAt)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      <ProjectDetailPanel projectId={selected} open={!!selected} onClose={closePanel} onUpdate={fetchProjects} />

      <NewProjectModal
        open={showNew}
        onClose={() => {
          setShowNew(false)
          if (params.get('new')) router.replace('/projects')
        }}
        onSuccess={(id) => {
          setShowNew(false)
          fetchProjects()
          if (id) setSelected(id)
        }}
      />
    </div>
  )
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsInner />
    </Suspense>
  )
}

