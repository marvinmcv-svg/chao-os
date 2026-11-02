import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number // 0-100
  className?: string
  showLabel?: boolean
  variant?: 'default' | 'green' | 'yellow' | 'red' | 'blue'
  /** Optional second marker (e.g. % of budget spent) drawn as a tick. */
  marker?: number
  size?: 'sm' | 'md'
}

const FILL = {
  default: 'bg-g20',
  green: 'bg-green-400',
  yellow: 'bg-yellow-400',
  red: 'bg-red-400',
  blue: 'bg-blue-400',
}

export function ProgressBar({ value, className, showLabel = false, variant = 'default', marker, size = 'sm' }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className={cn('relative flex-1 bg-g80 rounded-full overflow-hidden', size === 'sm' ? 'h-1.5' : 'h-2')}
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-500', FILL[variant])} style={{ width: `${clamped}%` }} />
        {marker != null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-white/80"
            style={{ left: `calc(${Math.min(100, Math.max(0, marker))}% - 1px)` }}
          />
        )}
      </div>
      {showLabel && <span className="text-2xs font-mono text-g40 w-9 text-right tabular">{Math.round(clamped)}%</span>}
    </div>
  )
}
