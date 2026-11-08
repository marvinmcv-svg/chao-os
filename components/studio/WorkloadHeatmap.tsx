'use client'

import { useEffect, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Skeleton, EmptyState } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Grid3x3, Flag, Palmtree } from 'lucide-react'

const day = (key: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString('es-BO', { ...opts, timeZone: 'UTC' })

interface Workload {
  weeks: { start: string; isCurrent: boolean; isFuture: boolean; holidays: string[] }[]
  members: {
    userId: string
    name: string
    avatarInitials: string
    role: string
    capacity: number
    cells: { logged: number; planned: number; capacity: number; holidayDays: number; timeOffDays: number; pct: number }[]
  }[]
}

/** Sequential single-hue ramp (blue) for 0–100 %; over-capacity is a status (red). */
function cellStyle(pct: number, future: boolean): React.CSSProperties {
  if (pct <= 0) return { background: 'transparent' }
  if (pct > 100) return { background: 'rgba(230,103,103,0.28)', boxShadow: 'inset 0 0 0 1px rgba(230,103,103,0.7)' }
  const a = 0.12 + (pct / 100) * 0.6
  return future
    ? { background: `repeating-linear-gradient(135deg, rgba(57,135,229,${a}) 0 4px, rgba(57,135,229,${a * 0.55}) 4px 8px)` }
    : { background: `rgba(57,135,229,${a})` }
}

export function WorkloadHeatmap({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<Workload | null>(null)

  useEffect(() => {
    api<Workload>('/api/studio/workload?past=6&future=4').then(setData).catch(() => setData({ weeks: [], members: [] }))
  }, [refreshKey])

  if (!data) return <Skeleton className="h-72 rounded-lg" />
  if (data.members.length === 0) return <EmptyState icon={Grid3x3} title="Sin miembros del equipo" />

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 3 }}>
        <thead>
          <tr>
            <th className="text-left px-2 pb-2 text-2xs font-mono text-g40 uppercase tracking-wider font-normal min-w-[180px]">Persona</th>
            {data.weeks.map((w) => (
              <th
                key={w.start}
                title={w.holidays.length ? `Feriados: ${w.holidays.join(', ')}` : undefined}
                className={cn('pb-2 text-2xs font-mono font-normal min-w-[58px]', w.isCurrent ? 'text-accent' : w.isFuture ? 'text-g50' : 'text-g40')}
              >
                {w.isCurrent ? 'Esta sem.' : day(w.start, { day: 'numeric', month: 'short' })}
                {w.holidays.length > 0 && <Flag className="inline w-2.5 h-2.5 ml-1 -mt-0.5 text-yellow-300" aria-label="Semana con feriado" />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.members.map((m) => (
            <tr key={m.userId}>
              <td className="px-2 py-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar initials={m.avatarInitials} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm text-g10 truncate">{m.name}</p>
                    <p className="text-2xs text-g40 truncate">{m.capacity} h/sem</p>
                  </div>
                </div>
              </td>
              {m.cells.map((c, i) => {
                const w = data.weeks[i]
                const hours = w.isFuture ? c.planned : w.isCurrent ? Math.max(c.logged, c.planned) : c.logged
                const out = c.capacity === 0
                const reduced = c.holidayDays + c.timeOffDays > 0
                const lines = [
                  `${m.name} · semana del ${day(w.start, { day: 'numeric', month: 'long' })}`,
                  `${w.isFuture ? 'Asignado' : 'Registrado'}: ${hours} h de ${c.capacity} h disponibles${out ? '' : ` (${c.pct}%)`}`,
                  w.isCurrent ? `Registrado ${c.logged} h · asignado ${c.planned} h` : '',
                  c.holidayDays ? `${c.holidayDays} día(s) feriado` : '',
                  c.timeOffDays ? `${c.timeOffDays} día(s) de ausencia` : '',
                ].filter(Boolean)
                return (
                  <td
                    key={i}
                    title={lines.join('\n')}
                    className={cn('relative h-10 rounded text-center align-middle border', w.isCurrent ? 'border-accent/40' : 'border-g80', out && 'bg-g90')}
                    style={out && hours === 0 ? undefined : cellStyle(c.pct, w.isFuture)}
                  >
                    <span className={cn('text-2xs font-mono tabular', c.pct > 100 ? 'text-red-200' : c.pct >= 60 ? 'text-white' : c.pct > 0 ? 'text-g20' : 'text-g60')}>
                      {out && hours === 0 ? <Palmtree className="inline w-3 h-3 text-g40" aria-label="Ausente" /> : c.pct > 100 && out ? `${hours}h` : c.pct > 0 ? `${c.pct}%` : '·'}
                    </span>
                    {reduced && !out && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-yellow-300" aria-hidden />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 px-2 text-2xs font-mono text-g40">
        <span className="flex items-center gap-1.5">
          0%
          <span className="w-20 h-2 rounded" style={{ background: 'linear-gradient(90deg, rgba(57,135,229,0.12), rgba(57,135,229,0.72))' }} />
          100%
        </span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={cellStyle(120, false)} />Sobre capacidad</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={cellStyle(60, true)} />Planificado (asignaciones)</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-300" />Capacidad reducida (feriado o ausencia)</span>
      </div>
    </div>
  )
}
