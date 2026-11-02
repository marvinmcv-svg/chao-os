'use client'

import { useEffect, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Skeleton, EmptyState } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { Grid3x3 } from 'lucide-react'

interface Workload {
  weeks: { start: string; isCurrent: boolean; isFuture: boolean }[]
  members: {
    userId: string
    name: string
    avatarInitials: string
    role: string
    capacity: number
    cells: { logged: number; planned: number; pct: number }[]
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
              <th key={w.start} className={cn('pb-2 text-2xs font-mono font-normal min-w-[58px]', w.isCurrent ? 'text-accent' : w.isFuture ? 'text-g50' : 'text-g40')}>
                {w.isCurrent ? 'Esta sem.' : new Date(w.start).toLocaleDateString('es-BO', { day: 'numeric', month: 'short' })}
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
                return (
                  <td
                    key={i}
                    title={`${m.name} · semana del ${new Date(w.start).toLocaleDateString('es-BO')}\n${w.isFuture ? 'Planificado' : 'Registrado'}: ${hours} h de ${m.capacity} h (${c.pct}%)${w.isCurrent ? `\nRegistrado ${c.logged} h · tareas pendientes ${c.planned} h` : ''}`}
                    className={cn('h-10 rounded text-center align-middle border', w.isCurrent ? 'border-accent/40' : 'border-g80')}
                    style={cellStyle(c.pct, w.isFuture)}
                  >
                    <span className={cn('text-2xs font-mono tabular', c.pct > 100 ? 'text-red-200' : c.pct >= 60 ? 'text-white' : c.pct > 0 ? 'text-g20' : 'text-g60')}>
                      {c.pct > 0 ? `${c.pct}%` : '·'}
                    </span>
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
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={cellStyle(60, true)} />Planificado (tareas abiertas)</span>
      </div>
    </div>
  )
}
