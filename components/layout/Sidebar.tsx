'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, X } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { useUI } from '@/lib/stores/ui'
import { NAV_GROUPS } from './nav'

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 group">
      {/* Plan-view mark: a square with a door swing */}
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden className="text-accent">
        <rect x="1" y="1" width="20" height="20" stroke="currentColor" strokeWidth="1.5" />
        <path d="M1 21 A 12 12 0 0 1 13 9" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />
        <path d="M13 9 V 21" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span className="font-display text-xl text-white tracking-wide leading-none">CHAO</span>
      <span className="font-mono text-2xs text-g40 border border-g70 rounded px-1 leading-4">OS</span>
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { mobileNavOpen, setMobileNav } = useUI()

  useEffect(() => {
    setMobileNav(false)
  }, [pathname, setMobileNav])

  return (
    <>
      {mobileNavOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden animate-fade-in" onClick={() => setMobileNav(false)} />
      )}
      <aside
        className={cn(
          'fixed left-0 top-0 h-[100dvh] w-[240px] bg-g90 border-r border-g80 flex flex-col z-50 transition-transform duration-200',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="h-14 flex items-center justify-between px-5 border-b border-g80">
          <Logo />
          <button className="lg:hidden p-1.5 text-g40 hover:text-white" onClick={() => setMobileNav(false)} aria-label="Cerrar menú">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="px-5 mb-1.5 text-[10px] font-mono text-g50 uppercase tracking-[0.2em]">{group.label}</p>
              <ul className="space-y-0.5 px-2">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'relative flex items-center gap-3 px-3 h-9 rounded-md text-sm transition-colors',
                          isActive ? 'bg-g80 text-white' : 'text-g30 hover:bg-g80/60 hover:text-g10'
                        )}
                      >
                        {isActive && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" />}
                        <item.icon className={cn('w-4 h-4 flex-shrink-0', isActive ? 'text-accent' : '')} />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-g80 space-y-2">
          <div className="px-3 py-2 rounded-md bg-g85 border border-g80">
            <p className="text-[10px] font-mono text-g50 uppercase tracking-wider">Estudio</p>
            <p className="text-xs text-g20 mt-0.5 truncate">CHAO Arquitectura S.R.L.</p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-3 w-full px-3 h-9 rounded-md text-sm text-g30 hover:bg-g80/60 hover:text-red-300 transition-colors"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            <span>Salir</span>
          </button>
        </div>
      </aside>
    </>
  )
}
