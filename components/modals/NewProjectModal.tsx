'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

interface FormData {
  name: string
  code: string
  clientId: string
  projectManagerId: string
  type: string
  contractType: string
  totalBudgetUSD: string
  startDate: string
  estimatedEndDate: string
}

const initialFormData: FormData = {
  name: '',
  code: '',
  clientId: '',
  projectManagerId: '',
  type: 'RESIDENTIAL',
  contractType: 'FIXED_FEE',
  totalBudgetUSD: '',
  startDate: '',
  estimatedEndDate: '',
}

export function NewProjectModal({ open, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>(initialFormData)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          totalBudgetUSD: parseFloat(form.totalBudgetUSD),
        }),
      })
      const json = await res.json()
      if (json.success) {
        setForm(initialFormData)
        onSuccess()
      } else {
        setError(json.error || 'Error al crear el proyecto')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear el proyecto')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo Proyecto">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-mono text-g40 mb-1">Nombre del proyecto</label>
            <Input
              value={form.name}
              onChange={handleChange('name')}
              placeholder="Nombre"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-g40 mb-1">Código</label>
            <Input
              value={form.code}
              onChange={handleChange('code')}
              placeholder="PRJ-001"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-mono text-g40 mb-1">Cliente</label>
            <Input
              value={form.clientId}
              onChange={handleChange('clientId')}
              placeholder="ID del cliente"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-g40 mb-1">Director de Proyecto</label>
            <Input
              value={form.projectManagerId}
              onChange={handleChange('projectManagerId')}
              placeholder="ID del director"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-mono text-g40 mb-1">Tipo</label>
            <select
              value={form.type}
              onChange={handleChange('type')}
              className="w-full h-10 px-3 bg-g90 border border-g70 rounded-md text-sm text-g20 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="RESIDENTIAL">Residencial</option>
              <option value="COMMERCIAL">Comercial</option>
              <option value="INDUSTRIAL">Industrial</option>
              <option value="INSTITUTIONAL">Institucional</option>
              <option value="MIXED">Mixto</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-mono text-g40 mb-1">Contrato</label>
            <select
              value={form.contractType}
              onChange={handleChange('contractType')}
              className="w-full h-10 px-3 bg-g90 border border-g70 rounded-md text-sm text-g20 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="FIXED_FEE">Tarifa fija</option>
              <option value="PERCENTAGE">Porcentaje</option>
              <option value="TIME_AND_MATERIALS">Tiempo y materiales</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-mono text-g40 mb-1">Presupuesto USD</label>
          <Input
            type="number"
            value={form.totalBudgetUSD}
            onChange={handleChange('totalBudgetUSD')}
            placeholder="50000"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-mono text-g40 mb-1">Fecha de inicio</label>
            <Input
              type="date"
              value={form.startDate}
              onChange={handleChange('startDate')}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-g40 mb-1">Fecha fin estimada</label>
            <Input
              type="date"
              value={form.estimatedEndDate}
              onChange={handleChange('estimatedEndDate')}
              required
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-g80">
          {error && <div className="text-red-500 text-sm py-2">{error}</div>}
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            Crear Proyecto
          </Button>
        </div>
      </form>
    </Modal>
  )
}