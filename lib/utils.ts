import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: 'USD' | 'BOB' = 'USD'): string {
  if (currency === 'BOB') {
    return `Bs. ${amount.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (!Number.isFinite(amount)) return '—'
  // USD — no decimals for whole / large values
  if (Math.abs(amount) >= 1000 || Number.isInteger(amount)) {
    if (amount < 0) return `-$${Math.round(-amount).toLocaleString('en-US')}`
    return `$${Math.round(amount).toLocaleString('en-US')}`
  }
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Compact money: $1.2M, $480k, $950 */
export function formatCompact(amount: number): string {
  if (!Number.isFinite(amount)) return '—'
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1000)}k`
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`
  return `${sign}$${Math.round(abs)}`
}

export function daysBetween(a: Date | string, b: Date | string): number {
  const da = typeof a === 'string' ? new Date(a) : a
  const db = typeof b === 'string' ? new Date(b) : b
  return Math.round((db.getTime() - da.getTime()) / 86_400_000)
}

export function formatDate(date: Date | string, locale: string = 'es-BO'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatTime(date: Date | string, locale: string = 'es-BO'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function getRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) return `Hace ${diffDays} días`
  if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`
  return formatDate(d)
}

/**
 * Working days (Mon–Fri) elapsed in the current week in La Paz, counting
 * today as a full day (1–5). Used to judge weekly utilisation fairly: 8 h
 * logged by Monday evening is on pace, not "20% utilised".
 */
export function workdaysElapsedThisWeek(now: Date = new Date()): number {
  const dow = new Intl.DateTimeFormat('en-US', { timeZone: 'America/La_Paz', weekday: 'short' }).format(now)
  const idx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(dow)
  return Math.min(5, idx + 1)
}

/** Logged hours as a % of the capacity expected so far this week. */
export function weekPace(logged: number, weeklyCapacity: number, now: Date = new Date()): number {
  const expected = (weeklyCapacity * workdaysElapsedThisWeek(now)) / 5
  return expected > 0 ? Math.round((logged / expected) * 100) : 0
}
