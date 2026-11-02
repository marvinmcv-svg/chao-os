'use client'

import { cn } from '@/lib/utils'

interface TabsProps {
  tabs: { id: string; label: string; count?: number }[]
  activeTab: string
  onTabChange: (id: string) => void
  className?: string
}

export function Tabs({ tabs, activeTab, onTabChange, className }: TabsProps) {
  return (
    <div className={cn('border-b border-g80 overflow-x-auto', className)}>
      <nav className="flex gap-6 min-w-max" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'pb-3 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-2',
              activeTab === tab.id ? 'border-accent text-white' : 'border-transparent text-g40 hover:text-g20'
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span className="text-2xs font-mono text-g40 bg-g80 px-1.5 rounded tabular">{tab.count}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}

/** Compact pill-style segmented control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { id: T; label: React.ReactNode }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cn('inline-flex p-0.5 bg-g90 border border-g80 rounded-md', className)}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'px-3 h-7 text-xs rounded font-medium transition-colors flex items-center gap-1.5',
            value === o.id ? 'bg-g70 text-white shadow-sm' : 'text-g40 hover:text-g20'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
