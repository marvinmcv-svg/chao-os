import { cn } from '@/lib/utils'

export type BadgeVariant = 'default' | 'green' | 'yellow' | 'red' | 'blue' | 'outline'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  dot?: boolean
  className?: string
}

const DOT: Record<BadgeVariant, string> = {
  default: 'bg-g40',
  outline: 'bg-g40',
  green: 'bg-green-400',
  yellow: 'bg-yellow-400',
  red: 'bg-red-400',
  blue: 'bg-blue-400',
}

export function Badge({ children, variant = 'default', dot = false, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 text-2xs font-mono font-medium rounded whitespace-nowrap uppercase tracking-wide',
        variant === 'default' && 'bg-g80 text-g30 ring-1 ring-inset ring-g70',
        variant === 'outline' && 'text-g30 ring-1 ring-inset ring-g70',
        variant === 'green' && 'status-green',
        variant === 'yellow' && 'status-yellow',
        variant === 'red' && 'status-red',
        variant === 'blue' && 'status-blue',
        className
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', DOT[variant])} />}
      {children}
    </span>
  )
}
