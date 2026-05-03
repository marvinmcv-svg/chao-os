import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'green' | 'yellow' | 'red' | 'blue'

interface BadgeProps {
  children: React.ReactNode
  variant?: BadgeVariant
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-xs font-mono font-medium rounded',
        variant === 'default' && 'bg-g80 text-g30',
        variant === 'green' && 'status-green',
        variant === 'yellow' && 'status-yellow',
        variant === 'red' && 'status-red',
        variant === 'blue' && 'status-blue',
        className
      )}
    >
      {children}
    </span>
  )
}
