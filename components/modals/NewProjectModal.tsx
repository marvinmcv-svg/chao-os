'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { ErrorBanner } from '@/components/ui/EmptyState'
import { api, asList } from '@/lib/api-client'
import { CONTRACT_TYPE, PROJECT_TYPE, USER_ROLE } from '@/lib/labels'
import { formatCurrency } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (projectId?: string) => void
}

interface Client { id: string; name: string; company: string }
interface Member { user: { id: string; name: string; role: string } }

const NEW_CLIENT = '__new__'

function today(offsetMonths = 0) {
  const d = new Date()
  d.setMonth(d.getMonth() + offsetMonths)
  return d.toISOString().slice(0, 10)
}

export function NewProjectModal({ open, onClose, onSuccess }: Props) {
  const [clients, setClients] = useState<Client[]>([])
  const [team, setTeam] = useState<Member[]>([])
  const [existingCodes, setExistingCodes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    code: '',
    clientId: '',
    projectManagerId: '',
    type: 'RESIDENTIAL',
    contractType: 'FIXED_FEE',
    totalBudgetUSD: '',
    startDate: today(),
    estimatedEndDate: today(12),
  })
  const [newClient, setNewClient] = useState({ name: '', company: '', email: '', phone: '' })

  const suggestedCode = useMemo(() => {
    const year = new Date().getFullYear()
    const nums = existingCodes
      .map((c) => c.match(new RegExp(`^P-${year}-(\\d{3})$`))?.[1])
      .filter(Boolean)
      .map(Number)
    return `P-${year}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
  }, [existingCodes])

  useEffect(() => {
    if (!open) return
    setError(null)
    Promise.all([api<unknown>('/api/clients'), api<unknown>('/api/team'), api<unknown>('/api/projects?limit=500')])
      .then(([c, t, p]) => {
        setClients(asList<Client>(c))
        setTeam(asList<Member>(t))
        setExistingCodes(asList<{ code: string }>(p, 'projects').map((x) => x.code))
      })
      .catch((e) => setError(e.message))
  }, [open])

  useEffect(() => {
    if (open && !form.code && suggestedCode) setForm((f) => ({ ...f, code: suggestedCode }))
  }, [open, suggestedCode, form.code])

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const budget = parseFloat(form.totalBudgetUSD)
  const split = [
    ['EP', 0.15],
    ['DD', 0.25],
    ['DC', 0.4],
    ['AO', 0.2],
  ] as const

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.estimatedEndDate <= form.startDate) {
      setError('La fecha de fin debe ser posterior a la de inicio')
      return
    }
    setLoading(true)
    try {
      let clientId = form.clientId
      if (clientId === NEW_CLIENT) {
        const created = await api<{ id: string }>('/api/clients', {
          method: 'POST',
          body: JSON.stringify({ ...newClient, type: 'ACTIVE' }),
        })
        clientId = created.id
      }
      const project = await api<{ id: string }>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          clientId,
          totalBudgetUSD: budget,
          // API expects full ISO datetimes, not yyyy-mm-dd
          startDate: new Date(form.startDate + 'T12:00:00').toISOString(),
          estimatedEndDate: new Date(form.estimatedEndDate + 'T12:00:00').toISOString(),
        }),
      })
      setForm((f) => ({ ...f, name: '', code: '', totalBudgetUSD: '' }))
      setNewClient({ name: '', company: '', email: '', phone: '' })
      onSuccess(project.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el proyecto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo proyecto" description="Se crean automáticamente las 4 fases con el honorario repartido 15 / 25 / 40 / 20 %." size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <ErrorBanner message={error} />}

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-4">
          <Input label="Nombre del proyecto" value={form.name} onChange={set('name')} placeholder="Residencia Las Palmas" required />
          <Input label="Código" value={form.code} onChange={set('code')} placeholder="P-2026-001" pattern="P-\d{4}-\d{3}" title="Formato P-AAAA-NNN" required hint="Formato P-AAAA-NNN" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Cliente"
            value={form.clientId}
            onChange={set('clientId')}
            required
            options={[
              { value: '', label: 'Seleccionar cliente…' },
              ...clients.map((c) => ({ value: c.id, label: `${c.company} — ${c.name}` })),
              { value: NEW_CLIENT, label: '+ Nuevo cliente…' },
            ]}
          />
          <Select
            label="Director de proyecto"
            value={form.projectManagerId}
            onChange={set('projectManagerId')}
            required
            options={[
              { value: '', label: 'Seleccionar…' },
              ...team.map((m) => ({ value: m.user.id, label: `${m.user.name} · ${USER_ROLE[m.user.role] ?? m.user.role}` })),
            ]}
          />
        </div>

        {form.clientId === NEW_CLIENT && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg border border-dashed border-g70 bg-g95/50">
            <Input label="Empresa" value={newClient.company} onChange={(e) => setNewClient({ ...newClient, company: e.target.value })} required />
            <Input label="Contacto" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} required />
            <Input label="Email" type="email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} required />
            <Input label="Teléfono" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} placeholder="+591 …" />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select label="Tipología" value={form.type} onChange={set('type')} options={Object.entries(PROJECT_TYPE).map(([value, label]) => ({ value, label }))} />
          <Select label="Contrato" value={form.contractType} onChange={set('contractType')} options={Object.entries(CONTRACT_TYPE).map(([value, label]) => ({ value, label }))} />
          <Input label="Honorario (USD)" type="number" min={1} step="any" value={form.totalBudgetUSD} onChange={set('totalBudgetUSD')} placeholder="120000" required />
        </div>

        {budget > 0 && (
          <div className="grid grid-cols-4 gap-px rounded-md overflow-hidden border border-g80 bg-g80">
            {split.map(([k, f]) => (
              <div key={k} className="bg-g95 px-3 py-2">
                <p className="text-2xs font-mono text-g40">{k} · {Math.round(f * 100)}%</p>
                <p className="text-sm font-mono text-g10 tabular">{formatCurrency(budget * f)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input label="Inicio" type="date" value={form.startDate} onChange={set('startDate')} required />
          <Input label="Fin estimado" type="date" value={form.estimatedEndDate} onChange={set('estimatedEndDate')} required />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-g80">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>Crear proyecto</Button>
        </div>
      </form>
    </Modal>
  )
}
