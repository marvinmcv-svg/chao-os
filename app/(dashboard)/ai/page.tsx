'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BudgetAlert } from '@/components/ai/BudgetAlert'
import { IncomeForecast } from '@/components/ai/IncomeForecast'
import { ChatPanel } from '@/components/ai/ChatPanel'

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

export default function AIPage() {
  const router = useRouter()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [forecast, setForecast] = useState<IncomeForecastData | null>(null)
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [loadingForecast, setLoadingForecast] = useState(true)
  const [errorAlerts, setErrorAlerts] = useState<string | null>(null)
  const [errorForecast, setErrorForecast] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)

  useEffect(() => {
    // Fetch AI alerts
    fetch('/api/ai/alerts')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.alerts) {
          setAlerts(data.data.alerts)
        } else {
          setErrorAlerts(data.error?.message ?? 'Error cargando alertas')
        }
      })
      .catch(() => setErrorAlerts('Error de conexión'))
      .finally(() => setLoadingAlerts(false))

    // Fetch income forecast
    fetch('/api/ai/income-forecast')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.forecast) {
          setForecast(data.data.forecast)
        } else {
          setErrorForecast(data.error?.message ?? 'Error cargando forecast')
        }
      })
      .catch(() => setErrorForecast('Error de conexión'))
      .finally(() => setLoadingForecast(false))
  }, [])

  const handleDismissAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
  }

  const handleNavigateToProject = (projectId: string) => {
    router.push(`/projects/${projectId}`)
  }

  // Filter for critical + warning alerts (top 5)
  const topAlerts = alerts
    .filter(a => a.severity === 'critical' || a.severity === 'warning')
    .slice(0, 5)

  return (
    <div className="p-6 space-y-6 min-h-screen overflow-auto">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl text-white">Asistente IA</h1>
        <p className="text-g40 mt-1 text-sm font-mono">Claude-powered assistant — CHAO OS</p>
      </div>

      {/* Budget Alerts Section */}
      <section>
        <h2 className="font-mono text-sm text-g40 uppercase tracking-wider mb-3 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          Alertas de Presupuesto y Capacidad
          {loadingAlerts && (
            <span className="text-xs text-g50 animate-pulse">cargando...</span>
          )}
        </h2>

        {errorAlerts && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3 mb-3">
            <p className="text-xs text-red-400">{errorAlerts}</p>
          </div>
        )}

        {!loadingAlerts && !errorAlerts && topAlerts.length === 0 && (
          <div className="bg-g85 border border-g80 rounded-md p-4 text-center">
            <p className="text-sm text-g40 font-mono">Sin alertas críticas — todo bajo control ✓</p>
          </div>
        )}

        <div className="space-y-2">
          {topAlerts.map(alert => (
            <BudgetAlert
              key={alert.id}
              alert={alert}
              onDismiss={handleDismissAlert}
              onNavigate={handleNavigateToProject}
            />
          ))}
        </div>
      </section>

      {/* Income Forecast Section */}
      <section>
        <h2 className="font-mono text-sm text-g40 uppercase tracking-wider mb-3 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Forecast de Ingresos
          {loadingForecast && (
            <span className="text-xs text-g50 animate-pulse">cargando...</span>
          )}
        </h2>

        {errorForecast && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-md p-3 mb-3">
            <p className="text-xs text-red-400">{errorForecast}</p>
          </div>
        )}

        {!loadingForecast && !errorForecast && forecast && (
          <IncomeForecast forecast={forecast} />
        )}

        {loadingForecast && (
          <div className="bg-g85 border border-g80 rounded-md p-6 text-center">
            <p className="text-sm text-g40 font-mono animate-pulse">Generando forecast...</p>
          </div>
        )}
      </section>

      {/* Chat Panel Section */}
      <section>
        <h2 className="font-mono text-sm text-g40 uppercase tracking-wider mb-3 flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Chat con Asistente IA
        </h2>
        <ChatPanel onClose={() => setChatOpen(false)} />
      </section>
    </div>
  )
}