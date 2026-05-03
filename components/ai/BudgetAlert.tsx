'use client'

import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'

interface Alert {
  id: string
  type: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  action: string
  projectId?: string
}

interface BudgetAlertProps {
  alert: Alert
  onDismiss?: (id: string) => void
  onNavigate?: (projectId: string) => void
}

const SEVERITY_COLORS = {
  critical: 'border-l-red-500',
  warning: 'border-l-yellow-500',
  info: 'border-l-blue-500',
} as const

const SEVERITY_ICONS = {
  BUDGET_OVERRUN: (
    <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  CAPACITY_OVERLOAD: (
    <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  PAYMENT_OVERDUE: (
    <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  MILESTONE_AT_RISK: (
    <svg className="w-4 h-4 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
} as const

const TYPE_LABELS: Record<string, string> = {
  BUDGET_OVERRUN: 'Sobrepeso de Presupuesto',
  CAPACITY_OVERLOAD: 'Capacidad Sobrecargada',
  PAYMENT_OVERDUE: 'Pago Vencido',
  MILESTONE_AT_RISK: 'Hito en Riesgo',
}

export function BudgetAlert({ alert, onDismiss, onNavigate }: BudgetAlertProps) {
  const router = useRouter()

  const handleNavigate = () => {
    if (alert.projectId && onNavigate) {
      onNavigate(alert.projectId)
    }
  }

  return (
    <div
      className={`relative bg-g85 border border-g80 border-l-4 ${SEVERITY_COLORS[alert.severity]} rounded-r-md p-4 pr-10`}
    >
      {/* Dismiss button */}
      {onDismiss && (
        <button
          onClick={() => onDismiss(alert.id)}
          className="absolute top-3 right-3 text-g40 hover:text-white transition-colors"
          aria-label="Dismiss alert"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className="flex-shrink-0 mt-0.5">
          {SEVERITY_ICONS[alert.type as keyof typeof SEVERITY_ICONS] ?? SEVERITY_ICONS.BUDGET_OVERRUN}
        </div>

        <div className="flex-1 min-w-0">
          {/* Type label + severity badge */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-g40 uppercase tracking-wider">
              {TYPE_LABELS[alert.type] ?? alert.type}
            </span>
            <span
              className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                alert.severity === 'critical'
                  ? 'bg-red-500/20 text-red-400'
                  : alert.severity === 'warning'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              {alert.severity === 'critical' ? 'CRÍTICO' : alert.severity === 'warning' ? 'ALERTA' : 'INFO'}
            </span>
          </div>

          {/* Title */}
          <h4 className="text-sm font-medium text-white mb-1">{alert.title}</h4>

          {/* Description */}
          <p className="text-xs text-g30 mb-2">{alert.description}</p>

          {/* Action */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-g40">Acción:</span>
            <span className="text-xs text-green-400">{alert.action}</span>
          </div>

          {/* Navigate button */}
          {alert.projectId && onNavigate && (
            <button
              onClick={handleNavigate}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2"
            >
              Ver proyecto →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}