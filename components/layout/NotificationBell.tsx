'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, CheckCheck, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { getRelativeTime } from '@/lib/utils'

type NotificationType =
  | 'INVOICE_SENT'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_OVERDUE'
  | 'LEAD_CONVERTED'
  | 'PROJECT_COMPLETED'
  | 'MILESTONE_APPROVED'
  | 'DOCUMENT_UPLOADED'
  | 'BUDGET_WARNING'
  | 'SYSTEM_ALERT'
  | 'BUDGET_ALERT'
  | 'CAPACITY_ALERT'
  | 'OVERDUE_INVOICE'
  | 'DEADLINE_APPROACHING'
  | 'PROJECT_STATUS_CHANGE'

interface Notification {
  id: string
  type: NotificationType
  title: string
  message: string
  linkUrl: string | null
  read: boolean
  createdAt: string
}

function getTypeColor(type: NotificationType): string {
  switch (type) {
    case 'PAYMENT_RECEIVED':
    case 'LEAD_CONVERTED':
    case 'PROJECT_COMPLETED':
      return 'border-l-green-500'
    case 'PAYMENT_OVERDUE':
    case 'SYSTEM_ALERT':
    case 'OVERDUE_INVOICE':
      return 'border-l-red-500'
    case 'BUDGET_WARNING':
    case 'CAPACITY_ALERT':
    case 'DEADLINE_APPROACHING':
      return 'border-l-yellow-500'
    case 'INVOICE_SENT':
    case 'MILESTONE_APPROVED':
    case 'DOCUMENT_UPLOADED':
    case 'PROJECT_STATUS_CHANGE':
    default:
      return 'border-l-blue-500'
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Fetch notifications
  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications?limit=10&read=all')
      const json = await res.json()
      if (json.success) {
        setNotifications(json.data.notifications)
        setUnreadCount(json.data.unreadCount)
      }
    } catch (e) {
      console.error('[NotificationBell] fetch error', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) fetchNotifications()
  }, [open])

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleNotificationClick = async (n: Notification) => {
    // Mark as read if unread
    if (!n.read) {
      try {
        await fetch(`/api/notifications/${n.id}/read`, { method: 'PATCH' })
        setNotifications(prev =>
          prev.map(notif => (notif.id === n.id ? { ...notif, read: true } : notif))
        )
        setUnreadCount(prev => Math.max(0, prev - 1))
      } catch (e) {
        console.error('[NotificationBell] mark read error', e)
      }
    }
    if (n.linkUrl) router.push(n.linkUrl)
    setOpen(false)
  }

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'PATCH' })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (e) {
      console.error('[NotificationBell] mark all read error', e)
    }
  }

  const badgeLabel = unreadCount > 9 ? '9+' : unreadCount

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative p-2 text-g30 hover:text-white transition-colors"
        aria-label="Notificaciones"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {badgeLabel}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-g85 border border-g70 rounded-lg shadow-xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-g70">
            <span className="text-sm font-semibold text-white">Notificaciones</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-g30 hover:text-white hover:bg-g80 rounded transition-colors"
                  title="Marcar todas como leídas"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Todas leídas</span>
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-g30 hover:text-white hover:bg-g80 rounded transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-g40 text-sm">Cargando...</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-g40 text-sm">No tienes notificaciones</div>
            ) : (
              <div className="divide-y divide-g70">
                {notifications.map(n => (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={cn(
                      'p-3 border-l-2 cursor-pointer hover:bg-g90 transition-colors',
                      getTypeColor(n.type),
                      !n.read ? 'bg-g80' : 'opacity-60'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className={cn('text-sm font-medium truncate', !n.read ? 'text-white' : 'text-g30')}>
                          {n.title}
                        </p>
                        <p className="text-xs text-g40 mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-xs text-g50 mt-1">{getRelativeTime(n.createdAt)}</p>
                      </div>
                      {!n.read && (
                        <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}