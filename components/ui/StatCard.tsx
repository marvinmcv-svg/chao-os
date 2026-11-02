import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

type Tone = 'default' | 'green' | 'yellow' | 'red' | 'blue'

const TONE_TEXT: Record<Tone, string> = {
  default: 'text-white',
  green: 'text-green-400',
  yellow: 'text-yellow-400',
  red: 'text-red-400',
  blue: 'text-blue-400',
}

export function StatCard({
  label,
  value,
  hint,
  hintTone = 'default',
  tone = 'default',
  icon: Icon,
  children,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  hintTone?: Tone
  tone?: Tone
  icon?: LucideIcon
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('bg-g85 border border-g80 rounded-lg p-5 flex flex-col min-w-0', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs font-mono text-g40 uppercase tracking-[0.08em] sm:tracking-[0.14em] leading-tight">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-g50 flex-shrink-0" />}
      </div>
      <p className={cn('font-display text-[2rem] sm:text-[2.5rem] leading-none mt-3 tabular truncate', TONE_TEXT[tone])}>{value}</p>
      {hint && <p className={cn('text-xs mt-2', hintTone === 'default' ? 'text-g40' : TONE_TEXT[hintTone])}>{hint}</p>}
      {children && <div className="mt-auto pt-3">{children}</div>}
    </div>
  )
}
