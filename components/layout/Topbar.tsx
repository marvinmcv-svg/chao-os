'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, Menu, Search, LogOut, Settings } from 'lucide-react'
import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { NotificationBell } from '@/components/layout/NotificationBell'
import { Avatar } from '@/components/ui/Avatar'
import { useUI } from '@/lib/stores/ui'
import { USER_ROLE } from '@/lib/labels'

function SantaCruzClock() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')

  useEffect(() => {
    const t = new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false })
    const d = new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', weekday: 'short', day: 'numeric', month: 'short' })
    const update = () => {
      const now = new Date()
      setTime(t.format(now))
      setDate(d.format(now))
    }
    update()
    const interval = setInterval(update, 15_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="hidden md:flex items-center gap-2 text-xs font-mono text-g40 tabular">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400" aria-hidden />
      <span>SCZ</span>
      <span className="text-g10">{time || '--:--'}</span>
      <span className="text-g50 capitalize">{date}</span>
    </div>
  )
}

export function Topbar() {
  const { data: session } = useSession()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const { setMobileNav, setPalette } = useUI()
  const user = session?.user
  const [isMac, setIsMac] = useState(true)

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.platform))
  }, [])

  return (
    <header className="fixed top-0 left-0 lg:left-[240px] right-0 h-14 bg-g95/80 backdrop-blur-md border-b border-g80 flex items-center justify-between gap-3 px-4 sm:px-6 z-30">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button className="lg:hidden p-2 -ml-2 text-g30 hover:text-white" onClick={() => setMobileNav(true)} aria-label="Abrir menú">
          <Menu className="w-5 h-5" />
        </button>
        <button
          onClick={() => setPalette(true)}
          className="flex items-center gap-2 h-9 w-full max-w-sm px-3 rounded-md bg-g90 border border-g80 text-g50 text-sm hover:border-g70 hover:text-g30 transition-colors"
        >
          <Search className="w-4 h-4 flex-shrink-0" />
          <span className="truncate">Buscar proyectos, leads, facturas…</span>
          <kbd className="ml-auto hidden sm:inline text-[10px] font-mono text-g40 border border-g70 rounded px-1.5 py-0.5">
            {isMac ? '⌘' : 'Ctrl'} K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <SantaCruzClock />
        <NotificationBell />

        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1 rounded-md hover:bg-g80 transition-colors"
            aria-haspopup="menu"
            aria-expanded={showUserMenu}
          >
            <Avatar initials={user?.avatarInitials || '··'} size="md" />
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-g10 leading-none">{user?.name || 'Usuario'}</p>
              <p className="text-2xs text-g40 mt-1">{(user?.role && USER_ROLE[user.role]) || 'Equipo'}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-g40 hidden sm:block" />
          </button>

          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div role="menu" className="absolute right-0 top-full mt-2 w-56 bg-g90 border border-g70 rounded-lg shadow-panel z-50 animate-pop-in overflow-hidden">
                <div className="p-3 border-b border-g80">
                  <p className="text-sm font-medium text-white">{user?.name}</p>
                  <p className="text-xs text-g40 truncate">{user?.email}</p>
                </div>
                <div className="p-1">
                  <Link
                    href="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-g30 hover:bg-g80 hover:text-white rounded transition-colors"
                  >
                    <Settings className="w-4 h-4" /> Configuración
                  </Link>
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-g30 hover:bg-g80 hover:text-red-300 rounded transition-colors"
                  >
                    <LogOut className="w-4 h-4" /> Cerrar sesión
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
