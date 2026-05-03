'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { z } from 'zod'

const CreateInvoiceSchema = z.object({
  projectId: z.string().cuid('Selecciona un proyecto'),
  milestoneLabel: z.string().min(1, 'Descripción del hito requerida'),
  amountUSD: z.number().positive('Monto debe ser positivo'),
  currency: z.enum(['USD', 'BOB']).default('USD'),
  exchangeRate: z.number().positive().default(1),
  dueDate: z.string().min(1, 'Fecha requerida'),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof CreateInvoiceSchema>

interface Project {
  id: string
  code: string
  name: string
  client: { id: string; name: string; company: string }
}

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (invoice: unknown) => void
}

export function NewInvoiceModal({ open, onClose, onSuccess }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(CreateInvoiceSchema),
    defaultValues: { currency: 'USD', exchangeRate: 1 },
  })

  const currency = watch('currency')

  useEffect(() => {
    if (open) {
      fetchProjects()
      reset()
      setError('')
    }
  }, [open])

  async function fetchProjects() {
    try {
      const res = await fetch('/api/projects')
      const json = await res.json()
      if (json.success) setProjects(json.data)
    } catch (e) {
      console.error('Failed to fetch projects', e)
    }
  }

  async function onSubmit(data: FormData) {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!json.success) {
        setError(json.error?.message || 'Error al crear factura')
        return
      }
      onSuccess(json.data)
      reset()
    } catch (e) {
      setError('Error de conexión')
    } finally {
      setSubmitting(false)
    }
  }

  const currencyOptions = [
    { value: 'USD', label: 'USD — Dólares estadounidenses' },
    { value: 'BOB', label: 'BOB — Bolivianos' },
  ]

  return (
    <Modal open={open} onClose={onClose} title="Nueva Factura" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-800 rounded text-sm text-red-400">
            {error}
          </div>
        )}

        <Select
          label="Proyecto"
          options={[
            { value: '', label: 'Seleccionar proyecto...' },
            ...projects.map(p => ({ value: p.id, label: `${p.code} — ${p.name}` })),
          ]}
          {...register('projectId')}
          error={errors.projectId?.message}
        />

        <Input
          label="Hito / Descripción"
          placeholder="Hito 1 — SD 30%"
          {...register('milestoneLabel')}
          error={errors.milestoneLabel?.message}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Monto (USD)"
            type="number"
            step="0.01"
            placeholder="18500"
            {...register('amountUSD', { valueAsNumber: true })}
            error={errors.amountUSD?.message}
          />
          <Select
            label="Moneda"
            options={currencyOptions}
            {...register('currency')}
          />
        </div>

        {currency === 'BOB' && (
          <Input
            label="Tipo de cambio (BS/USD)"
            type="number"
            step="0.01"
            placeholder="6.96"
            {...register('exchangeRate', { valueAsNumber: true })}
            error={errors.exchangeRate?.message}
          />
        )}

        <Input
          label="Fecha de vencimiento"
          type="date"
          {...register('dueDate')}
          error={errors.dueDate?.message}
        />

        <div>
          <label className="block text-sm font-mono text-g40 mb-1.5">Notas (opcional)</label>
          <textarea
            {...register('notes')}
            rows={3}
            placeholder="Notas adicionales..."
            className="w-full px-3 py-2 bg-g90 border border-g70 rounded-md text-sm text-g20 placeholder:text-g50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-g80">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creando...' : 'Crear Factura'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}