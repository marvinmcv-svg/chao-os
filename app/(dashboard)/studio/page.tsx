'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Clock, Users, AlertTriangle, Gauge } from 'lucide-react'
import { Panel } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState, ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { TimeTrackingWidget } from '@/components/studio/TimeTrackingWidget'
import { WorkloadHeatmap } from '@/components/studio/WorkloadHeatmap'
import { ResourcePlanner } from '@/components/studio/ResourcePlanner'
import { AbsencesPanel } from '@/components/studio/AbsencesPanel'
import { Segmented } from '@/components/ui/Tabs'
import { api } from '@/lib/api-client'
import { cn, formatDate } from '@/lib/utils'

type Tab = 'overview' | 'plan' | 'absences'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Resumen' },
  { id: 'plan', label: 'Planificación' },
  { id: 'absences', label: 'Ausencias' },
]

interface TeamMember {
  id: string
  userId: string
  name: string
  avatarInitials: string
  role: string
  weeklyHoursCapacity: number
  baseWeeklyHours: number
  holidayDays: number
  timeOffDays: number
  expectedHoursToDate: number
  pacePercent: number
  weeklyHoursLogged: number
  utilizationPercent: number
  activeTasks: number
  isOverloaded: boolean
}

interface CapacitySummary {
  avgUtilization: number
  overloadedCount: number
  totalCapacity: number
  totalLogged: number
  totalAvailable: number
  totalExpectedToDate: number
  pacePercent: number
  peopleOut: number
  holidays: { date: string; name: string }[]
}

interface Entry {
  id: string
  description: string
  hours: number
  date: string
  user: { name: string; avatarInitials: string }
  project: { code: string; name: string }
}

function utilTone(p: number): 'red' | 'yellow' | 'green' | 'blue' {
  return p >= 100 ? 'red' : p >= 90 ? 'yellow' : p >= 50 ? 'green' : 'blue'
}

function StudioInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [members, setMembers] = useState<TeamMember[] | null>(null)
  const [summary, setSummary] = useState<CapacitySummary | null>(null)
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : 'overview'
  const setTab = (t: Tab) => router.replace(t === 'overview' ? '/studio' : `/studio?tab=${t}`, { scroll: false })

  useEffect(() => {
    if (params.get('log')) setShowLog(true)
  }, [params])

  const load = useCallback(async () => {
    setError(null)
    const from = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)
    try {
      const [cap, te] = await Promise.all([
        api<{ members: TeamMember[]; summary: CapacitySummary }>('/api/studio/capacity'),
        api<Entry[]>(`/api/time-entries?from=${from}`),
      ])
      setMembers(cap.members)
      setSummary(cap.summary)
      setEntries(te.slice(0, 12))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el estudio')
      setMembers([])
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estudio"
        subtitle="Capacidad, carga de trabajo y hojas de horas del equipo"
        actions={
          <Button onClick={() => setShowLog(true)}>
            <Clock className="w-4 h-4" /> Registrar horas
          </Button>
        }
      />

      <Segmented options={TABS} value={tab} onChange={setTab} />

      {tab === 'plan' && (
        <Panel title="Planificación de recursos · 8 semanas">
          <ResourcePlanner refreshKey={refreshKey} onChanged={() => { load(); setRefreshKey((k) => k + 1) }} />
        </Panel>
      )}

      {tab === 'absences' && <AbsencesPanel onChanged={() => { load(); setRefreshKey((k) => k + 1) }} />}

      {tab === 'overview' && <>
      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {!summary || !members ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[120px] rounded-lg" />)
        ) : (
          <>
            <StatCard
              label="Equipo"
              icon={Users}
              value={members.length}
              hint={
                summary.peopleOut > 0 || summary.holidays.length > 0
                  ? [summary.peopleOut > 0 && `${summary.peopleOut} ausente${summary.peopleOut !== 1 ? 's' : ''}`, summary.holidays.length > 0 && summary.holidays.map((h) => h.name).join(', ')].filter(Boolean).join(' · ')
                  : `${summary.totalCapacity} h disponibles esta semana`
              }
            />
            {(() => {
              const pace = summary.pacePercent
              return (
                <StatCard label="Ritmo de la semana" icon={Gauge} value={`${pace}%`} tone={pace >= 110 ? 'red' : pace >= 95 ? 'yellow' : 'default'} hint={`${Math.round(summary.totalLogged)} de ${Math.round(summary.totalExpectedToDate)} h esperadas a hoy`}>
                  <ProgressBar value={pace} variant={utilTone(pace)} />
                </StatCard>
              )
            })()}
            <StatCard label="Horas esta semana" icon={Clock} value={<>{Math.round(summary.totalLogged)}<span className="text-xl text-g40"> / {Math.round(summary.totalCapacity)}</span></>} hint={`${Math.max(0, Math.round(summary.totalAvailable))} h por cubrir · sin feriados ni ausencias`} />
            <StatCard
              label="Sobrecargados"
              icon={AlertTriangle}
              value={summary.overloadedCount}
              tone={summary.overloadedCount > 0 ? 'red' : 'green'}
              hint={summary.overloadedCount > 0 ? '≥ 90% de su capacidad' : 'Carga equilibrada'}
            />
          </>
        )}
      </div>

      <Panel
        title="Carga de trabajo · 6 semanas atrás + 4 adelante"
        bodyClassName="p-4"
        action={<Button size="sm" variant="ghost" onClick={() => setTab('plan')}>Planificar →</Button>}
      >
        <WorkloadHeatmap refreshKey={refreshKey} />
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel title="Capacidad esta semana" className="xl:col-span-2">
          {!members ? (
            <div className="p-5 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : members.length === 0 ? (
            <EmptyState icon={Users} title="Sin miembros del equipo" />
          ) : (
            <Table>
              <TableHeader>
                <tr>
                  <TableHead>Miembro</TableHead>
                  <TableHead className="text-center">Tareas</TableHead>
                  <TableHead className="text-right">Horas</TableHead>
                  <TableHead className="min-w-[180px]">Ritmo vs. esperado</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {members.map((m) => {
                  const pace = m.pacePercent
                  const tone = utilTone(pace)
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar initials={m.avatarInitials} />
                          <div className="min-w-0">
                            <p className="text-sm text-white truncate">{m.name}</p>
                            <p className="text-xs text-g40 truncate">
                              {m.role}
                              {m.timeOffDays > 0 && <span className="text-g20"> · {m.timeOffDays} d ausente</span>}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-mono tabular">{m.activeTasks}</TableCell>
                      <TableCell className="text-right font-mono tabular">
                        <span className="text-white">{m.weeklyHoursLogged}</span>
                        <span className="text-g40" title={m.weeklyHoursCapacity < m.baseWeeklyHours ? `${m.baseWeeklyHours} h de contrato menos feriados/ausencias` : undefined}> / {m.weeklyHoursCapacity}h</span>
                      </TableCell>
                      <TableCell><ProgressBar value={pace} variant={tone} showLabel /></TableCell>
                      <TableCell className="text-right">
                        {m.weeklyHoursCapacity === 0 ? (
                          <Badge variant="default">Ausente</Badge>
                        ) : (
                          <Badge variant={tone === 'blue' ? 'default' : tone} dot>
                            {pace >= 110 ? 'Excedido' : pace >= 95 ? 'Al límite' : pace >= 60 ? 'Óptimo' : 'Disponible'}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Panel>

        <Panel title="Últimos registros">
          {!entries ? (
            <div className="p-5 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : entries.length === 0 ? (
            <EmptyState icon={Clock} title="Sin horas registradas" description="Usa el cronómetro o carga horas manualmente." />
          ) : (
            <ul className="divide-y divide-g80">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar initials={e.user.avatarInitials} size="sm" title={e.user.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-g10 truncate">{e.description}</p>
                    <p className="text-2xs font-mono text-g40 truncate">{e.project.code} · {formatDate(e.date)}</p>
                  </div>
                  <span className={cn('text-sm font-mono tabular', e.hours > 9 ? 'text-yellow-300' : 'text-g10')}>{e.hours}h</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      </>}

      {showLog && (
        <TimeTrackingWidget
          onClose={() => {
            setShowLog(false)
            if (params.get('log')) router.replace('/studio')
          }}
          onEntryAdded={() => {
            load()
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}

export default function StudioPage() {
  return (
    <Suspense fallback={null}>
      <StudioInner />
    </Suspense>
  )
}
