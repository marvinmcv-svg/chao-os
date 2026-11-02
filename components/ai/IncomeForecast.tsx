'use client'

import { formatCompact, formatCurrency } from '@/lib/utils'

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

export function IncomeForecast({ forecast }: IncomeForecastProps) {
  const tiles = [
    { label: 'Pipeline ponderado', value: forecast.pipelineWeighted, hint: 'Leads abiertos × probabilidad' },
    { label: 'Honorarios comprometidos', value: forecast.committedRevenue, hint: 'Contratos de proyectos activos' },
    { label: 'Cobro esperado trimestre', value: forecast.expectedThisQuarter, hint: 'Facturas que vencen antes del cierre' },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-g80 border border-g80 rounded-lg overflow-hidden">
        {tiles.map((t) => (
          <div key={t.label} className="bg-g85 p-4">
            <p className="text-2xs font-mono text-g40 uppercase tracking-wider">{t.label}</p>
            <p className="font-display text-3xl text-white mt-1 tabular">{formatCompact(t.value)}</p>
            <p className="text-2xs text-g50 mt-1">{t.hint}</p>
          </div>
        ))}
      </div>

      <blockquote className="border-l-2 border-accent/60 pl-4 py-1 text-sm text-g20 leading-relaxed">{forecast.narrative}</blockquote>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-2xs font-mono text-g40 uppercase tracking-wider mb-2">Leads por cerrar este mes</p>
          {forecast.leadsClosingThisMonth.length === 0 ? (
            <p className="text-xs text-g50">Ninguno en negociación avanzada.</p>
          ) : (
            <ul className="divide-y divide-g80 border border-g80 rounded-lg overflow-hidden">
              {forecast.leadsClosingThisMonth.map((l) => (
                <li key={l.name} className="flex items-center justify-between gap-3 px-3 py-2 bg-g85">
                  <div className="min-w-0">
                    <p className="text-sm text-g10 truncate">{l.name}</p>
                    {l.company && <p className="text-2xs text-g40 truncate">{l.company}</p>}
                  </div>
                  <div className="text-right font-mono tabular">
                    <p className="text-sm text-white">{formatCurrency(l.value)}</p>
                    {l.probability != null && <p className="text-2xs text-g40">{l.probability}%</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-2xs font-mono text-g40 uppercase tracking-wider mb-2">Proyectos facturando este mes</p>
          {forecast.projectsInvoicingThisMonth.length === 0 ? (
            <p className="text-xs text-g50">Sin vencimientos de facturas este mes.</p>
          ) : (
            <ul className="divide-y divide-g80 border border-g80 rounded-lg overflow-hidden">
              {forecast.projectsInvoicingThisMonth.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3 px-3 py-2 bg-g85">
                  <div className="min-w-0">
                    <p className="text-sm text-g10 truncate">{p.name}</p>
                    {p.client && <p className="text-2xs text-g40 truncate">{p.client}</p>}
                  </div>
                  <p className="text-sm font-mono text-white tabular">{formatCurrency(p.value)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
