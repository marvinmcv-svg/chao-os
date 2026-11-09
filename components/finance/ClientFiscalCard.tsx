'use client'

import { useEffect, useState } from 'react'
import { Landmark, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorBanner } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'

export interface ClientFiscal {
  id: string
  company: string
  billingName: string
  docType: 'CI' | 'CEX' | 'PAS' | 'OD' | 'NIT'
  docNumber: string
  docComplement: string
}

const DOC_OPTIONS = [
  { value: 'NIT', label: 'NIT' },
  { value: 'CI', label: 'Cédula de identidad' },
  { value: 'CEX', label: 'Cédula de extranjero' },
  { value: 'PAS', label: 'Pasaporte' },
  { value: 'OD', label: 'Otro documento' },
]

/** Billing name + NIT/CI used on the client's fiscal invoices. */
export function ClientFiscalCard({ client, onSaved }: { client: ClientFiscal; onSaved: () => void }) {
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({ billingName: '', docType: 'NIT', docNumber: '', docComplement: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setF({ billingName: client.billingName || client.company, docType: client.docType, docNumber: client.docNumber, docComplement: client.docComplement })
    setEditing(false)
    setError(null)
  }, [client])

  const complete = !!client.docNumber
  async function save(e: React.FormEvent) {
    e.preventDefault()
    // Same rules as the server, so common mistakes never round-trip
    if ((f.docType === 'NIT' || f.docType === 'CI') && !/^\d+$/.test(f.docNumber)) return setError(`${f.docType}: solo dígitos`)
    if (f.docType === 'NIT' && f.docComplement) return setError('El NIT no lleva complemento')
    setSaving(true)
    setError(null)
    try {
      await api(`/api/clients/${client.id}/fiscal`, { method: 'PUT', body: JSON.stringify(f) })
      setEditing(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-lg border border-g80 bg-g85 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-2xs font-mono text-g40 uppercase tracking-[0.14em] flex items-center gap-2">
          <Landmark className="w-3.5 h-3.5" /> Datos de facturación
        </h3>
        {!editing && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="w-3.5 h-3.5" /> {complete ? 'Editar' : 'Completar'}
          </Button>
        )}
      </div>
      {!editing ? (
        complete ? (
          <dl className="text-sm space-y-1">
            <div><dt className="sr-only">Razón social</dt><dd className="text-g10">{client.billingName || client.company}</dd></div>
            <div>
              <dt className="sr-only">Documento</dt>
              <dd className="font-mono text-xs text-g30">{client.docType} {client.docNumber}{client.docComplement ? `-${client.docComplement}` : ''}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-yellow-200/90">Falta el NIT/CI y la razón social: no se le puede emitir factura fiscal.</p>
        )
      ) : (
        <form onSubmit={save} className="space-y-3">
          {error && <ErrorBanner message={error} />}
          <Input label="Razón social / nombre" value={f.billingName} onChange={(e) => setF({ ...f, billingName: e.target.value })} required minLength={2} />
          <div className="grid grid-cols-[1fr_1fr_80px] gap-3">
            <Select label="Documento" value={f.docType} onChange={(e) => setF({ ...f, docType: e.target.value, docComplement: e.target.value === 'NIT' ? '' : f.docComplement })} options={DOC_OPTIONS} />
            <Input label="Número" inputMode={f.docType === 'NIT' || f.docType === 'CI' ? 'numeric' : 'text'} value={f.docNumber} onChange={(e) => setF({ ...f, docNumber: e.target.value.trim() })} required />
            <Input label="Compl." value={f.docComplement} disabled={f.docType === 'NIT'} onChange={(e) => setF({ ...f, docComplement: e.target.value.trim() })} maxLength={5} />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button size="sm" type="submit" loading={saving}>Guardar</Button>
          </div>
        </form>
      )}
    </section>
  )
}
