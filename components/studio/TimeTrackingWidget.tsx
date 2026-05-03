'use client'

import { useState, useEffect, useRef } from 'react'
import { Clock, X, Play, Pause, Square } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { formatDate } from '@/lib/utils'

interface Project {
  id: string
  code: string
  name: string
  currentPhase: string
}

interface Props {
  onClose: () => void
  onEntryAdded: () => void
}

export function TimeTrackingWidget({ onClose, onEntryAdded }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [description, setDescription] = useState('')
  const [hours, setHours] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [projectId, setProjectId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Timer state
  const [timerRunning, setTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    fetchProjects()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects')
      const json = await res.json()
      if (json.success) setProjects(json.data)
    } catch (e) {
      console.error('Failed to fetch projects', e)
    }
  }

  // Timer controls
  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimerRunning(true)
    timerRef.current = setInterval(() => {
      setTimerSeconds(s => s + 1)
    }, 1000)
  }

  function stopTimer() {
    setTimerRunning(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  function resetTimer() {
    stopTimer()
    setTimerSeconds(0)
  }

  function formatTimerDisplay(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    let hoursToSubmit = parseFloat(hours)
    if (timerRunning || timerSeconds > 0) {
      hoursToSubmit = timerSeconds / 3600
    }

    if (!description.trim() || !projectId) {
      setError('Descripción y proyecto son requeridos')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, description, hours: hoursToSubmit, date }),
      })
      const json = await res.json()
      if (!json.success) {
        setError(json.error?.message || 'Error al registrar')
        return
      }
      resetTimer()
      setDescription('')
      setHours('')
      onEntryAdded()
      onClose()
    } catch {
      setError('Error de conexión')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen w-[420px] bg-g90 border-l border-g80 z-50 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-g80">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-g30" />
            <h2 className="font-mono text-sm text-g40 uppercase">Registrar Horas</h2>
          </div>
          <button onClick={onClose} className="p-1 text-g40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Timer */}
          <div className="bg-g85 border border-g80 rounded-md p-4">
            <p className="text-center font-mono text-4xl text-white mb-4">
              {formatTimerDisplay(timerSeconds)}
            </p>
            <div className="flex justify-center gap-2">
              {!timerRunning ? (
                <Button type="button" size="sm" onClick={startTimer}>
                  <Play className="w-4 h-4 mr-1" /> Iniciar
                </Button>
              ) : (
                <Button type="button" size="sm" variant="secondary" onClick={stopTimer}>
                  <Pause className="w-4 h-4 mr-1" /> Pausar
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" onClick={resetTimer}>
                <Square className="w-4 h-4 mr-1" /> Reset
              </Button>
            </div>
          </div>

          <Select
            label="Proyecto"
            options={[
              { value: '', label: 'Seleccionar proyecto...' },
              ...projects.map(p => ({ value: p.id, label: `${p.code} — ${p.name}` })),
            ]}
            value={projectId}
            onChange={e => setProjectId(e.target.value)}
          />

          <Input
            label="Descripción del trabajo"
            placeholder="Modelado 3D Fachada Norte"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />

          {!timerRunning && timerSeconds === 0 && (
            <Input
              label="Horas (alternativa al timer)"
              type="number"
              step="0.25"
              min="0.25"
              max="24"
              placeholder="2.5"
              value={hours}
              onChange={e => setHours(e.target.value)}
            />
          )}

          <Input
            label="Fecha"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-g80">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Guardando...' : 'Registrar'}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}