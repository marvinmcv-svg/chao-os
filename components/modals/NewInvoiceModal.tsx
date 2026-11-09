'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorBanner } from '@/components/ui/EmptyState'
import { Segmented } from '@/components/ui/Tabs'
import { api, asList } from '@/lib/api-client'
import { PHASE } from '@/lib/labels'
import { formatCurrency } from '@/lib/utils'

interface Project {
  id: string
  code: string
  name: string
  status: string
  client: { id: string; name: string; company: string }
  phases: { phase: string; budgetUSD: number; progressPercent: number }[]
}

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (invoice: unknown) => void
}

function inDays(n: number) {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
}

export function NewInvoiceModal({ open, onClose, onSuccess }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'phase' | 'free'>('phase')
  const [form, setForm] = useState({
    projectId: '',
    phase: '',
    percent: '',
    milestoneLabel: '',
    amount: '',
    currency: 'BOB',
    exchangeRate: '6.96',
    dueDate: inDays(30),
    notes: '',
  })

  useEffect(() => {
    if (!open) return
    setError(null)
    // BOB-first: default rate from the studio's fiscal settings
    api<{ settings: { exchangeRate: number } }>('/api/settings/fiscal')
      .then((d) => setForm((f) => ({ ...f, exchangeRate: String(d.settings.exchangeRate) })))
      .catch(() => {})
    api<unknown>('/api/projects?limit=200')
      .then((d) => setProjects(asList<Project>(d, 'projects').filter((p) => p.status !== 'COMPLETED')))
      .catch((e) => setError(e.message))
  }, [open])

  const project = projects.find((p) => p.id === form.projectId)
  const phase = project?.phases.find((p) => p.phase === form.phase)

  // Progress billing: amount = phase fee × % of that phase being billed
  const computed = useMemo(() => {
    if (mode !== 'phase' || !phase) return null
    const pct = parseFloat(form.percent)
    if (!(pct > 0)) return null
    return Math.round(phase.budgetUSD * (pct / 100) * 100) / 100
  }, [mode, phase, form.percent])

  const rate = parseFloat(form.exchangeRate) || 6.96
  const isBOB = form.currency === 'BOB'

  useEffect(() => {
    if (computed != null && phase) {
      setForm((f) => ({
        ...f,
        amount: String(f.currency === 'BOB' ? Math.round(computed * (parseFloat(f.exchangeRate) || 6.96) * 100) / 100 : computed),
        milestoneLabel: `${PHASE[phase.phase]?.label ?? phase.phase} — ${f.percent}% del honorario de fase`,
      }))
    }
  }, [computed, phase, form.currency, form.exchangeRate])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const entered = parseFloat(form.amount)
    // Phase billing keeps the exact USD fee; free amounts in Bs convert at the rate.
    const amount = computed != null && mode === 'phase' ? computed : isBOB ? Math.round((entered / rate) * 100) / 100 : entered
    if (!form.projectId) return setError('Selecciona un proyecto')
    if (!(amount > 0)) return setError('El monto debe ser positivo')
    if (!form.milestoneLabel.trim()) return setError('Describe el hito o concepto')
    setSubmitting(true)
    try {
      const inv = await api('/api/invoices', {
        method: 'POST',
        body: JSON.stringify({
          projectId: form.projectId,
          milestoneLabel: form.milestoneLabel.trim(),
          amountUSD: amount,
          currency: form.currency,
          exchangeRate: isBOB ? rate : 1,
          dueDate: new Date(form.dueDate + 'T12:00:00').toISOString(),
          notes: form.notes || undefined,
        }),
      })
      setForm((f) => ({ ...f, phase: '', percent: '', milestoneLabel: '', amount: '', notes: '' }))
      onSuccess(inv)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear factura')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva factura" description="Se crea como borrador; emítela desde el detalle para enviarla al cliente." size="lg">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorBanner message={error} />}

        <Select
          label="Proyecto"
          value={form.projectId}
          onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value, phase: '' }))}
          options={[{ value: '', label: 'Seleccionar proyecto…' }, ...projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name} · ${p.client.company}` }))]}
        />

        <div className="flex items-center justify-between gap-3">
          <span className="text-2xs font-mono text-g40 uppercase tracking-wider">Tipo de cobro</span>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { id: 'phase', label: 'Avance de fase' },
              { id: 'free', label: 'Monto libre' },
            ]}
          />
        </div>

        {mode === 'phase' && (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4">
            <Select
              label="Fase"
              value={form.phase}
              onChange={set('phase')}
              disabled={!project}
              options={[
                { value: '', label: project ? 'Seleccionar fase…' : 'Elige un proyecto primero' },
                ...(project?.phases ?? []).map((p) => ({
                  value: p.phase,
                  label: `${PHASE[p.phase]?.short} · ${PHASE[p.phase]?.label} — ${formatCurrency(p.budgetUSD)} (avance ${p.progressPercent}%)`,
                })),
              ]}
            />
            <Input label="% a facturar" type="number" min={1} max={100} value={form.percent} onChange={set('percent')} placeholder="50" disabled={!phase} />
          </div>
        )}

        <Input label="Hito / concepto" value={form.milestoneLabel} onChange={set('milestoneLabel')} placeholder="Hito 2 — Desarrollo de diseño 50%" />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select label="Moneda de cobro" value={form.currency} onChange={set('currency')} options={[{ value: 'BOB', label: 'Bolivianos (Bs)' }, { value: 'USD', label: 'Dólares (USD)' }]} />
          <Input label={isBOB ? 'Monto (Bs)' : 'Monto (USD)'} type="number" step="0.01" min="0.01" value={form.amount} onChange={set('amount')} placeholder={isBOB ? '128760' : '18500'} readOnly={mode === 'phase' && computed != null} />
          <Input label="Vence" type="date" value={form.dueDate} onChange={set('dueDate')} required />
        </div>

        {form.currency === 'BOB' && (
          <Input
            label="Tipo de cambio (Bs/USD)"
            type="number"
            step="0.01"
            value={form.exchangeRate}
            onChange={set('exchangeRate')}
            hint={parseFloat(form.amount) > 0 ? `Equivale a ${formatCurrency(Math.round((parseFloat(form.amount) / rate) * 100) / 100)} · la factura fiscal se emite en bolivianos` : 'La factura fiscal se emite en bolivianos'}
          />
        )}

        <Textarea label="Notas (opcional)" rows={2} value={form.notes} onChange={set('notes')} placeholder="Condiciones de pago, datos bancarios…" />

        <div className="flex justify-end gap-2 pt-4 border-t border-g80">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={submitting}>Crear borrador</Button>
        </div>
      </form>
    </Modal>
  )
}
