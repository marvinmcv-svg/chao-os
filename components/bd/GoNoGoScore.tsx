'use client'

import { ProgressBar } from '@/components/ui/ProgressBar'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

// Two breakdown shapes exist in the data: Claude's 5 dimensions and the
// original spec's (margin, clientHistory, capacity, complexity, competition).
type ScoreBreakdown = Record<string, number>

interface Props {
  overallScore: number | null
  breakdown: ScoreBreakdown | null
  recommendation: 'GO' | 'NO_GO' | 'REVIEW' | null
  compact?: boolean
  loading?: boolean
}

const DIMENSION_LABELS: Record<string, string> = {
  financialScore: 'Financiero',
  technicalScore: 'Técnico',
  commercialScore: 'Comercial',
  legalScore: 'Legal',
  executionScore: 'Ejecución',
  margin: 'Margen',
  clientHistory: 'Historial cliente',
  capacity: 'Capacidad equipo',
  complexity: 'Complejidad',
  competition: 'Competencia',
}

function SkeletonBar() {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-mono text-g40 w-24">—</span>
      <div className="flex-1 h-2 bg-g80 rounded-full animate-pulse" />
      <span className="text-xs font-mono text-g30 w-8">—</span>
    </div>
  )
}

export function GoNoGoScore({ overallScore, breakdown, recommendation, compact = false, loading = false }: Props) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-10 w-16 bg-g80 rounded animate-pulse" />
          <div className="space-y-2">
            <div className="h-5 w-24 bg-g80 rounded animate-pulse" />
            <div className="h-3 w-20 bg-g80 rounded animate-pulse" />
          </div>
        </div>
        <div className="space-y-2.5">
          {(['financialScore', 'technicalScore', 'commercialScore', 'legalScore', 'executionScore'] as const).map((key) => (
            <SkeletonBar key={key} />
          ))}
        </div>
        <div className="h-12 bg-g80 rounded animate-pulse" />
      </div>
    )
  }

  if (overallScore == null) {
    return (
      <div className="text-center py-4 text-g40 text-sm font-mono">
        Sin puntaje AI disponible
      </div>
    )
  }

  const scoreVariant = recommendation === 'GO' ? 'green' : recommendation === 'NO_GO' ? 'red' : 'yellow'

  const dimensions = breakdown
    ? Object.entries(breakdown).filter(([, v]) => typeof v === 'number')
    : []

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant={scoreVariant} className="text-sm font-mono">
          AI {overallScore ?? '—'}
        </Badge>
        {recommendation && (
          <span className={cn(
            'text-xs font-mono',
            recommendation === 'GO' ? 'text-green-400' :
            recommendation === 'NO_GO' ? 'text-red-400' : 'text-yellow-400'
          )}>
            {recommendation === 'GO' ? 'GO' : recommendation === 'NO_GO' ? 'NO-GO' : 'REVISAR'}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="flex items-center gap-4">
        <div className="text-4xl font-display text-white">{overallScore}</div>
        <div>
          <Badge variant={scoreVariant} className="text-sm font-mono">
            {recommendation === 'GO' ? '✔ GO' : recommendation === 'NO_GO' ? '✖ NO-GO' : '⚠ REVISAR'}
          </Badge>
          <p className="text-xs text-g40 mt-1">Puntaje Go / No-Go</p>
        </div>
      </div>

      {/* Breakdown bars */}
      <div className="space-y-2.5">
        {dimensions.map(([key, value]) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-xs font-mono text-g40 w-32 flex-shrink-0">{DIMENSION_LABELS[key] ?? key}</span>
            <ProgressBar
              value={value}
              variant={value >= 70 ? 'green' : value >= 40 ? 'yellow' : 'red'}
              className="flex-1"
            />
            <span className="text-xs font-mono text-g30 w-8 text-right">{value}</span>
          </div>
        ))}
      </div>

      {/* Recommendation text */}
      <div className={cn(
        'p-3 rounded text-sm',
        recommendation === 'GO' ? 'bg-green-950/40 text-green-300 border border-green-900/60' :
        recommendation === 'NO_GO' ? 'bg-red-950/40 text-red-300 border border-red-900/60' :
        'bg-yellow-950/30 text-yellow-300 border border-yellow-900/50'
      )}>
        {recommendation === 'GO' && '✓ Este proyecto es recomendable. Prosigue con la propuesta.'}
        {recommendation === 'NO_GO' && '✖ No se recomienda este proyecto. Revisa los factores de riesgo.'}
        {recommendation === 'REVIEW' && '⚠ Este proyecto requiere revisión adicional antes de decidir.'}
        {!recommendation && 'El análisis AI está en proceso.'}
      </div>
    </div>
  )
}