'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatCurrency, formatDate } from '@/lib/utils'

interface KPIData {
  activeProjects: number
  pipelineWeightedValue: number
  pipelineCount: number
  monthBilled: number
  pendingInvoices: number
  overdueInvoices: number
  teamUtilization: number
  overloadedCount: number
}

interface Project {
  id: string
  code: string
  name: string
  currentPhase: string
  overallProgressPercent: number
  status: string
  client: { name: string; company: string }
  updatedAt: string
}

interface Invoice {
  id: string
  number: string
  amountUSD: number
  status: string
  issuedAt: string
  project: { code: string; name: string }
  client: { name: string }
}

interface Alert {
  type: string
  severity: 'red' | 'yellow' | 'blue' | 'green'
  message: string
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

export default function DashboardPage() {
  const [kpis, setKpis] = useState<KPIData | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/kpis').then(r => r.json()),
      fetch('/api/dashboard/activity').then(r => r.json()),
      fetch('/api/dashboard/alerts').then(r => r.json()),
    ]).then(([kpiJson, activityJson, alertsJson]) => {
      if (kpiJson.success) setKpis(kpiJson.data)
      if (activityJson.success) {
        setProjects(activityJson.data.projects)
        setInvoices(activityJson.data.invoices)
      }
      if (alertsJson.success) setAlerts(alertsJson.data)
    }).catch(console.error)
    .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-3xl text-white">Dashboard</h1>
          <p className="text-g40 mt-1 text-sm font-mono">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl text-white">Dashboard</h1>
        <p className="text-g40 mt-1 text-sm font-mono">CHAO Arquitectura S.R.L. · Resumen general</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-mono text-g40 uppercase tracking-wider">Proyectos Activos</p>
            <p className="font-display text-4xl text-white mt-2">{kpis?.activeProjects ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-mono text-g40 uppercase tracking-wider">Pipeline BD</p>
            <p className="font-display text-4xl text-white mt-2">
              {kpis ? formatCurrency(kpis.pipelineWeightedValue) : '—'}
            </p>
            {kpis && <p className="text-xs text-green-400 mt-1">{kpis.pipelineCount} oportunidades abiertas</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-mono text-g40 uppercase tracking-wider">Facturación Mes</p>
            <p className="font-display text-4xl text-white mt-2">
              {kpis ? formatCurrency(kpis.monthBilled) : '—'}
            </p>
            {kpis && (
              <p className={`text-xs mt-1 ${kpis.overdueInvoices > 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                {kpis.pendingInvoices} pendiente{kpis.pendingInvoices !== 1 ? 's' : ''}{kpis.overdueInvoices > 0 && `, ${kpis.overdueInvoices} vencida${kpis.overdueInvoices !== 1 ? 's' : ''}`}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-mono text-g40 uppercase tracking-wider">Utilización Estudio</p>
            <p className="font-display text-4xl text-white mt-2">{kpis?.teamUtilization ?? '—'}%</p>
            {kpis && kpis.overloadedCount > 0 && (
              <p className="text-xs text-yellow-400 mt-1">{kpis.overloadedCount} sobrecargado{kpis.overloadedCount !== 1 ? 's' : ''}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent activity + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Projects */}
        <div className="lg:col-span-2 bg-g85 border border-g80 rounded-md">
          <div className="px-4 py-3 border-b border-g80">
            <h2 className="font-mono text-sm text-g40 uppercase tracking-wider">Proyectos Recientes</h2>
          </div>
          <div className="divide-y divide-g80/50">
            {projects.length === 0 && (
              <div className="px-4 py-6 text-center text-g40 text-sm font-mono">No hay proyectos</div>
            )}
            {projects.map(project => (
              <div key={project.id} className="px-4 py-3 flex items-center justify-between hover:bg-g80/30 transition-colors">
                <div>
                  <p className="text-sm font-mono text-g10">{project.code}</p>
                  <p className="text-sm text-white mt-0.5">{project.name}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={project.status} />
                  </div>
                  <p className="text-xs text-g40 mt-1">{project.overallProgressPercent}% completo</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Alert Panel */}
        <div className="bg-g85 border border-g80 rounded-md">
          <div className="px-4 py-3 border-b border-g80">
            <h2 className="font-mono text-sm text-g40 uppercase tracking-wider">Asistente IA</h2>
          </div>
          <div className="p-4 space-y-3">
            {alerts.length === 0 && (
              <p className="text-g40 text-sm font-mono py-4 text-center">Sin alertas activas</p>
            )}
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={`p-3 rounded ${
                  alert.severity === 'red' ? 'bg-red-900/20 border border-red-800/50' :
                  alert.severity === 'yellow' ? 'bg-yellow-900/20 border border-yellow-800/50' :
                  alert.severity === 'blue' ? 'bg-blue-900/20 border border-blue-800/50' :
                  'bg-green-900/20 border border-green-800/50'
                }`}
              >
                <p className={`text-xs font-mono uppercase ${
                  alert.severity === 'red' ? 'text-red-400' :
                  alert.severity === 'yellow' ? 'text-yellow-400' :
                  alert.severity === 'blue' ? 'text-blue-400' :
                  'text-green-400'
                }`}>{alert.type.replace(/_/g, ' ')}</p>
                <p className="text-sm text-g20 mt-1">{alert.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BD Pipeline + Finance snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Invoices */}
        <div className="bg-g85 border border-g80 rounded-md">
          <div className="px-4 py-3 border-b border-g80">
            <h2 className="font-mono text-sm text-g40 uppercase tracking-wider">Últimas Facturas</h2>
          </div>
          <div className="divide-y divide-g80/50">
            {invoices.length === 0 && (
              <div className="px-4 py-6 text-center text-g40 text-sm font-mono">No hay facturas</div>
            )}
            {invoices.map(invoice => (
              <div key={invoice.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-mono text-g10">{invoice.number}</p>
                  <p className="text-sm text-g20 mt-0.5">{invoice.project.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-white">{formatCurrency(invoice.amountUSD)}</p>
                  <Badge
                    variant={
                      invoice.status === 'PAID' ? 'green' :
                      invoice.status === 'OVERDUE' ? 'red' :
                      invoice.status === 'PENDING' ? 'yellow' :
                      'default'
                    }
                    className="mt-1"
                  >
                    {invoice.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Placeholder for other dashboard content */}
        <div className="bg-g85 border border-g80 rounded-md p-6">
          <h2 className="font-mono text-sm text-g40 uppercase tracking-wider mb-4">Acciones Rápidas</h2>
          <div className="space-y-3">
            <a href="/projects" className="flex items-center gap-3 p-3 bg-g80 rounded hover:bg-g75 transition-colors">
              <span className="text-sm text-g20">→ Ver todos los proyectos</span>
            </a>
            <a href="/bd" className="flex items-center gap-3 p-3 bg-g80 rounded hover:bg-g75 transition-colors">
              <span className="text-sm text-g20">→ Pipeline de ventas</span>
            </a>
            <a href="/finance" className="flex items-center gap-3 p-3 bg-g80 rounded hover:bg-g75 transition-colors">
              <span className="text-sm text-g20">→ Gestión de facturas</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}