'use client'

import { useEffect, useMemo, useRef } from 'react'
import { cn, formatCompact } from '@/lib/utils'
import { PHASE } from '@/lib/labels'

export interface TimelineProject {
  id: string
  code: string
  name: string
  status: string
  startDate: string
  estimatedEndDate: string
  totalBudgetUSD: number
  totalSpentUSD: number
  overallProgressPercent: number
  client: { company: string }
  phases: { phase: string; budgetUSD: number; spentUSD: number; progressPercent: number; status: string; startDate: string | null; endDate: string | null }[]
}

const DAY = 86_400_000
const ORDER = ['SD', 'DD', 'CD', 'CA']

/** Phase segments: real dates where known, otherwise allocated by fee share. */
function segments(p: TimelineProject) {
  const start = new Date(p.startDate).getTime()
  const end = Math.max(new Date(p.estimatedEndDate).getTime(), start + 30 * DAY)
  const phases = [...p.phases].sort((a, b) => ORDER.indexOf(a.phase) - ORDER.indexOf(b.phase))
  const total = phases.reduce((s, x) => s + x.budgetUSD, 0) || 1
  let cursor = start
  return phases.map((ph, i) => {
    const share = ph.budgetUSD / total
    const s = ph.startDate ? new Date(ph.startDate).getTime() : cursor
    let e = ph.endDate ? new Date(ph.endDate).getTime() : s + share * (end - start)
    if (i === phases.length - 1 && !ph.endDate) e = Math.max(e, end)
    cursor = e
    return { ...ph, s, e }
  })
}

/**
 * Fee timeline in the spirit of Monograph's MoneyGantt: schedule and fee on
 * the same axis. Each bar is a project split into its SD/DD/CD/CA phases;
 * the fill shows progress, the right-hand columns compare earned value
 * (fee × progress) to fee consumed so overruns show up before they hurt.
 */
export function ProjectTimeline({ projects, onSelect }: { projects: TimelineProject[]; onSelect: (id: string) => void }) {
  const { min, max, months } = useMemo(() => {
    const now = Date.now()
    const starts = projects.map((p) => new Date(p.startDate).getTime())
    const ends = projects.map((p) => new Date(p.estimatedEndDate).getTime())
    const lo = new Date(Math.min(now - 60 * DAY, ...starts))
    const hi = new Date(Math.max(now + 120 * DAY, ...ends))
    const min = new Date(lo.getFullYear(), lo.getMonth(), 1).getTime()
    const max = new Date(hi.getFullYear(), hi.getMonth() + 1, 1).getTime()
    const months: { t: number; label: string; year: boolean }[] = []
    const d = new Date(min)
    while (d.getTime() < max) {
      months.push({ t: d.getTime(), label: d.toLocaleDateString('es-BO', { month: 'short' }).replace('.', ''), year: d.getMonth() === 0 })
      d.setMonth(d.getMonth() + 1)
    }
    return { min, max, months }
  }, [projects])

  const pct = (t: number) => ((t - min) / (max - min)) * 100
  const todayPct = pct(Date.now())
  const monthWidth = 64
  const trackWidth = Math.max(months.length * monthWidth, 640)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Open centred on "today" instead of the oldest project start
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = Math.max(0, (todayPct / 100) * trackWidth - el.clientWidth * 0.6)
  }, [todayPct, trackWidth])

  return (
    <div className="bg-g85 border border-g80 rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3 border-b border-g80 text-2xs font-mono text-g40">
        {ORDER.map((ph, i) => (
          <span key={ph} className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm" style={{ background: `rgba(214,199,161,${0.25 + i * 0.18})` }} />
            {PHASE[ph].short} · {PHASE[ph].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5"><span className="w-px h-3 bg-red-400" />Hoy</span>
        <span className="ml-auto hidden md:inline">VG = valor ganado (honorario × avance) · IDC = VG / gastado</span>
      </div>

      <div className="flex">
        {/* Left labels */}
        <div className="w-56 flex-shrink-0 border-r border-g80 bg-g85 z-10">
          <div className="h-9 border-b border-g80 px-4 flex items-center text-2xs font-mono text-g40 uppercase tracking-wider">Proyecto</div>
          {projects.map((p) => (
            <button key={p.id} onClick={() => onSelect(p.id)} className="w-full h-14 px-4 flex flex-col justify-center text-left border-b border-g80 hover:bg-g80/50 transition-colors">
              <span className="text-2xs font-mono text-g40">{p.code}</span>
              <span className="text-sm text-g10 truncate w-full">{p.name}</span>
            </button>
          ))}
        </div>

        {/* Scrollable track */}
        <div ref={scrollRef} className="flex-1 overflow-x-auto">
          <div style={{ width: trackWidth }} className="relative">
            <div className="h-9 border-b border-g80 relative">
              {months.map((m) => (
                <div key={m.t} className="absolute top-0 h-full flex items-center pl-2 text-2xs font-mono text-g40 border-l border-g80" style={{ left: `${pct(m.t)}%` }}>
                  {m.year ? <span className="text-g20">{new Date(m.t).getFullYear()}</span> : m.label}
                </div>
              ))}
            </div>
            {/* grid + today */}
            <div className="absolute inset-x-0 top-9 bottom-0 pointer-events-none">
              {months.map((m) => (
                <div key={m.t} className={cn('absolute top-0 bottom-0 border-l', m.year ? 'border-g70' : 'border-g80/60')} style={{ left: `${pct(m.t)}%` }} />
              ))}
              {todayPct >= 0 && todayPct <= 100 && <div className="absolute top-0 bottom-0 w-px bg-red-400/80" style={{ left: `${todayPct}%` }} />}
            </div>
            {projects.map((p) => (
              <div key={p.id} className="h-14 border-b border-g80 relative">
                {segments(p).map((seg, i) => {
                  const left = pct(seg.s)
                  const width = Math.max(0.6, pct(seg.e) - left)
                  const over = seg.spentUSD > seg.budgetUSD
                  return (
                    <button
                      key={seg.phase}
                      onClick={() => onSelect(p.id)}
                      title={`${PHASE[seg.phase]?.label ?? seg.phase}\nAvance ${seg.progressPercent}% · Gastado ${formatCompact(seg.spentUSD)} de ${formatCompact(seg.budgetUSD)}`}
                      className={cn('absolute top-3.5 h-7 rounded-[4px] overflow-hidden ring-1 ring-inset transition-[filter] hover:brightness-125', over ? 'ring-red-400/70' : 'ring-black/30')}
                      style={{ left: `calc(${left}% + 1px)`, width: `calc(${width}% - 2px)`, background: `rgba(214,199,161,${0.1 + i * 0.05})` }}
                    >
                      <span className="absolute inset-y-0 left-0" style={{ width: `${seg.progressPercent}%`, background: `rgba(214,199,161,${0.25 + i * 0.18})` }} />
                      <span className="relative px-1.5 text-2xs font-mono text-white/90 leading-7 whitespace-nowrap">{PHASE[seg.phase]?.short}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Right: earned value */}
        <div className="w-44 flex-shrink-0 border-l border-g80 hidden md:block">
          <div className="h-9 border-b border-g80 px-4 grid grid-cols-2 items-center text-2xs font-mono text-g40 uppercase tracking-wider">
            <span>VG</span><span className="text-right">IDC</span>
          </div>
          {projects.map((p) => {
            const ev = (p.totalBudgetUSD * p.overallProgressPercent) / 100
            const cpi = p.totalSpentUSD > 0 ? ev / p.totalSpentUSD : null
            return (
              <div key={p.id} className="h-14 px-4 grid grid-cols-2 items-center border-b border-g80 tabular">
                <div>
                  <p className="text-sm font-mono text-g10">{formatCompact(ev)}</p>
                  <p className="text-2xs font-mono text-g50">de {formatCompact(p.totalBudgetUSD)}</p>
                </div>
                <p className={cn('text-right text-sm font-mono', cpi == null ? 'text-g50' : cpi < 0.85 ? 'text-red-400' : cpi < 1 ? 'text-yellow-400' : 'text-green-400')}>
                  {cpi == null ? '—' : cpi.toFixed(2)}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
