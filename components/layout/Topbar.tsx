'use client'

import { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { signOut } from 'next-auth/react'
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import { NotificationBell } from '@/components/layout/NotificationBell'

function SantaCruzClock() {
  const [time, setTime] = useState('')

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const formatter = new Intl.DateTimeFormat('es-BO', {
        timeZone: 'America/La_Paz',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
      setTime(formatter.format(now))
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex items-center gap-2 text-sm font-mono text-g30">
      <span>SCZ</span>
      <span className="text-white font-medium">{time || '--:--:--'}</span>
    </div>
  )
}

export function Topbar() {
  const { data: session } = useSession()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const user = session?.user

  return (
    <header className="fixed top-0 left-[240px] right-0 h-14 bg-g90 border-b border-g80 flex items-center justify-between px-6 z-30">
      {/* Left: Clock */}
      <SantaCruzClock />

      {/* Right: Notifications + User */}
      <div className="flex items-center gap-4">
        {/* Notifications bell */}
        <NotificationBell />

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1.5 rounded-md hover:bg-g80 transition-colors"
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-g70 flex items-center justify-center">
              <span className="text-xs font-mono text-g20">
                {user?.avatarInitials || '??'}
              </span>
            </div>
            {/* Name + Role */}
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-g20 leading-none">{user?.name || 'Usuario'}</p>
              <p className="text-xs text-g40 mt-0.5 capitalize">
                {user?.role?.replace('_', ' ') || 'Staff'}
              </p>
            </div>
            <ChevronDown className="w-4 h-4 text-g40 hidden sm:block" />
          </button>

          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 bg-g85 border border-g80 rounded-md shadow-xl z-50">
                <div className="p-3 border-b border-g80">
                  <p className="text-sm font-medium text-white">{user?.name}</p>
                  <p className="text-xs text-g40">{user?.email}</p>
                </div>
                <div className="p-1">
                  <button
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="w-full text-left px-3 py-2 text-sm text-g30 hover:bg-g80 hover:text-red-400 rounded transition-colors"
                  >
                    Cerrar sesión
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
