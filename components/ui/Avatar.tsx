import { cn } from '@/lib/utils'

const HUES = ['#d6c7a1', '#9fb8a0', '#a3b4c9', '#c9a3a3', '#b7a3c9', '#c9bea3', '#a3c9c3']

function hueFor(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return HUES[h % HUES.length]
}

interface AvatarProps {
  initials: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  title?: string
}

export function Avatar({ initials, size = 'md', className, title }: AvatarProps) {
  const color = hueFor(initials || '?')
  return (
    <div
      title={title}
      className={cn(
        'rounded-full flex items-center justify-center flex-shrink-0 font-mono font-medium ring-1 ring-inset',
        size === 'xs' && 'w-5 h-5 text-[9px]',
        size === 'sm' && 'w-6 h-6 text-[10px]',
        size === 'md' && 'w-8 h-8 text-xs',
        size === 'lg' && 'w-10 h-10 text-sm',
        className
      )}
      style={{ backgroundColor: `${color}1f`, color, boxShadow: `inset 0 0 0 1px ${color}40` }}
    >
      {initials || '?'}
    </div>
  )
}
