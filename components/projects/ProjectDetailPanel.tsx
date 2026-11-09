'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { CalendarDays, CheckCircle2, Circle, FileText, Receipt, Users, ArrowUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Avatar } from '@/components/ui/Avatar'
import { Drawer } from '@/components/ui/Drawer'
import { Skeleton, ErrorBanner } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'
import { CONTRACT_TYPE, INVOICE_STATUS, PHASE, PHASE_STATUS, PROJECT_STATUS, PROJECT_TYPE, TASK_STATUS, meta } from '@/lib/labels'
import { cn, formatCompact, formatCurrency, formatDate } from '@/lib/utils'
import { DocumentUpload } from './DocumentUpload'
import { DocumentList } from './DocumentList'
import { ChangeOrdersSection } from './ChangeOrdersSection'
import { ExpensesSection } from '@/components/expenses/ExpensesSection'

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
  client: { id: string; name: string; company: string; email: string; phone: string }
  projectManager: { id: string; name: string; email: string; avatarInitials: string; role: string }
  phases: { id: string; phase: string; label: string; budgetUSD: number; spentUSD: number; progressPercent: number; status: string }[]
  milestones: { id: string; label: string; dueDate: string; status: string; phase: string | null }[]
  teamMembers: { role: string; user: { id: string; name: string; avatarInitials: string } }[]
  tasks: { id: string; title: string; status: string; priority: string; dueDate: string; assignedTo: { name: string; avatarInitials: string } }[]
  invoices: { id: string; number: string; amountUSD: number; status: string; dueDate: string }[]
  _count: { tasks: number; documents: number }
}

interface Props {
  projectId: string | null
  open: boolean
  onClose: () => void
  onUpdate: () => void
}

function Section({ title, icon: Icon, children, action }: { title: string; icon?: React.ElementType; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-2xs font-mono text-g40 uppercase tracking-[0.14em] flex items-center gap-2">
          {Icon && <Icon className="w-3.5 h-3.5" />}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function PhaseProgressInput({ value, onCommit, disabled }: { value: number; onCommit: (v: number) => void; disabled?: boolean }) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  const commit = () => {
    const n = Math.max(0, Math.min(100, Math.round(Number(v))))
    if (Number.isFinite(n) && n !== value) onCommit(n)
    else setV(String(value))
  }
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        max={100}
        value={v}
        disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        aria-label="Avance de fase (%)"
        className="w-14 h-7 px-2 text-right text-xs font-mono bg-g95 border border-g70 rounded text-g10 focus:outline-none focus:ring-1 focus:ring-accent/60 tabular"
      />
      <span className="text-2xs font-mono text-g40">%</span>
    </div>
  )
}

export function ProjectDetailPanel({ projectId, open, onClose, onUpdate }: Props) {
  const { data: session } = useSession()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [docsVersion, setDocsVersion] = useState(0)

  const fetchProject = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      setProject(await api<ProjectDetail>(`/api/projects/${projectId}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el proyecto')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId && open) fetchProject()
    if (!open) setProject(null)
  }, [projectId, open, fetchProject])

  async function mutate(fn: () => Promise<unknown>) {
    setSaving(true)
    setError(null)
    try {
      await fn()
      await fetchProject()
      onUpdate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const st = project ? meta(PROJECT_STATUS, project.status) : null
  const spentPct = project && project.totalBudgetUSD > 0 ? Math.round((project.totalSpentUSD / project.totalBudgetUSD) * 100) : 0
  const ev = project ? (project.totalBudgetUSD * project.overallProgressPercent) / 100 : 0
  const cpi = project && project.totalSpentUSD > 0 ? ev / project.totalSpentUSD : null
  const days = project ? Math.ceil((new Date(project.estimatedEndDate).getTime() - Date.now()) / 86_400_000) : 0

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      eyebrow={project ? `${project.code} · ${PROJECT_TYPE[project.type] ?? project.type}` : 'Proyecto'}
      title={project?.name ?? (loading ? 'Cargando…' : '')}
    >
      {error && <div className="px-6 pt-4"><ErrorBanner message={error} onRetry={fetchProject} /></div>}

      {loading && !project ? (
        <div className="p-6 space-y-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
          <Skeleton className="h-24" />
        </div>
      ) : project && st ? (
        <div className="p-6 space-y-7">
          {/* Status row */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={project.status}
              disabled={saving}
              onChange={(e) => mutate(() => api(`/api/projects/${project.id}`, { method: 'PUT', body: JSON.stringify({ status: e.target.value }) }))}
              aria-label="Estado del proyecto"
              className="h-7 pl-2 pr-6 text-2xs font-mono uppercase tracking-wide rounded bg-g80 border border-g70 text-g10 focus:outline-none focus:ring-1 focus:ring-accent/60"
            >
              {Object.entries(PROJECT_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <Badge variant="outline">Fase actual · {PHASE[project.currentPhase]?.label ?? project.currentPhase}</Badge>
            <Badge variant="outline">{CONTRACT_TYPE[project.contractType] ?? project.contractType}</Badge>
          </div>

          {/* KPI tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-g80 border border-g80 rounded-lg overflow-hidden">
            {[
              { l: 'Honorario', v: formatCompact(project.totalBudgetUSD) },
              { l: 'Consumido', v: `${spentPct}%`, tone: spentPct > 100 ? 'text-red-400' : spentPct > project.overallProgressPercent + 10 ? 'text-yellow-400' : '' },
              { l: 'Valor ganado', v: formatCompact(ev) },
              { l: 'IDC', v: cpi == null ? '—' : cpi.toFixed(2), tone: cpi == null ? '' : cpi < 0.85 ? 'text-red-400' : cpi < 1 ? 'text-yellow-400' : 'text-green-400' },
            ].map((k) => (
              <div key={k.l} className="bg-g85 p-3">
                <p className="text-2xs font-mono text-g40 uppercase tracking-wider">{k.l}</p>
                <p className={cn('font-display text-2xl text-white mt-1 tabular', k.tone)}>{k.v}</p>
              </div>
            ))}
          </div>

          <div>
            <div className="flex justify-between text-2xs font-mono text-g40 mb-1.5">
              <span>Avance general {project.overallProgressPercent}%</span>
              <span className={days < 0 ? 'text-red-300' : ''}>
                {formatDate(project.startDate)} → {formatDate(project.estimatedEndDate)} · {days < 0 ? `${-days} días de atraso` : `${days} días restantes`}
              </span>
            </div>
            <ProgressBar size="md" value={project.overallProgressPercent} marker={spentPct} variant={spentPct > 100 ? 'red' : 'default'} />
          </div>

          {/* Phases */}
          <Section title="Fases y honorarios">
            <div className="space-y-2">
              {project.phases.map((phase) => {
                const over = phase.spentUSD > phase.budgetUSD
                const ps = meta(PHASE_STATUS, phase.status)
                const spentP = phase.budgetUSD > 0 ? Math.round((phase.spentUSD / phase.budgetUSD) * 100) : 0
                return (
                  <div key={phase.id} className={cn('rounded-lg border p-3.5', project.currentPhase === phase.phase ? 'border-accent/40 bg-accent-muted' : 'border-g80 bg-g85')}>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono text-accent w-6">{PHASE[phase.phase]?.short}</span>
                        <span className="text-sm text-g10 truncate">{PHASE[phase.phase]?.label ?? phase.label}</span>
                        <Badge variant={ps.variant}>{ps.label}</Badge>
                      </div>
                      <PhaseProgressInput
                        value={phase.progressPercent}
                        disabled={saving}
                        onCommit={(v) => mutate(() => api(`/api/projects/${project.id}/phases/${phase.phase}`, { method: 'PATCH', body: JSON.stringify({ progressPercent: v }) }))}
                      />
                    </div>
                    <ProgressBar value={phase.progressPercent} marker={spentP} variant={over ? 'red' : phase.status === 'COMPLETE' ? 'green' : 'default'} />
                    <div className="flex justify-between mt-1.5 text-2xs font-mono text-g40 tabular">
                      <span>Consumido {formatCurrency(phase.spentUSD)} ({spentP}%)</span>
                      <span className={over ? 'text-red-300' : ''}>Honorario {formatCurrency(phase.budgetUSD)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>

          <ChangeOrdersSection
            projectId={project.id}
            onContractChanged={() => {
              fetchProject()
              onUpdate()
            }}
          />

          <ExpensesSection
            projectId={project.id}
            onChanged={() => {
              fetchProject()
              onUpdate()
            }}
          />

          {/* Milestones */}
          {project.milestones.length > 0 && (
            <Section title="Hitos" icon={CalendarDays}>
              <ol className="relative border-l border-g70 ml-1.5 space-y-3">
                {project.milestones.map((m) => {
                  const done = m.status === 'approved' || m.status === 'APPROVED'
                  const late = !done && new Date(m.dueDate) < new Date()
                  return (
                    <li key={m.id} className="pl-4 relative">
                      <span className="absolute -left-[7px] top-0.5 bg-g90">
                        {done ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Circle className={cn('w-3.5 h-3.5', late ? 'text-red-400' : 'text-g50')} />}
                      </span>
                      <div className="flex items-center justify-between gap-3">
                        <span className={cn('text-sm', done ? 'text-g30' : 'text-g10')}>{m.label}</span>
                        <span className={cn('text-2xs font-mono', late ? 'text-red-300' : 'text-g40')}>{formatDate(m.dueDate)}</span>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </Section>
          )}

          {/* People */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-g80 bg-g85 p-4">
              <p className="text-2xs font-mono text-g40 uppercase tracking-wider mb-2">Cliente</p>
              <p className="text-sm text-white">{project.client.company}</p>
              <p className="text-xs text-g30">{project.client.name}</p>
              <p className="text-xs text-g40 mt-1 truncate">{project.client.email}</p>
              <Link href={`/clients?id=${project.client.id}`} className="inline-flex items-center gap-1 mt-2 text-2xs font-mono text-accent hover:underline">
                Portal y ficha <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="rounded-lg border border-g80 bg-g85 p-4">
              <p className="text-2xs font-mono text-g40 uppercase tracking-wider mb-2">Director de proyecto</p>
              <div className="flex items-center gap-3">
                <Avatar initials={project.projectManager.avatarInitials} />
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{project.projectManager.name}</p>
                  <p className="text-xs text-g40 truncate">{project.projectManager.email}</p>
                </div>
              </div>
              {project.teamMembers.length > 0 && (
                <div className="flex -space-x-1.5 mt-3" title={project.teamMembers.map((m) => m.user.name).join(', ')}>
                  {project.teamMembers.map((m) => (
                    <Avatar key={m.user.id} initials={m.user.avatarInitials} size="sm" className="ring-2 ring-g85" />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tasks */}
          <Section title={`Tareas abiertas (${project.tasks.length})`} icon={Users}>
            {project.tasks.length === 0 ? (
              <p className="text-sm text-g40">Sin tareas abiertas.</p>
            ) : (
              <div className="divide-y divide-g80 border border-g80 rounded-lg overflow-hidden">
                {project.tasks.map((task) => {
                  const ts = meta(TASK_STATUS, task.status)
                  const late = new Date(task.dueDate) < new Date()
                  return (
                    <div key={task.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-g85">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar initials={task.assignedTo.avatarInitials} size="xs" title={task.assignedTo.name} />
                        <span className="text-sm text-g20 truncate">{task.title}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={cn('text-2xs font-mono', late ? 'text-red-300' : 'text-g40')}>{formatDate(task.dueDate)}</span>
                        <Badge variant={ts.variant}>{ts.label}</Badge>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          {/* Invoices */}
          <Section
            title="Facturación"
            icon={Receipt}
            action={<Link href="/finance?new=1" className="text-2xs font-mono text-accent hover:underline">+ Factura</Link>}
          >
            {project.invoices.length === 0 ? (
              <p className="text-sm text-g40">Sin facturas emitidas.</p>
            ) : (
              <div className="divide-y divide-g80 border border-g80 rounded-lg overflow-hidden">
                {project.invoices.map((inv) => {
                  const s = meta(INVOICE_STATUS, inv.status)
                  return (
                    <Link key={inv.id} href={`/finance?invoice=${inv.id}`} className="flex items-center justify-between px-3.5 py-2.5 bg-g85 hover:bg-g80/60">
                      <span className="text-sm font-mono text-g10">{inv.number}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono text-g20 tabular">{formatCurrency(inv.amountUSD)}</span>
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </Section>

          {/* Documents */}
          <Section title={`Documentos (${project._count.documents})`} icon={FileText}>
            <DocumentUpload projectId={project.id} onUploadComplete={() => setDocsVersion((v) => v + 1)} />
            <div className="mt-4">
              <DocumentList
                key={docsVersion}
                projectId={project.id}
                currentUserId={session?.user?.id ?? ''}
                currentUserRole={session?.user?.role ?? ''}
              />
            </div>
          </Section>
        </div>
      ) : null}
    </Drawer>
  )
}
