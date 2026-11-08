'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Check, Flag, Palmtree, Plus, Trash2, X } from 'lucide-react'
import { Panel } from '@/components/ui/Card'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'

interface TimeOff {
  id: string
  userId: string
  type: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  startDate: string
  endDate: string
  note: string
  workingDays: number
  canReview: boolean
  canDelete: boolean
  user: { id: string; name: string; avatarInitials: string }
  reviewedBy: { name: string } | null
}
interface Holiday {
  date: string
  name: string
  scope: 'NATIONAL' | 'DEPARTMENTAL' | 'STUDIO'
  observedFrom?: string
  id?: string
}

export const TIME_OFF_TYPE: Record<string, string> = {
  VACATION: 'Vacaciones',
  SICK: 'Enfermedad',
  PERSONAL: 'Personal',
  TRAINING: 'Capacitación',
  OTHER: 'Otro',
}
const STATUS: Record<TimeOff['status'], { label: string; variant: BadgeVariant }> = {
  PENDING: { label: 'Pendiente', variant: 'yellow' },
  APPROVED: { label: 'Aprobada', variant: 'green' },
  REJECTED: { label: 'Rechazada', variant: 'default' },
}
const SCOPE: Record<Holiday['scope'], string> = { NATIONAL: 'Nacional', DEPARTMENTAL: 'Departamental', STUDIO: 'Cierre del estudio' }

const PLANNER_ROLES = ['PRINCIPAL', 'ADMIN', 'ARCHITECT_SENIOR']
const APPROVER_ROLES = ['PRINCIPAL', 'ADMIN']

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date())
}
function fmt(key: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('es-BO', { ...opts, timeZone: 'UTC' })
}
function range(a: string, b: string) {
  return a === b ? fmt(a, { weekday: 'short', day: 'numeric', month: 'short' }) : `${fmt(a)} – ${fmt(b)}`
}

export function AbsencesPanel({ onChanged }: { onChanged?: () => void }) {
  const { data: session } = useSession()
  const role = session?.user?.role ?? ''
  const isApprover = APPROVER_ROLES.includes(role)
  const isPlanner = PLANNER_ROLES.includes(role)

  const [items, setItems] = useState<TimeOff[] | null>(null)
  const [holidays, setHolidays] = useState<Holiday[] | null>(null)
  const [team, setTeam] = useState<{ value: string; label: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [showClosure, setShowClosure] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [t, h] = await Promise.all([
        api<TimeOff[]>('/api/studio/time-off'),
        api<{ holidays: Holiday[] }>(`/api/studio/holidays?from=${today()}`),
      ])
      setItems(t)
      setHolidays(h.holidays)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las ausencias')
      setItems([])
      setHolidays([])
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!isPlanner) return
    api<{ user: { id: string; name: string } }[]>('/api/team')
      .then((rows) => setTeam(rows.map((r) => ({ value: r.user.id, label: r.user.name }))))
      .catch(() => setTeam([]))
  }, [isPlanner])

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      await load()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción')
    }
  }

  const t0 = today()
  const pending = (items ?? []).filter((i) => i.status === 'PENDING')
  const upcoming = (items ?? []).filter((i) => i.status !== 'PENDING' && i.endDate >= t0)
  const past = (items ?? []).filter((i) => i.status !== 'PENDING' && i.endDate < t0)

  const row = (i: TimeOff) => (
    <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
      <Avatar initials={i.user.avatarInitials} size="sm" title={i.user.name} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-g10 truncate">
          {i.user.name} <span className="text-g40">· {TIME_OFF_TYPE[i.type] ?? i.type}</span>
        </p>
        <p className="text-2xs font-mono text-g40">
          {range(i.startDate, i.endDate)} · {i.workingDays} día{i.workingDays !== 1 ? 's' : ''} hábil{i.workingDays !== 1 ? 'es' : ''}
          {i.note && <span className="font-sans"> · {i.note}</span>}
        </p>
      </div>
      <Badge variant={STATUS[i.status].variant} dot>{STATUS[i.status].label}</Badge>
      <div className="flex items-center gap-1">
        {i.canReview && (
          <>
            <Button size="sm" variant="success" onClick={() => act(() => api(`/api/studio/time-off/${i.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'APPROVED' }) }))}>
              <Check className="w-3.5 h-3.5" /> Aprobar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => act(() => api(`/api/studio/time-off/${i.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'REJECTED' }) }))}>
              <X className="w-3.5 h-3.5" /> Rechazar
            </Button>
          </>
        )}
        {i.canDelete && (
          <Button size="icon" variant="ghost" aria-label={`Eliminar ausencia de ${i.user.name}`} onClick={() => act(() => api(`/api/studio/time-off/${i.id}`, { method: 'DELETE' }))}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </li>
  )

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onRetry={load} />}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Panel
          title="Ausencias"
          className="xl:col-span-2"
          action={<Button size="sm" onClick={() => setShowNew(true)}><Plus className="w-3.5 h-3.5" /> {isApprover ? 'Registrar ausencia' : 'Solicitar ausencia'}</Button>}
        >
          {!items ? (
            <div className="p-5 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : items.length === 0 ? (
            <EmptyState icon={Palmtree} title="Sin ausencias registradas" description="Las ausencias aprobadas reducen la capacidad en la planificación y en el ritmo semanal." />
          ) : (
            <div className="divide-y divide-g80">
              {pending.length > 0 && (
                <div>
                  <p className="px-5 pt-3 text-2xs font-mono text-yellow-300 uppercase tracking-wider">Por aprobar · {pending.length}</p>
                  <ul className="divide-y divide-g80">{pending.map(row)}</ul>
                </div>
              )}
              {upcoming.length > 0 && (
                <div>
                  <p className="px-5 pt-3 text-2xs font-mono text-g40 uppercase tracking-wider">Próximas y en curso</p>
                  <ul className="divide-y divide-g80">{upcoming.map(row)}</ul>
                </div>
              )}
              {past.length > 0 && (
                <div>
                  <p className="px-5 pt-3 text-2xs font-mono text-g40 uppercase tracking-wider">Últimos 30 días</p>
                  <ul className="divide-y divide-g80 opacity-70">{past.map(row)}</ul>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel
          title="Feriados · próximos 12 meses"
          action={isApprover ? <Button size="sm" variant="secondary" onClick={() => setShowClosure(true)}><Plus className="w-3.5 h-3.5" /> Cierre</Button> : undefined}
        >
          {!holidays ? (
            <div className="p-5 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
          ) : holidays.length === 0 ? (
            <EmptyState icon={Flag} title="Sin feriados en el período" />
          ) : (
            <ul className="divide-y divide-g80">
              {holidays.map((h) => (
                <li key={h.date} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="w-[92px] flex-shrink-0 text-2xs font-mono text-g30 capitalize whitespace-nowrap">{fmt(h.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-g10 truncate">{h.name}</p>
                    <p className={cn('text-2xs', h.scope === 'STUDIO' ? 'text-accent' : 'text-g40')}>
                      {SCOPE[h.scope]}
                      {h.observedFrom && ` · trasladado del domingo ${fmt(h.observedFrom)}`}
                    </p>
                  </div>
                  {h.scope === 'STUDIO' && h.id && isApprover && (
                    <Button size="icon" variant="ghost" aria-label={`Eliminar cierre ${h.name}`} onClick={() => act(() => api(`/api/studio/holidays/${h.id}`, { method: 'DELETE' }))}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {showNew && (
        <NewTimeOffModal
          team={isPlanner ? team : []}
          selfId={session?.user?.id ?? ''}
          autoApproved={isApprover}
          onClose={() => setShowNew(false)}
          onSaved={() => { setShowNew(false); load(); onChanged?.() }}
        />
      )}
      {showClosure && (
        <NewClosureModal onClose={() => setShowClosure(false)} onSaved={() => { setShowClosure(false); load(); onChanged?.() }} />
      )}
    </div>
  )
}

function NewTimeOffModal({
  team,
  selfId,
  autoApproved,
  onClose,
  onSaved,
}: {
  team: { value: string; label: string }[]
  selfId: string
  autoApproved: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const t = today()
  const [form, setForm] = useState({ userId: selfId, type: 'VACATION', startDate: t, endDate: t, note: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.endDate < form.startDate) return setError('La fecha final debe ser igual o posterior a la inicial')
    setBusy(true)
    setError(null)
    try {
      await api('/api/studio/time-off', {
        method: 'POST',
        body: JSON.stringify({ ...form, userId: form.userId || undefined }),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={autoApproved ? 'Registrar ausencia' : 'Solicitar ausencia'}
      description={autoApproved ? 'Se registra como aprobada y reduce la capacidad de inmediato.' : 'Dirección recibirá la solicitud para aprobarla.'}
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        {team.length > 0 && (
          <Select label="Persona" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} options={team} />
        )}
        <Select
          label="Tipo"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          options={Object.entries(TIME_OFF_TYPE).map(([value, label]) => ({ value, label }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Desde" type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })} />
          <Input label="Hasta (inclusive)" type="date" required min={form.startDate} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        </div>
        <Textarea label="Nota (opcional)" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}>{autoApproved ? 'Registrar' : 'Enviar solicitud'}</Button>
        </div>
      </form>
    </Modal>
  )
}

function NewClosureModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ date: today(), name: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api('/api/studio/holidays', { method: 'POST', body: JSON.stringify(form) })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Cierre del estudio" description="Un día no laborable para todo el equipo (p. ej. 24 de diciembre).">
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <Input label="Fecha" type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <Input label="Motivo" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nochebuena" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={busy}>Agregar</Button>
        </div>
      </form>
    </Modal>
  )
}
