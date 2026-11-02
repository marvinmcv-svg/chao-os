'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import { BudgetAlert } from '@/components/ai/BudgetAlert'
import { IncomeForecast } from '@/components/ai/IncomeForecast'
import { ChatPanel } from '@/components/ai/ChatPanel'
import { Panel } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'

interface Alert {
  id: string
  type: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  action: string
  projectId?: string
}

interface IncomeForecastData {
  pipelineWeighted: number
  committedRevenue: number
  expectedThisQuarter: number
  narrative: string
  leadsClosingThisMonth: { name: string; value: number }[]
  projectsInvoicingThisMonth: { name: string; value: number }[]
}

type Source = 'claude' | 'rules'

function SourceBadge({ source }: { source?: Source }) {
  if (!source) return null
  return source === 'claude' ? (
    <Badge variant="blue"><Sparkles className="w-3 h-3" />Claude</Badge>
  ) : (
    <Badge variant="outline" className="normal-case">Reglas</Badge>
  )
}

export default function AIPage() {
  const router = useRouter()
  const [alerts, setAlerts] = useState<Alert[] | null>(null)
  const [alertsSource, setAlertsSource] = useState<Source>()
  const [forecast, setForecast] = useState<IncomeForecastData | null>(null)
  const [forecastSource, setForecastSource] = useState<Source>()
  const [errorAlerts, setErrorAlerts] = useState<string | null>(null)
  const [errorForecast, setErrorForecast] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const load = useCallback(() => {
    setAlerts(null)
    setForecast(null)
    setErrorAlerts(null)
    setErrorForecast(null)
    api<{ alerts: Alert[]; source: Source }>('/api/ai/alerts')
      .then((d) => {
        setAlerts(d.alerts ?? [])
        setAlertsSource(d.source)
      })
      .catch((e) => { setErrorAlerts(e.message); setAlerts([]) })
    api<{ forecast: IncomeForecastData; source: Source }>('/api/ai/income-forecast')
      .then((d) => {
        setForecast(d.forecast)
        setForecastSource(d.source)
      })
      .catch((e) => setErrorForecast(e.message))
  }, [])

  useEffect(load, [load])

  const visible = (alerts ?? []).filter((a) => showAll || a.severity !== 'info')
  const shown = showAll ? visible : visible.slice(0, 6)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asistente IA"
        subtitle="Alertas de riesgo, forecast de ingresos y chat con los datos en vivo del estudio"
        actions={
          <Button variant="secondary" onClick={load}>
            <RefreshCw className="w-4 h-4" /> Actualizar
          </Button>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_440px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <Panel
            title="Alertas de presupuesto, cobranza y capacidad"
            action={
              <div className="flex items-center gap-2">
                <SourceBadge source={alertsSource} />
                {(alerts?.length ?? 0) > 6 && (
                  <button onClick={() => setShowAll((s) => !s)} className="text-2xs font-mono text-g40 hover:text-white">
                    {showAll ? 'Ver menos' : `Ver todas (${alerts!.length})`}
                  </button>
                )}
              </div>
            }
            bodyClassName="p-4 space-y-2"
          >
            {errorAlerts && <ErrorBanner message={errorAlerts} onRetry={load} />}
            {alerts === null && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
            {alerts && !errorAlerts && shown.length === 0 && (
              <EmptyState icon={ShieldCheck} title="Sin alertas críticas" description="Presupuestos, cobranza, hitos y capacidad dentro de rango." />
            )}
            {shown.map((alert) => (
              <BudgetAlert
                key={alert.id}
                alert={alert}
                onDismiss={(id) => setAlerts((prev) => prev?.filter((a) => a.id !== id) ?? prev)}
                onNavigate={(projectId) => router.push(`/projects?id=${projectId}`)}
              />
            ))}
          </Panel>

          <Panel title="Forecast de ingresos" action={<SourceBadge source={forecastSource} />} bodyClassName="p-4">
            {errorForecast && <ErrorBanner message={errorForecast} onRetry={load} />}
            {!forecast && !errorForecast && <Skeleton className="h-48" />}
            {forecast && <IncomeForecast forecast={forecast} />}
          </Panel>
        </div>

        <div className="xl:sticky xl:top-20">
          <ChatPanel embedded />
        </div>
      </div>
    </div>
  )
}
