import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number // 0-100
  className?: string
  showLabel?: boolean
  variant?: 'default' | 'green' | 'yellow' | 'red' | 'blue'
}

export function ProgressBar({ value, className, showLabel = false, variant = 'default' }: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value))

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-1.5 bg-g80 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            variant === 'default' && 'bg-g30',
            variant === 'green' && 'bg-green-400',
            variant === 'yellow' && 'bg-yellow-400',
            variant === 'red' && 'bg-red-400',
            variant === 'blue' && 'bg-blue-400'
          )}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-mono text-g40 w-8 text-right">{clampedValue}%</span>
      )}
    </div>
  )
}
