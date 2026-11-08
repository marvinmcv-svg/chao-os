'use client'

import { type ReactNode } from 'react'
import { useEscapeToClose } from './overlay-stack'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DrawerProps {
  open: boolean
  onClose: () => void
  eyebrow?: ReactNode
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  width?: 'md' | 'lg'
}

/** Right-hand slide-over used for detail views (projects, invoices, time). */
export function Drawer({ open, onClose, eyebrow, title, actions, children, width = 'md' }: DrawerProps) {
  useEscapeToClose(open, onClose)

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[55] animate-fade-in" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        className={cn(
          'fixed right-0 top-0 h-[100dvh] w-full bg-g90 border-l border-g70 z-[56] overflow-y-auto shadow-panel animate-slide-in-right',
          width === 'md' ? 'sm:w-[480px]' : 'sm:w-[560px]'
        )}
      >
        <div className="sticky top-0 z-10 bg-g90/95 backdrop-blur border-b border-g80 px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && <div className="text-2xs font-mono text-g40 uppercase tracking-wider">{eyebrow}</div>}
            {title && <h2 className="font-display text-2xl text-white mt-0.5 leading-tight">{title}</h2>}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {actions}
            <button onClick={onClose} aria-label="Cerrar" className="p-2 text-g40 hover:text-white hover:bg-g80 rounded-md transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        {children}
      </aside>
    </>
  )
}
