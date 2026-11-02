import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  className,
}: {
  title: string
  subtitle?: React.ReactNode
  eyebrow?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="text-2xs font-mono text-accent uppercase tracking-[0.2em] mb-2">{eyebrow}</p>}
        <h1 className="font-display text-3xl sm:text-4xl text-white leading-none">{title}</h1>
        {subtitle && <p className="text-g40 mt-2 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
