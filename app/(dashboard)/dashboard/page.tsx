'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ArrowUpRight, AlertTriangle, Banknote, FolderKanban, Gauge, LineChart as LineIcon, Plus, Clock, Receipt, Briefcase } from 'lucide-react'
import { Panel } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState, ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { api } from '@/lib/api-client'
import { CHART } from '@/lib/chart-theme'
import { INVOICE_STATUS, PHASE, PROJECT_STATUS, meta } from '@/lib/labels'
import { cn, formatCompact, formatCurrency, weekPace, workdaysElapsedThisWeek } from '@/lib/utils'

interface KPIData {
  activeProjects: number
  atRiskProjects: number
  pipelineWeightedValue: number
  pipelineRawValue: number
  pipelineCount: number
  winRate: number | null
  monthBilled: number
  monthCollected: number
  receivables: number
  overdueAmount: number
  pendingInvoices: number
  overdueInvoices: number
  backlog: number
  teamUtilization: number
  hoursLogged: number
  hoursCapacity: number
  overloadedCount: number
  trend: { month: string; billed: number; collected: number }[]
}

interface Activity {
  projects: { id: string; code: string; name: string; currentPhase: string; overallProgressPercent: number; status: string; totalBudgetUSD: number; totalSpentUSD: number; client: { company: string } }[]
  invoices: { id: string; number: string; amountUSD: number; status: string; issuedAt: string; project: { code: string; name: string } }[]
}

interface Alert {
  type: string
  severity: 'red' | 'yellow' | 'blue' | 'green'
  message: string
  href?: string
}

const ALERT_STYLE: Record<Alert['severity'], { bar: string; label: string; text: string }> = {
  red: { bar: 'bg-red-400', label: 'Crítico', text: 'text-red-300' },
  yellow: { bar: 'bg-yellow-400', label: 'Atención', text: 'text-yellow-300' },
  blue: { bar: 'bg-blue-400', label: 'Oportunidad', text: 'text-blue-300' },
  green: { bar: 'bg-green-400', label: 'OK', text: 'text-green-300' },
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/La_Paz', hour: 'numeric', hour12: false }).format(new Date()))
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-g90 border border-g70 rounded-md px-3 py-2 shadow-panel">
      <p className="text-2xs font-mono text-g40 uppercase mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-g30">{p.name}</span>
          <span className="font-mono text-white ml-auto tabular">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const [kpis, setKpis] = useState<KPIData | null>(null)
  const [activity, setActivity] = useState<Activity | null>(null)
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    Promise.all([
      api<KPIData>('/api/dashboard/kpis').then(setKpis),
      api<Activity>('/api/dashboard/activity').then(setActivity),
      api<Alert[]>('/api/dashboard/alerts').then(setAlerts),
    ]).catch((e) => setError(e.message || 'No se pudo cargar el dashboard'))
  }, [])

  useEffect(load, [load])

  const firstName = session?.user?.name?.split(' ')[0]
  const today = new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={today}
        title={`${greeting()}${firstName ? `, ${firstName}` : ''}`}
        subtitle="CHAO Arquitectura S.R.L. · Estado del estudio"
        actions={
          <>
            <Link href="/studio?log=1" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-semibold bg-g80 border border-g70 text-g10 hover:bg-g75">
              <Clock className="w-4 h-4" /> Horas
            </Link>
            <Link href="/finance?new=1" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-semibold bg-g80 border border-g70 text-g10 hover:bg-g75">
              <Receipt className="w-4 h-4" /> Factura
            </Link>
            <Link href="/bd?new=1" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md text-sm font-semibold bg-g05 text-black hover:bg-white">
              <Plus className="w-4 h-4" /> Nuevo lead
            </Link>
          </>
        }
      />

      {error && <ErrorBanner message={error} onRetry={load} />}

      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {!kpis ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[136px] rounded-lg" />)
        ) : (
          <>
            <StatCard
              label="Proyectos activos"
              icon={FolderKanban}
              value={kpis.activeProjects}
              hint={kpis.atRiskProjects > 0 ? `${kpis.atRiskProjects} en riesgo o sobre presupuesto` : 'Todos en curso'}
              hintTone={kpis.atRiskProjects > 0 ? 'yellow' : 'green'}
            />
            <StatCard
              label="Pipeline ponderado"
              icon={LineIcon}
              value={formatCompact(kpis.pipelineWeightedValue)}
              hint={`${kpis.pipelineCount} oportunidades · ${formatCompact(kpis.pipelineRawValue)} bruto${kpis.winRate != null ? ` · ${kpis.winRate}% cierre` : ''}`}
            />
            <StatCard
              label="Por cobrar"
              icon={Banknote}
              value={formatCompact(kpis.receivables)}
              hint={kpis.overdueInvoices > 0 ? `${formatCompact(kpis.overdueAmount)} vencido en ${kpis.overdueInvoices} factura${kpis.overdueInvoices !== 1 ? 's' : ''}` : 'Sin facturas vencidas'}
              hintTone={kpis.overdueInvoices > 0 ? 'red' : 'green'}
            />
            {(() => {
              const pace = weekPace(kpis.hoursLogged, kpis.hoursCapacity)
              const tone = pace >= 110 ? 'red' : pace >= 95 ? 'yellow' : 'default'
              return (
                <StatCard
                  label="Ritmo del equipo"
                  icon={Gauge}
                  value={`${pace}%`}
                  tone={tone}
                  hint={`${Math.round(kpis.hoursLogged)} h registradas · día ${workdaysElapsedThisWeek()} de 5`}
                >
                  <ProgressBar value={pace} variant={pace >= 110 ? 'red' : pace >= 95 ? 'yellow' : 'green'} />
                </StatCard>
              )
            })()}
          </>
        )}
      </div>

      {/* Money + alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel
          className="xl:col-span-2"
          title="Facturado vs cobrado · 6 meses"
          action={
            kpis && (
              <div className="flex items-center gap-4 text-2xs font-mono text-g40">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: CHART.blue }} />Facturado</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: CHART.orange }} />Cobrado</span>
              </div>
            )
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-[1fr_200px]">
            <div className="h-[240px] px-2 pt-4">
              {kpis ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kpis.trend} barGap={2} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: CHART.axis, fontSize: 11, fontFamily: CHART.font }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fill: CHART.axis, fontSize: 11, fontFamily: CHART.font }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="billed" name="Facturado" fill={CHART.blue} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="collected" name="Cobrado" fill={CHART.orange} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Skeleton className="h-full" />
              )}
            </div>
            <div className="border-t md:border-t-0 md:border-l border-g80 grid grid-cols-3 md:grid-cols-1 divide-x md:divide-x-0 md:divide-y divide-g80">
              {[
                { l: 'Facturado este mes', v: kpis?.monthBilled },
                { l: 'Cobrado este mes', v: kpis?.monthCollected },
                { l: 'Backlog por facturar', v: kpis?.backlog },
              ].map((s) => (
                <div key={s.l} className="p-4">
                  <p className="text-2xs font-mono text-g40 uppercase tracking-wider">{s.l}</p>
                  <p className="font-display text-2xl text-white mt-1 tabular">{s.v != null ? formatCompact(s.v) : '—'}</p>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          title="Requiere atención"
          action={alerts && alerts.length > 0 ? <Badge variant="red">{alerts.filter((a) => a.severity === 'red').length || alerts.length}</Badge> : undefined}
        >
          <div className="divide-y divide-g80">
            {alerts === null &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4"><Skeleton className="h-10" /></div>
              ))}
            {alerts?.length === 0 && <EmptyState icon={AlertTriangle} title="Todo bajo control" description="No hay alertas activas en finanzas, presupuesto ni capacidad." />}
            {alerts?.map((a, i) => {
              const s = ALERT_STYLE[a.severity]
              const body = (
                <div className="flex gap-3 px-5 py-3.5 group">
                  <span className={cn('w-0.5 rounded-full flex-shrink-0', s.bar)} />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-2xs font-mono uppercase tracking-wider', s.text)}>{s.label}</p>
                    <p className="text-sm text-g20 mt-0.5 leading-snug">{a.message}</p>
                  </div>
                  {a.href && <ArrowUpRight className="w-4 h-4 text-g50 group-hover:text-white flex-shrink-0 mt-1" />}
                </div>
              )
              return a.href ? (
                <Link key={i} href={a.href} className="block hover:bg-g80/40 transition-colors">{body}</Link>
              ) : (
                <div key={i}>{body}</div>
              )
            })}
          </div>
        </Panel>
      </div>

      {/* Projects + invoices */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel
          className="xl:col-span-2"
          title="Proyectos · actividad reciente"
          action={<Link href="/projects" className="text-xs text-g40 hover:text-white flex items-center gap-1">Ver todos <ArrowUpRight className="w-3 h-3" /></Link>}
        >
          <div className="divide-y divide-g80">
            {!activity && Array.from({ length: 4 }).map((_, i) => <div key={i} className="p-4"><Skeleton className="h-10" /></div>)}
            {activity?.projects.length === 0 && <EmptyState icon={FolderKanban} title="Aún no hay proyectos" />}
            {activity?.projects.map((p) => {
              const st = meta(PROJECT_STATUS, p.status)
              const spent = p.totalBudgetUSD > 0 ? Math.round((p.totalSpentUSD / p.totalBudgetUSD) * 100) : 0
              return (
                <Link key={p.id} href={`/projects?id=${p.id}`} className="grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,1fr)_200px_auto] items-center gap-4 px-5 py-3.5 hover:bg-g80/40 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-2xs font-mono text-g40">{p.code}</span>
                      <span className="text-2xs font-mono text-g50">· {PHASE[p.currentPhase]?.short ?? p.currentPhase}</span>
                    </div>
                    <p className="text-sm text-white truncate mt-0.5">{p.name}</p>
                    <p className="text-xs text-g40 truncate">{p.client.company}</p>
                  </div>
                  <div className="hidden md:block">
                    <div className="flex justify-between text-2xs font-mono text-g40 mb-1.5 tabular">
                      <span>Avance {p.overallProgressPercent}%</span>
                      <span className={spent > p.overallProgressPercent + 10 ? 'text-yellow-300' : ''}>Gasto {spent}%</span>
                    </div>
                    <ProgressBar value={p.overallProgressPercent} marker={spent} variant={spent > 100 ? 'red' : 'default'} />
                  </div>
                  <Badge variant={st.variant} dot>{st.label}</Badge>
                </Link>
              )
            })}
          </div>
        </Panel>

        <Panel
          title="Últimas facturas"
          action={<Link href="/finance" className="text-xs text-g40 hover:text-white flex items-center gap-1">Finanzas <ArrowUpRight className="w-3 h-3" /></Link>}
        >
          <div className="divide-y divide-g80">
            {!activity && Array.from({ length: 4 }).map((_, i) => <div key={i} className="p-4"><Skeleton className="h-10" /></div>)}
            {activity?.invoices.length === 0 && <EmptyState icon={Receipt} title="Sin facturas" />}
            {activity?.invoices.map((inv) => {
              const st = meta(INVOICE_STATUS, inv.status)
              return (
                <Link key={inv.id} href={`/finance?invoice=${inv.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-g80/40 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-mono text-g10">{inv.number}</p>
                    <p className="text-xs text-g40 truncate">{inv.project.name}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-mono text-white tabular">{formatCurrency(inv.amountUSD)}</p>
                    <Badge variant={st.variant} className="mt-1">{st.label}</Badge>
                  </div>
                </Link>
              )
            })}
          </div>
        </Panel>
      </div>

      <p className="text-2xs font-mono text-g50 flex items-center gap-2">
        <Briefcase className="w-3 h-3" /> Consejo: pulsa ⌘K / Ctrl K para buscar cualquier proyecto, lead o factura.
      </p>
    </div>
  )
}
