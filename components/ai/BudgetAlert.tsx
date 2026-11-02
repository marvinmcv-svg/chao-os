'use client'

import { AlertTriangle, ArrowRight, CalendarClock, Banknote, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Alert {
  id: string
  type: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  action: string
  projectId?: string | null
}

interface BudgetAlertProps {
  alert: Alert
  onDismiss?: (id: string) => void
  onNavigate?: (projectId: string) => void
}

const TYPE = {
  BUDGET_OVERRUN: { label: 'Sobrecosto', icon: AlertTriangle },
  CAPACITY_OVERLOAD: { label: 'Capacidad', icon: Users },
  PAYMENT_OVERDUE: { label: 'Cobranza', icon: Banknote },
  MILESTONE_AT_RISK: { label: 'Hito en riesgo', icon: CalendarClock },
} as const

const SEV = {
  critical: { label: 'Crítico', bar: 'bg-red-400', text: 'text-red-300', badge: 'status-red' },
  warning: { label: 'Atención', bar: 'bg-yellow-400', text: 'text-yellow-300', badge: 'status-yellow' },
  info: { label: 'Info', bar: 'bg-blue-400', text: 'text-blue-300', badge: 'status-blue' },
} as const

export function BudgetAlert({ alert, onDismiss, onNavigate }: BudgetAlertProps) {
  const t = TYPE[alert.type as keyof typeof TYPE] ?? { label: alert.type.replace(/_/g, ' ').toLowerCase(), icon: AlertTriangle }
  const s = SEV[alert.severity] ?? SEV.info
  const Icon = t.icon
  return (
    <div className="relative flex gap-3 rounded-lg border border-g80 bg-g90/60 p-4 pl-5 overflow-hidden">
      <span className={cn('absolute left-0 inset-y-0 w-0.5', s.bar)} />
      <Icon className={cn('w-4 h-4 mt-0.5 flex-shrink-0', s.text)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xs font-mono text-g40 uppercase tracking-wider">{t.label}</span>
          <span className={cn('text-2xs font-mono uppercase px-1.5 rounded', s.badge)}>{s.label}</span>
        </div>
        <p className="text-sm text-white leading-snug">{alert.title}</p>
        <p className="text-xs text-g40 mt-1">{alert.description}</p>
        <p className="text-xs text-g20 mt-2"><span className="text-g40">Acción · </span>{alert.action}</p>
        {alert.projectId && onNavigate && (
          <button onClick={() => onNavigate(alert.projectId!)} className="mt-2 inline-flex items-center gap-1 text-2xs font-mono text-accent hover:underline">
            Abrir proyecto <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
      {onDismiss && (
        <button onClick={() => onDismiss(alert.id)} className="self-start p-1 rounded text-g50 hover:text-white hover:bg-g80" aria-label="Descartar alerta">
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
