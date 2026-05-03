'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { formatCurrency } from '@/lib/utils'

interface IncomeForecastProps {
  forecast: {
    pipelineWeighted: number
    committedRevenue: number
    expectedThisQuarter: number
    narrative: string
    leadsClosingThisMonth: { name: string; value: number; company?: string; probability?: number; assignedTo?: string }[]
    projectsInvoicingThisMonth: { name: string; value: number; client?: string }[]
  }
}

const CHART_COLORS = {
  pipeline: '#4ade80',
  committed: '#60a5fa',
  expected: '#fbbf24',
  grid: '#222222',
  text: '#888888',
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-g85 border border-g80 rounded-md p-3 shadow-xl">
      <p className="text-xs font-mono text-g40 mb-2">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.fill }} />
          <span className="text-g30">{entry.name}:</span>
          <span className="font-mono text-white">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function IncomeForecast({ forecast }: IncomeForecastProps) {
  const chartData = [
    { name: 'Pipeline\nPonderado', value: forecast.pipelineWeighted },
    { name: 'Revenue\nComprometido', value: forecast.committedRevenue },
    { name: 'Esperado\nEste Trimestre', value: forecast.expectedThisQuarter },
  ]

  const maxValue = Math.max(forecast.pipelineWeighted, forecast.committedRevenue, forecast.expectedThisQuarter, 1)

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-g85 border border-g80 rounded-md p-3 text-center">
          <p className="text-xs font-mono text-g40 uppercase tracking-wider">Pipeline Ponderado</p>
          <p className="font-display text-xl text-green-400 mt-1">
            {formatCurrency(forecast.pipelineWeighted)}
          </p>
        </div>
        <div className="bg-g85 border border-g80 rounded-md p-3 text-center">
          <p className="text-xs font-mono text-g40 uppercase tracking-wider">Revenue Comprometido</p>
          <p className="font-display text-xl text-blue-400 mt-1">
            {formatCurrency(forecast.committedRevenue)}
          </p>
        </div>
        <div className="bg-g85 border border-g80 rounded-md p-3 text-center">
          <p className="text-xs font-mono text-g40 uppercase tracking-wider">Esperado Trimestre</p>
          <p className="font-display text-xl text-yellow-400 mt-1">
            {formatCurrency(forecast.expectedThisQuarter)}
          </p>
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-g85 border border-g80 rounded-md p-4">
        <h4 className="font-mono text-xs text-g40 uppercase tracking-wider mb-3">Comparación de Forecast</h4>
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              barCategoryGap="20%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: CHART_COLORS.text, fontSize: 10, fontFamily: 'DM Mono' }}
                axisLine={{ stroke: CHART_COLORS.grid }}
              />
              <YAxis
                tickFormatter={v => formatCurrency(v)}
                tick={{ fill: CHART_COLORS.text, fontSize: 10, fontFamily: 'DM Mono' }}
                axisLine={{ stroke: CHART_COLORS.grid }}
                width={70}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Valor" fill={CHART_COLORS.pipeline} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Leads closing this month */}
        <div className="bg-g85 border border-g80 rounded-md p-3">
          <h4 className="font-mono text-xs text-g40 uppercase tracking-wider mb-2">Leads Cerrando Este Mes</h4>
          {forecast.leadsClosingThisMonth.length === 0 ? (
            <p className="text-xs text-g40 italic">Sin leads cerrando este mes</p>
          ) : (
            <ul className="space-y-1.5">
              {forecast.leadsClosingThisMonth.map((lead, i) => (
                <li key={i} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-xs text-g10 truncate">{lead.name}</p>
                    {lead.company && <p className="text-xs text-g40">{lead.company}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {lead.probability && (
                      <span className="text-xs font-mono text-blue-400">{lead.probability}%</span>
                    )}
                    <span className="text-xs font-mono text-green-400">{formatCurrency(lead.value)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Projects invoicing this month */}
        <div className="bg-g85 border border-g80 rounded-md p-3">
          <h4 className="font-mono text-xs text-g40 uppercase tracking-wider mb-2">Proyectos Facturando Este Mes</h4>
          {forecast.projectsInvoicingThisMonth.length === 0 ? (
            <p className="text-xs text-g40 italic">Sin proyectos facturando este mes</p>
          ) : (
            <ul className="space-y-1.5">
              {forecast.projectsInvoicingThisMonth.map((proj, i) => (
                <li key={i} className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-xs text-g10 truncate">{proj.name}</p>
                    {proj.client && <p className="text-xs text-g40">{proj.client}</p>}
                  </div>
                  <span className="text-xs font-mono text-blue-400 flex-shrink-0">
                    {formatCurrency(proj.value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Narrative */}
      {forecast.narrative && (
        <div className="bg-g85 border border-g80 rounded-md p-3">
          <h4 className="font-mono text-xs text-g40 uppercase tracking-wider mb-2">Análisis del Forecast</h4>
          <p className="text-sm text-g20 leading-relaxed">{forecast.narrative}</p>
        </div>
      )}
    </div>
  )
}