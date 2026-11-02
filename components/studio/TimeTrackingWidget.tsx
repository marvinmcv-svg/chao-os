'use client'

import { useState, useEffect, useRef } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Drawer } from '@/components/ui/Drawer'
import { ErrorBanner } from '@/components/ui/EmptyState'
import { api, asList } from '@/lib/api-client'
import { cn } from '@/lib/utils'

interface Project {
  id: string
  code: string
  name: string
  status: string
  phases: { id: string; phase: string; label: string; status: string }[]
}

interface Props {
  onClose: () => void
  onEntryAdded: () => void
}

const TIMER_KEY = 'chao.timer.v1'

/** Today in La Paz (UTC-4) as yyyy-mm-dd — `toISOString()` is UTC and can be tomorrow. */
function localToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date())
}

type TimerState = { startedAt: number | null; accumulated: number }

function readTimer(): TimerState {
  try {
    const raw = localStorage.getItem(TIMER_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return { startedAt: null, accumulated: 0 }
}

function writeTimer(t: TimerState) {
  try {
    localStorage.setItem(TIMER_KEY, JSON.stringify(t))
  } catch {}
}

export function TimeTrackingWidget({ onClose, onEntryAdded }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [description, setDescription] = useState('')
  const [hours, setHours] = useState('')
  const [date, setDate] = useState(localToday())
  const [projectId, setProjectId] = useState('')
  const [phaseId, setPhaseId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Timer survives closing the drawer / reloading (persisted per browser)
  const [timer, setTimer] = useState<TimerState>({ startedAt: null, accumulated: 0 })
  const [, tick] = useState(0)
  const ref = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setTimer(readTimer())
    api<unknown>('/api/projects?limit=200')
      .then((d) => setProjects(asList<Project>(d, 'projects').filter((p) => p.status !== 'COMPLETED')))
      .catch(() => setError('No se pudieron cargar los proyectos'))
  }, [])

  useEffect(() => {
    if (timer.startedAt) {
      ref.current = setInterval(() => tick((n) => n + 1), 1000)
      return () => { if (ref.current) clearInterval(ref.current) }
    }
  }, [timer.startedAt])

  const seconds = Math.floor(timer.accumulated + (timer.startedAt ? (Date.now() - timer.startedAt) / 1000 : 0))
  const running = !!timer.startedAt
  const usingTimer = running || seconds > 0

  function update(t: TimerState) {
    setTimer(t)
    writeTimer(t)
  }

  const start = () => update({ startedAt: Date.now(), accumulated: timer.accumulated })
  const pause = () => update({ startedAt: null, accumulated: seconds })
  const reset = () => update({ startedAt: null, accumulated: 0 })

  const fmt = (s: number) => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':')

  const project = projects.find((p) => p.id === projectId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    // Round timer to the nearest quarter hour (min 0.25 h)
    const h = usingTimer ? Math.max(0.25, Math.round((seconds / 3600) * 4) / 4) : parseFloat(hours)
    if (!projectId) return setError('Selecciona un proyecto')
    if (!description.trim()) return setError('Describe el trabajo realizado')
    if (!(h > 0) || h > 24) return setError('Las horas deben estar entre 0.25 y 24')

    setSubmitting(true)
    try {
      await api('/api/time-entries', {
        method: 'POST',
        body: JSON.stringify({ projectId, phaseId: phaseId || undefined, description: description.trim(), hours: h, date }),
      })
      reset()
      onEntryAdded()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Drawer open onClose={onClose} eyebrow="Hoja de horas" title="Registrar horas">
      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        {error && <ErrorBanner message={error} />}

        <div className={cn('rounded-lg border p-5 text-center transition-colors', running ? 'border-accent/50 bg-accent-muted' : 'border-g80 bg-g85')}>
          <p className="font-mono text-5xl text-white tabular tracking-tight">{fmt(seconds)}</p>
          <p className="text-2xs font-mono text-g40 mt-1">{running ? 'Cronómetro en marcha — puedes cerrar este panel' : usingTimer ? 'En pausa' : 'Usa el cronómetro o ingresa las horas'}</p>
          <div className="flex justify-center gap-2 mt-4">
            {!running ? (
              <Button size="sm" onClick={start}><Play className="w-4 h-4" /> {seconds > 0 ? 'Reanudar' : 'Iniciar'}</Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={pause}><Pause className="w-4 h-4" /> Pausar</Button>
            )}
            {usingTimer && <Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="w-4 h-4" /> Reiniciar</Button>}
          </div>
        </div>

        <Select
          label="Proyecto"
          value={projectId}
          onChange={(e) => { setProjectId(e.target.value); setPhaseId('') }}
          options={[{ value: '', label: 'Seleccionar proyecto…' }, ...projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))]}
        />

        {project && project.phases?.length > 0 && (
          <Select
            label="Fase (opcional)"
            value={phaseId}
            onChange={(e) => setPhaseId(e.target.value)}
            options={[{ value: '', label: 'Sin fase' }, ...project.phases.map((ph) => ({ value: ph.id, label: `${ph.phase} · ${ph.label}` }))]}
          />
        )}

        <Input label="Descripción del trabajo" placeholder="Modelado 3D fachada norte" value={description} onChange={(e) => setDescription(e.target.value)} />

        <div className="grid grid-cols-2 gap-4">
          {!usingTimer ? (
            <Input label="Horas" type="number" step="0.25" min="0.25" max="24" placeholder="2.5" value={hours} onChange={(e) => setHours(e.target.value)} />
          ) : (
            <Input label="Horas (cronómetro)" value={String(Math.max(0.25, Math.round((seconds / 3600) * 4) / 4))} readOnly hint="Redondeado a 15 min" />
          )}
          <Input label="Fecha" type="date" value={date} max={localToday()} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-g80">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={submitting}>Registrar</Button>
        </div>
      </form>
    </Drawer>
  )
}
