'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Search, Target, Timer, Trophy, TrendingUp } from 'lucide-react'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { Panel } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/EmptyState'
import { KanbanBoard } from '@/components/bd/KanbanBoard'
import { NewLeadModal } from '@/components/bd/NewLeadModal'
import { LeadDetailModal } from '@/components/bd/LeadDetailModal'
import { ContactsTable } from '@/components/bd/ContactsTable'
import { api } from '@/lib/api-client'
import { CHART } from '@/lib/chart-theme'
import { PIPELINE_STAGE } from '@/lib/labels'
import { formatCompact, formatCurrency } from '@/lib/utils'

interface FunnelRow { stage: string; count: number; totalValue: number; weightedValue: number }
interface FunnelSummary { totalLeads: number; wonLeads: number; lostLeads: number; winRate: number; avgCycleDays: number }

function BDInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [tab, setTab] = useState('pipeline')
  const [showNew, setShowNew] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)
  const [search, setSearch] = useState('')
  const [funnel, setFunnel] = useState<FunnelRow[] | null>(null)
  const [summary, setSummary] = useState<FunnelSummary | null>(null)

  useEffect(() => {
    const id = params.get('lead')
    if (id) setSelectedLeadId(id)
    if (params.get('new')) setShowNew(true)
  }, [params])

  const loadFunnel = useCallback(() => {
    api<{ funnel: FunnelRow[]; summary: FunnelSummary }>('/api/leads/funnel')
      .then((d) => {
        setFunnel(d.funnel)
        setSummary(d.summary)
      })
      .catch(() => setFunnel([]))
  }, [])

  useEffect(loadFunnel, [loadFunnel, refresh])

  const bump = () => setRefresh((n) => n + 1)
  const open = (funnel ?? []).filter((r) => r.stage !== 'WON' && r.stage !== 'LOST')
  const openValue = open.reduce((s, r) => s + r.totalValue, 0)
  const weighted = open.reduce((s, r) => s + r.weightedValue, 0)
  const openCount = open.reduce((s, r) => s + r.count, 0)
  const maxStageValue = Math.max(1, ...(funnel ?? []).map((r) => r.totalValue))

  function closeLead() {
    setSelectedLeadId(null)
    if (params.get('lead')) router.replace('/bd')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business Development"
        subtitle="Pipeline de oportunidades, calificación Go / No-Go y conversión a proyecto"
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4" /> Nuevo lead
          </Button>
        }
      />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {!summary ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[120px] rounded-lg" />)
        ) : (
          <>
            <StatCard label="Pipeline abierto" icon={Target} value={formatCompact(openValue)} hint={`${openCount} oportunidades activas`} />
            <StatCard label="Ponderado" icon={TrendingUp} value={formatCompact(weighted)} hint="Valor × probabilidad de cierre" />
            {summary.wonLeads + summary.lostLeads > 0 ? (
              <StatCard label="Tasa de cierre" icon={Trophy} value={`${summary.winRate}%`} hint={`${summary.wonLeads} ganados · ${summary.lostLeads} perdidos`} tone={summary.winRate >= 40 ? 'green' : 'default'} />
            ) : (
              <StatCard label="Tasa de cierre" icon={Trophy} value="—" hint="Aún no hay leads cerrados" />
            )}
            <StatCard label="Ciclo promedio" icon={Timer} value={summary.wonLeads > 0 ? `${summary.avgCycleDays}d` : '—'} hint={summary.wonLeads > 0 ? 'Desde el alta hasta ganar' : 'Se calcula al ganar el primer lead'} />
          </>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <Tabs
          className="flex-1"
          tabs={[
            { id: 'pipeline', label: 'Pipeline' },
            { id: 'contacts', label: 'Contactos' },
            { id: 'analytics', label: 'Embudo' },
          ]}
          activeTab={tab}
          onTabChange={setTab}
        />
        {tab === 'pipeline' && (
          <div className="relative sm:w-72 sm:mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-g50" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar leads…"
              className="w-full h-9 pl-9 pr-3 bg-g90 border border-g80 rounded-md text-sm text-g10 placeholder:text-g50 focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
          </div>
        )}
      </div>

      {tab === 'pipeline' && (
        <KanbanBoard onCardClick={(l) => setSelectedLeadId(l.id)} onNewLead={() => setShowNew(true)} refreshTrigger={refresh} filter={search} />
      )}

      {tab === 'contacts' && (
        <ContactsTable
          onContactClick={(c) => {
            if (c.type === 'lead') setSelectedLeadId(c.id)
            else router.push(`/clients?id=${c.id}`)
          }}
        />
      )}

      {tab === 'analytics' && (
        <Panel title="Embudo por etapa" action={<span className="text-2xs font-mono text-g40">barra = valor total · relleno = ponderado</span>}>
          {!funnel ? (
            <div className="p-5"><Skeleton className="h-64" /></div>
          ) : (
            <div className="p-5 space-y-3">
              {funnel.map((row) => {
                const m = PIPELINE_STAGE[row.stage]
                return (
                  <div key={row.stage} className="grid grid-cols-[110px_1fr_auto] sm:grid-cols-[140px_1fr_200px] items-center gap-4">
                    <div>
                      <p className="text-sm text-g10">{m?.label ?? row.stage}</p>
                      <p className="text-2xs font-mono text-g40">{row.count} lead{row.count !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="h-7 bg-g90 rounded relative overflow-hidden" title={`${formatCurrency(row.totalValue)} total · ${formatCurrency(row.weightedValue)} ponderado`}>
                      <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${(row.totalValue / maxStageValue) * 100}%`, background: `${CHART.blue}40` }} />
                      <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${(row.weightedValue / maxStageValue) * 100}%`, background: CHART.blue }} />
                    </div>
                    <div className="text-right font-mono tabular">
                      <p className="text-sm text-g10">{formatCompact(row.totalValue)}</p>
                      <p className="text-2xs text-g40">pond. {formatCompact(row.weightedValue)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      )}

      <NewLeadModal
        open={showNew}
        onClose={() => {
          setShowNew(false)
          if (params.get('new')) router.replace('/bd')
        }}
        onSuccess={(lead: { id?: string } | null) => {
          setShowNew(false)
          bump()
          if (lead?.id) setSelectedLeadId(lead.id)
        }}
      />

      <LeadDetailModal
        leadId={selectedLeadId}
        open={!!selectedLeadId}
        onClose={closeLead}
        onConvert={(_id, projectId) => {
          bump()
          if (projectId) router.push(`/projects?id=${projectId}`)
        }}
        onStageChange={bump}
        onUpdate={bump}
      />
    </div>
  )
}

export default function BDPage() {
  return (
    <Suspense fallback={null}>
      <BDInner />
    </Suspense>
  )
}
