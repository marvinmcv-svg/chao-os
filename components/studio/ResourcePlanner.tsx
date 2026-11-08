'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarRange, ChevronLeft, ChevronRight, GripVertical, Palmtree, Plus, Trash2, Flag } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'
import { PHASE } from '@/lib/labels'
import { cn } from '@/lib/utils'

interface Alloc {
  id: string
  projectId: string
  code: string
  name: string
  phaseId: string | null
  phase: string | null
  hours: number
  note: string
}
interface Cell {
  capacity: number
  holidayDays: number
  timeOffDays: number
  allocated: number
  taskHours: number
  pct: number
  allocations: Alloc[]
}
interface Member {
  userId: string
  name: string
  avatarInitials: string
  role: string
  weeklyHours: number
  cells: Cell[]
}
interface Week {
  start: string
  isCurrent: boolean
  holidays: { date: string; name: string; scope: string }[]
  totals: { capacity: number; allocated: number }
}
interface PlannerProject {
  id: string
  code: string
  name: string
  currentPhase: string
  phases: { id: string; phase: string; label: string; status: string }[]
  teamMembers: string[]
}
interface Planner {
  weeks: Week[]
  members: Member[]
  projects: PlannerProject[]
  canEdit: boolean
}

const WEEKS = 8
const DAY = 86_400_000

function addDaysKey(key: string, n: number) {
  return new Date(new Date(`${key}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10)
}
function weekLabel(key: string) {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
function loadTone(pct: number) {
  return pct > 100 ? 'bg-red-400' : pct >= 90 ? 'bg-yellow-400' : 'bg-[#3987e5]'
}

export function ResourcePlanner({ refreshKey = 0, onChanged }: { refreshKey?: number; onChanged?: () => void }) {
  const [data, setData] = useState<Planner | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ userId: string; week: number; focusId?: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const q = new URLSearchParams({ weeks: String(WEEKS) })
      if (from) q.set('from', from)
      setData(await api<Planner>(`/api/studio/planner?${q}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la planificación')
    }
  }, [from])

  useEffect(() => { load() }, [load, refreshKey])

  const changed = useCallback(async (msg?: string) => {
    await load()
    onChanged?.()
    if (msg) {
      setNotice(msg)
      setTimeout(() => setNotice(null), 3500)
    }
  }, [load, onChanged])

  const findAlloc = (id: string) => {
    for (const m of data?.members ?? []) {
      for (let wi = 0; wi < m.cells.length; wi++) {
        const a = m.cells[wi].allocations.find((x) => x.id === id)
        if (a) return { member: m, week: wi, alloc: a }
      }
    }
    return null
  }

  const moveTo = async (allocId: string, userId: string, weekIdx: number) => {
    if (!data) return
    const src = findAlloc(allocId)
    if (!src || (src.member.userId === userId && src.week === weekIdx)) return
    const target = data.members.find((m) => m.userId === userId)
    try {
      const res = await api<{ merged: boolean }>(`/api/studio/allocations/${allocId}`, {
        method: 'PATCH',
        body: JSON.stringify({ userId, weekStart: data.weeks[weekIdx].start }),
      })
      await changed(
        `${src.alloc.code} · ${src.alloc.hours} h → ${target?.name ?? ''}, sem. ${weekLabel(data.weeks[weekIdx].start)}${res.merged ? ' (sumado a la asignación existente)' : ''}`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo mover la asignación')
    }
  }

  if (!data && !error) return <Skeleton className="h-80 rounded-lg" />

  const shift = (weeks: number) => {
    const base = from ?? data?.weeks[0]?.start
    if (base) setFrom(addDaysKey(base, weeks * 7))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Semanas anteriores" onClick={() => shift(-4)}><ChevronLeft className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => setFrom(null)} disabled={!from}>Hoy</Button>
          <Button size="icon" variant="ghost" aria-label="Semanas siguientes" onClick={() => shift(4)}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <p className="text-xs text-g40">
          {data?.canEdit
            ? 'Arrastra una asignación a otra persona o semana para reasignarla. Haz clic en una celda para editar.'
            : 'Vista de solo lectura. Dirección y arquitectos senior pueden editar.'}
        </p>
      </div>

      {error && <div className="px-4"><ErrorBanner message={error} onRetry={load} /></div>}
      {notice && (
        <div role="status" className="mx-4 text-xs text-g10 bg-g80 border border-g70 rounded-md px-3 py-2">{notice}</div>
      )}

      {data && data.members.length === 0 && <EmptyState icon={CalendarRange} title="Sin miembros del equipo" />}

      {data && data.members.length > 0 && (
        <div className="overflow-x-auto pb-2">
          <table className="w-full border-separate" style={{ borderSpacing: 4 }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-g85 text-left px-3 pb-1 text-2xs font-mono text-g40 uppercase tracking-wider font-normal min-w-[168px]">Persona</th>
                {data.weeks.map((w) => {
                  const pct = w.totals.capacity > 0 ? Math.round((w.totals.allocated / w.totals.capacity) * 100) : 0
                  return (
                    <th key={w.start} className="pb-1 font-normal min-w-[132px] align-bottom">
                      <div className={cn('text-2xs font-mono', w.isCurrent ? 'text-accent' : 'text-g40')}>
                        {w.isCurrent ? 'Esta sem.' : weekLabel(w.start)}
                      </div>
                      {w.holidays.length > 0 && (
                        <div
                          className="mt-0.5 inline-flex items-center gap-1 text-2xs text-yellow-300"
                          title={w.holidays.map((h) => `${new Date(`${h.date}T12:00:00Z`).toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })} · ${h.name}`).join('\n')}
                        >
                          <Flag className="w-3 h-3" aria-hidden />
                          {w.holidays.length === 1 ? w.holidays[0].name : `${w.holidays.length} feriados`}
                        </div>
                      )}
                      <div className="mt-0.5 text-2xs font-mono text-g50 tabular" title="Horas asignadas / capacidad del equipo">
                        {Math.round(w.totals.allocated)}/{Math.round(w.totals.capacity)} h · {pct}%
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.userId}>
                  <td className="sticky left-0 z-10 bg-g85 px-3 py-1 align-top">
                    <div className="flex items-center gap-2 min-w-0 pt-1">
                      <Avatar initials={m.avatarInitials} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm text-g10 truncate">{m.name}</p>
                        <p className="text-2xs text-g40 truncate">{m.weeklyHours} h/sem</p>
                      </div>
                    </div>
                  </td>
                  {m.cells.map((c, wi) => {
                    const key = `${m.userId}:${wi}`
                    const isTarget = dropTarget === key && dragId !== null
                    const fullyOut = c.capacity === 0
                    const free = Math.max(0, c.capacity - c.allocated)
                    return (
                      <td
                        key={wi}
                        className={cn(
                          'align-top rounded-md border p-1.5 h-[92px] transition-colors cursor-pointer',
                          data.weeks[wi].isCurrent ? 'border-accent/40' : 'border-g80',
                          fullyOut ? 'bg-g90' : 'bg-g85 hover:bg-g80/60',
                          isTarget && 'border-accent bg-accent/10',
                        )}
                        onClick={() => setSelected({ userId: m.userId, week: wi })}
                        onDragOver={data.canEdit ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(key) } : undefined}
                        onDragLeave={() => setDropTarget((t) => (t === key ? null : t))}
                        onDrop={data.canEdit ? (e) => {
                          e.preventDefault()
                          const id = e.dataTransfer.getData('text/plain')
                          setDropTarget(null)
                          setDragId(null)
                          if (id) moveTo(id, m.userId, wi)
                        } : undefined}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className={cn('text-2xs font-mono tabular', c.pct > 100 ? 'text-red-300' : c.allocated > 0 ? 'text-g10' : 'text-g50')}>
                            {fullyOut ? 'Ausente' : `${c.allocated}/${c.capacity} h`}
                          </span>
                          <span className="flex items-center gap-1">
                            {c.holidayDays > 0 && <Flag className="w-3 h-3 text-yellow-300" aria-label={`${c.holidayDays} día(s) feriado`} />}
                            {c.timeOffDays > 0 && <Palmtree className="w-3 h-3 text-g20" aria-label={`${c.timeOffDays} día(s) de ausencia`} />}
                          </span>
                        </div>
                        {!fullyOut && (
                          <div className="h-1 rounded-full bg-g80 mt-1 overflow-hidden" aria-hidden>
                            <div className={cn('h-full rounded-full', loadTone(c.pct))} style={{ width: `${Math.min(100, c.pct)}%` }} />
                          </div>
                        )}
                        <div className="mt-1.5 flex flex-col gap-1">
                          {c.allocations.slice(0, 3).map((a) => (
                            <button
                              key={a.id}
                              type="button"
                              draggable={data.canEdit}
                              onDragStart={(e) => {
                                e.stopPropagation()
                                e.dataTransfer.setData('text/plain', a.id)
                                e.dataTransfer.effectAllowed = 'move'
                                setDragId(a.id)
                              }}
                              onDragEnd={() => { setDragId(null); setDropTarget(null) }}
                              onClick={(e) => { e.stopPropagation(); setSelected({ userId: m.userId, week: wi, focusId: a.id }) }}
                              title={`${a.code} · ${a.name}${a.phase ? ` · ${PHASE[a.phase]?.label ?? a.phase}` : ''}\n${a.hours} h${data.canEdit ? '\nArrastra para reasignar' : ''}`}
                              className={cn(
                                'group flex items-center gap-1 w-full rounded px-1.5 h-6 text-left bg-g75 border border-g70 hover:border-g50',
                                data.canEdit && 'cursor-grab active:cursor-grabbing',
                                dragId === a.id && 'opacity-40',
                              )}
                            >
                              {data.canEdit && <GripVertical className="w-3 h-3 text-g50 flex-shrink-0" aria-hidden />}
                              <span className="text-2xs font-mono text-g10 truncate flex-1">{a.code}</span>
                              <span className="text-2xs font-mono text-g30 tabular">{a.hours}</span>
                            </button>
                          ))}
                          {c.allocations.length > 3 && (
                            <span className="text-2xs text-g40 px-1">+{c.allocations.length - 3} más</span>
                          )}
                          {c.allocations.length === 0 && !fullyOut && (
                            <span className="text-2xs text-g50 px-1">{free > 0 ? `${free} h libres` : ''}</span>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-2 px-4 text-2xs font-mono text-g40">
            <span className="flex items-center gap-1.5"><span className="w-4 h-1 rounded-full bg-[#3987e5]" />Asignado</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-1 rounded-full bg-yellow-400" />≥ 90%</span>
            <span className="flex items-center gap-1.5"><span className="w-4 h-1 rounded-full bg-red-400" />Sobreasignado</span>
            <span className="flex items-center gap-1.5"><Flag className="w-3 h-3 text-yellow-300" />Feriado</span>
            <span className="flex items-center gap-1.5"><Palmtree className="w-3 h-3 text-g20" />Ausencia aprobada</span>
          </div>
        </div>
      )}

      {data && selected && (
        <CellEditor
          planner={data}
          userId={selected.userId}
          weekIdx={selected.week}
          focusId={selected.focusId}
          onClose={() => setSelected(null)}
          onChanged={changed}
        />
      )}
    </div>
  )
}

// ─── Cell editor drawer ──────────────────────────────────────────────────────

function CellEditor({
  planner,
  userId,
  weekIdx,
  focusId,
  onClose,
  onChanged,
}: {
  planner: Planner
  userId: string
  weekIdx: number
  focusId?: string
  onClose: () => void
  onChanged: (msg?: string) => Promise<void>
}) {
  const member = planner.members.find((m) => m.userId === userId)
  const week = planner.weeks[weekIdx]
  const cell = member?.cells[weekIdx]
  const canEdit = planner.canEdit

  const memberOptions = planner.members.map((m) => ({ value: m.userId, label: m.name }))
  const weekOptions = planner.weeks.map((w) => ({ value: w.start, label: w.isCurrent ? `Esta semana (${weekLabel(w.start)})` : `Semana del ${weekLabel(w.start)}` }))

  // Projects this person is on come first
  const projectOptions = useMemo(() => {
    const mine = planner.projects.filter((p) => p.teamMembers.includes(userId))
    const rest = planner.projects.filter((p) => !p.teamMembers.includes(userId))
    return [
      { value: '', label: 'Selecciona un proyecto…' },
      ...mine.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
      ...rest.map((p) => ({ value: p.id, label: `${p.code} · ${p.name} (fuera del equipo)` })),
    ]
  }, [planner.projects, userId])

  const [form, setForm] = useState({ projectId: '', phaseId: '', hours: '8', repeatWeeks: '1' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const project = planner.projects.find((p) => p.id === form.projectId)
  useEffect(() => {
    if (!project) return
    const current = project.phases.find((ph) => ph.phase === project.currentPhase)
    setForm((f) => ({ ...f, phaseId: current?.id ?? '' }))
  }, [project])

  if (!member || !cell || !week) return null

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await onChanged(msg)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  const add = () => {
    const hours = Number(form.hours)
    if (!form.projectId) return setError('Elige un proyecto')
    if (!(hours > 0 && hours <= 80)) return setError('Las horas deben estar entre 0 y 80')
    run(
      () => api('/api/studio/allocations', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          projectId: form.projectId,
          phaseId: form.phaseId || null,
          weekStart: week.start,
          hours,
          repeatWeeks: Number(form.repeatWeeks) || 1,
        }),
      }).then(() => setForm({ projectId: '', phaseId: '', hours: '8', repeatWeeks: '1' })),
      `${project?.code ?? ''} · ${hours} h asignadas a ${member.name}`,
    )
  }

  const unallocatedTasks = Math.max(0, cell.taskHours - cell.allocated)

  return (
    <Drawer
      open
      onClose={onClose}
      eyebrow={week.isCurrent ? 'Esta semana' : `Semana del ${weekLabel(week.start)}`}
      title={member.name}
    >
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Capacidad" value={`${cell.capacity} h`} hint={cell.capacity < member.weeklyHours ? `de ${member.weeklyHours} h` : undefined} />
          <Metric label="Asignado" value={`${cell.allocated} h`} tone={cell.pct > 100 ? 'red' : cell.pct >= 90 ? 'yellow' : undefined} hint={`${cell.pct > 900 ? '—' : `${cell.pct}%`}`} />
          <Metric label="Libre" value={`${Math.max(0, Math.round((cell.capacity - cell.allocated) * 10) / 10)} h`} />
        </div>

        {(week.holidays.length > 0 || cell.timeOffDays > 0) && (
          <ul className="text-xs space-y-1">
            {week.holidays.map((h) => (
              <li key={h.date} className="flex items-center gap-2 text-yellow-200">
                <Flag className="w-3.5 h-3.5" />
                {new Date(`${h.date}T12:00:00Z`).toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })} · {h.name}
              </li>
            ))}
            {cell.timeOffDays > 0 && (
              <li className="flex items-center gap-2 text-g20">
                <Palmtree className="w-3.5 h-3.5" /> {cell.timeOffDays} día{cell.timeOffDays !== 1 ? 's' : ''} de ausencia aprobada
              </li>
            )}
          </ul>
        )}

        {unallocatedTasks > 0 && (
          <p className="text-xs text-g30 bg-g80 border border-g70 rounded-md px-3 py-2">
            Tiene {cell.taskHours} h de tareas abiertas con vencimiento esta semana; {unallocatedTasks} h no están cubiertas por asignaciones.
          </p>
        )}

        {error && <ErrorBanner message={error} />}

        <section className="space-y-2">
          <h3 className="font-mono text-2xs text-g40 uppercase tracking-[0.14em]">Asignaciones</h3>
          {cell.allocations.length === 0 ? (
            <p className="text-sm text-g40">Sin asignaciones esta semana.</p>
          ) : (
            cell.allocations.map((a) => (
              <AllocationRow
                key={a.id}
                alloc={a}
                autoFocus={a.id === focusId}
                canEdit={canEdit}
                busy={busy}
                memberOptions={memberOptions}
                weekOptions={weekOptions}
                currentUserId={userId}
                currentWeek={week.start}
                phases={planner.projects.find((p) => p.id === a.projectId)?.phases ?? []}
                onSave={(patch, msg) => run(() => api(`/api/studio/allocations/${a.id}`, { method: 'PATCH', body: JSON.stringify(patch) }), msg)}
                onDelete={() => run(() => api(`/api/studio/allocations/${a.id}`, { method: 'DELETE' }), `${a.code} eliminado de la semana`)}
              />
            ))
          )}
        </section>

        {canEdit && (
          <section className="space-y-3 border-t border-g80 pt-4">
            <h3 className="font-mono text-2xs text-g40 uppercase tracking-[0.14em]">Nueva asignación</h3>
            <Select label="Proyecto" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} options={projectOptions} />
            {project && (
              <Select
                label="Fase"
                value={form.phaseId}
                onChange={(e) => setForm({ ...form, phaseId: e.target.value })}
                options={[{ value: '', label: 'Sin fase específica' }, ...project.phases.map((ph) => ({ value: ph.id, label: `${PHASE[ph.phase]?.short ?? ph.phase} · ${PHASE[ph.phase]?.label ?? ph.label}` }))]}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Input label="Horas por semana" type="number" min={0.5} max={80} step={0.5} value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} />
              <Select
                label="Repetir"
                value={form.repeatWeeks}
                onChange={(e) => setForm({ ...form, repeatWeeks: e.target.value })}
                options={[1, 2, 4, 6, 8, 12].map((n) => ({ value: String(n), label: n === 1 ? 'Solo esta semana' : `${n} semanas` }))}
              />
            </div>
            <Button onClick={add} loading={busy} className="w-full"><Plus className="w-4 h-4" /> Asignar</Button>
          </section>
        )}
      </div>
    </Drawer>
  )
}

function Metric({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'red' | 'yellow' }) {
  return (
    <div className="rounded-md border border-g80 bg-g90 px-3 py-2">
      <p className="text-2xs font-mono text-g40 uppercase tracking-wider">{label}</p>
      <p className={cn('text-lg font-mono tabular', tone === 'red' ? 'text-red-300' : tone === 'yellow' ? 'text-yellow-300' : 'text-white')}>{value}</p>
      {hint && <p className="text-2xs text-g40">{hint}</p>}
    </div>
  )
}

function AllocationRow({
  alloc,
  autoFocus,
  canEdit,
  busy,
  memberOptions,
  weekOptions,
  currentUserId,
  currentWeek,
  phases,
  onSave,
  onDelete,
}: {
  alloc: Alloc
  autoFocus: boolean
  canEdit: boolean
  busy: boolean
  memberOptions: { value: string; label: string }[]
  weekOptions: { value: string; label: string }[]
  currentUserId: string
  currentWeek: string
  phases: PlannerProject['phases']
  onSave: (patch: Record<string, unknown>, msg: string) => void
  onDelete: () => void
}) {
  const [hours, setHours] = useState(String(alloc.hours))
  const [phaseId, setPhaseId] = useState(alloc.phaseId ?? '')
  const [userId, setUserId] = useState(currentUserId)
  const [weekStart, setWeekStart] = useState(currentWeek)

  const dirty = Number(hours) !== alloc.hours || phaseId !== (alloc.phaseId ?? '') || userId !== currentUserId || weekStart !== currentWeek

  const save = () => {
    const patch: Record<string, unknown> = {}
    if (Number(hours) !== alloc.hours) patch.hours = Number(hours)
    if (phaseId !== (alloc.phaseId ?? '')) patch.phaseId = phaseId || null
    if (userId !== currentUserId) patch.userId = userId
    if (weekStart !== currentWeek) patch.weekStart = weekStart
    const who = memberOptions.find((m) => m.value === userId)?.label
    onSave(patch, userId !== currentUserId || weekStart !== currentWeek ? `${alloc.code} reasignado a ${who}` : `${alloc.code} actualizado`)
  }

  return (
    <div className={cn('rounded-md border bg-g90 p-3 space-y-2', autoFocus ? 'border-accent/60' : 'border-g80')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-white truncate"><span className="font-mono text-g30">{alloc.code}</span> · {alloc.name}</p>
          {alloc.phase && <p className="text-2xs text-g40">{PHASE[alloc.phase]?.label ?? alloc.phase}</p>}
        </div>
        {!canEdit && <span className="text-sm font-mono text-g10 tabular">{alloc.hours} h</span>}
      </div>
      {canEdit && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Input id={`al-${alloc.id}-hours`} label="Horas" type="number" min={0} max={80} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} autoFocus={autoFocus} />
            <Select id={`al-${alloc.id}-phase`} label="Fase" value={phaseId} onChange={(e) => setPhaseId(e.target.value)} options={[{ value: '', label: 'Sin fase' }, ...phases.map((ph) => ({ value: ph.id, label: PHASE[ph.phase]?.short ?? ph.phase }))]} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select id={`al-${alloc.id}-person`} label="Persona" value={userId} onChange={(e) => setUserId(e.target.value)} options={memberOptions} />
            <Select id={`al-${alloc.id}-week`} label="Semana" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} options={weekOptions} />
          </div>
          <div className="flex justify-between gap-2">
            <Button size="sm" variant="ghost" onClick={onDelete} disabled={busy} aria-label={`Eliminar ${alloc.code}`}>
              <Trash2 className="w-3.5 h-3.5" /> Quitar
            </Button>
            <Button size="sm" variant="secondary" onClick={save} disabled={!dirty || busy || !(Number(hours) >= 0 && Number(hours) <= 80)}>
              Guardar
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
