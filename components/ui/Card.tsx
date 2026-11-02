import { cn } from '@/lib/utils'

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className, onClick }: CardProps) {
  const interactive = !!onClick
  return (
    <div
      onClick={onClick}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } } : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={cn(
        'bg-g85 border border-g80 rounded-lg',
        interactive && 'cursor-pointer transition-colors hover:border-g70 hover:bg-[#1c1c1b]',
        className
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-5 py-3.5 border-b border-g80', className)}>{children}</div>
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('p-5', className)}>{children}</div>
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-5 py-3 border-t border-g80', className)}>{children}</div>
}

/** Card with a mono uppercase title row and optional action on the right. */
export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('bg-g85 border border-g80 rounded-lg flex flex-col min-w-0', className)}>
      <header className="flex items-center justify-between gap-3 px-5 h-12 border-b border-g80 flex-shrink-0">
        <h2 className="font-mono text-2xs text-g40 uppercase tracking-[0.14em] truncate">{title}</h2>
        {action}
      </header>
      <div className={cn('flex-1 min-h-0', bodyClassName)}>{children}</div>
    </section>
  )
}
