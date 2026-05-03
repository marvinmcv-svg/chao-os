'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { CreateLeadSchema } from '@/lib/validations'
import { z } from 'zod'
import { format } from 'date-fns'

type FormData = z.infer<typeof CreateLeadSchema>

interface TeamMember {
  id: string
  user: { id: string; name: string; role: string }
}

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: (newLead: any) => void
}

export function NewLeadModal({ open, onClose, onSuccess }: Props) {
  const [team, setTeam] = useState<TeamMember[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(CreateLeadSchema),
    defaultValues: {
      pipelineStage: 'PROSPECT',
      closeProbability: 0,
      projectType: 'COMMERCIAL',
      sourceType: 'REFERRAL',
    },
  })

  const estimatedValue = watch('estimatedValueUSD')

  useEffect(() => {
    if (open) {
      fetchTeam()
      reset()
      setError('')
    }
  }, [open])

  async function fetchTeam() {
    try {
      const res = await fetch('/api/team')
      const json = await res.json()
      if (json.success) setTeam(json.data)
    } catch (e) {
      console.error('Failed to fetch team', e)
    }
  }

  async function onSubmit(data: FormData) {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!json.success) {
        setError(json.error?.message || 'Error al crear lead')
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

  const projectTypeOptions = [
    { value: 'RESIDENTIAL', label: 'Residencial' },
    { value: 'COMMERCIAL', label: 'Comercial' },
    { value: 'INDUSTRIAL', label: 'Industrial' },
    { value: 'INSTITUTIONAL', label: 'Institucional' },
    { value: 'MIXED', label: 'Mixto' },
  ]

  const sourceTypeOptions = [
    { value: 'REFERRAL', label: 'Recomendación' },
    { value: 'DIRECT', label: 'Contacto directo' },
    { value: 'ONLINE', label: 'Búsqueda online' },
    { value: 'NETWORK', label: 'Red de contactos' },
  ]

  return (
    <Modal open={open} onClose={onClose} title="Nuevo Lead" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-800 rounded text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Nombre del proyecto"
            placeholder="Torre Buganvillas"
            {...register('projectName')}
            error={errors.projectName?.message}
          />
          <Input
            label="Empresa"
            placeholder="Inmobiliaria Oriente"
            {...register('company')}
            error={errors.company?.message}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Contacto"
            placeholder="Rodrigo Méndez"
            {...register('contactName')}
            error={errors.contactName?.message}
          />
          <Input
            label="Email"
            type="email"
            placeholder="rodrigo@inmobiliaria.com"
            {...register('contactEmail')}
            error={errors.contactEmail?.message}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Teléfono"
            placeholder="+591 7000 0000"
            {...register('contactPhone')}
            error={errors.contactPhone?.message}
          />
          <Select
            label="Asignado a"
            options={[
              { value: '', label: 'Seleccionar...' },
              ...team.map(m => ({ value: m.user.id, label: `${m.user.name} (${m.user.role})` })),
            ]}
            {...register('assignedToId')}
            error={errors.assignedToId?.message}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Valor estimado (USD)"
            type="number"
            placeholder="280000"
            {...register('estimatedValueUSD', { valueAsNumber: true })}
            error={errors.estimatedValueUSD?.message}
          />
          <Select
            label="Tipo de proyecto"
            options={projectTypeOptions}
            {...register('projectType')}
            error={errors.projectType?.message}
          />
          <Select
            label="Fuente"
            options={sourceTypeOptions}
            {...register('sourceType')}
            error={errors.sourceType?.message}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Probabilidad de cierre (%)"
            type="number"
            min={0}
            max={100}
            placeholder="50"
            {...register('closeProbability', { valueAsNumber: true })}
            error={errors.closeProbability?.message}
          />
        </div>

        <div>
          <label className="block text-sm font-mono text-g40 mb-1.5">Notas</label>
          <textarea
            {...register('notes')}
            rows={3}
            placeholder="Detalles adicionales sobre el proyecto o cliente..."
            className="w-full px-3 py-2 bg-g90 border border-g70 rounded-md text-sm text-g20 placeholder:text-g50 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          {errors.notes?.message && <p className="text-xs text-red-400 mt-1">{errors.notes.message}</p>}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-g80">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creando...' : 'Crear Lead'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
