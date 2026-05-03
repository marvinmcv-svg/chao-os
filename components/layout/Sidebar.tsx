'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Briefcase,
  FolderKanban,
  Receipt,
  Users,
  Globe,
  Bot,
  Settings,
  LogOut,
} from 'lucide-react'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/bd', label: 'Business Dev', icon: Briefcase },
  { href: '/projects', label: 'Proyectos', icon: FolderKanban },
  { href: '/finance', label: 'Finanzas', icon: Receipt },
  { href: '/studio', label: 'Estudio', icon: Users },
  { href: '/portal', label: 'Portal Cliente', icon: Globe },
  { href: '/ai', label: 'Asistente IA', icon: Bot },
  { href: '/settings', label: 'Configuración', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-screen w-[240px] bg-g90 border-r border-g80 flex flex-col z-40">
      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-g80">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="font-display text-xl text-white">CHAO</span>
          <span className="font-mono text-xs text-g40">OS</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5 px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-ui transition-colors',
                    isActive
                      ? 'bg-g80 text-white'
                      : 'text-g30 hover:bg-g80/50 hover:text-g20'
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Logout */}
      <div className="p-2 border-t border-g80">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm font-ui text-g30 hover:bg-g80/50 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <span>Salir</span>
        </button>
      </div>
    </aside>
  )
}
