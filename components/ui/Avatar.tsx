import { cn } from '@/lib/utils'

interface AvatarProps {
  initials: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Avatar({ initials, size = 'md', className }: AvatarProps) {
  return (
    <div
      className={cn(
        'rounded-full bg-g70 flex items-center justify-center flex-shrink-0',
        size === 'sm' && 'w-6 h-6 text-xs',
        size === 'md' && 'w-8 h-8 text-sm',
        size === 'lg' && 'w-10 h-10 text-base',
        className
      )}
    >
      <span className="font-mono text-g30">{initials}</span>
    </div>
  )
}
