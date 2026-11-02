import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-12 px-6', className)}>
      {Icon && (
        <div className="w-10 h-10 rounded-full border border-g70 flex items-center justify-center mb-3">
          <Icon className="w-4 h-4 text-g40" />
        </div>
      )}
      <p className="text-sm text-g20">{title}</p>
      {description && <p className="text-xs text-g40 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('bg-g80 rounded animate-pulse', className)} />
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-red-950/40 border border-red-900/60 text-sm text-red-300">
      <span>{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="text-xs font-mono uppercase tracking-wider text-red-200 hover:text-white">
          Reintentar
        </button>
      )}
    </div>
  )
}
