'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Landmark, FileCheck2, Ban, Printer, AlertTriangle, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Input'
import { ErrorBanner } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'

export interface FiscalFields {
  id: string
  status: string
  fiscalStatus: 'NOT_ISSUED' | 'ISSUED' | 'VALIDATED' | 'ANNULLED'
  fiscalNumber: number | null
  cuf: string | null
  fiscalIssuedAt: string | null
  amountBOB: number | null
  buyerName: string | null
  buyerDocNumber: string | null
  annulledAt: string | null
  annulReasonCode: number | null
  annulNote: string
  paymentsCount: number
}

export const FISCAL_STATUS: Record<string, { label: string; variant: 'default' | 'yellow' | 'green' | 'red' | 'outline' }> = {
  NOT_ISSUED: { label: 'Sin factura fiscal', variant: 'outline' },
  ISSUED: { label: 'Emitida · pendiente SIN', variant: 'yellow' },
  VALIDATED: { label: 'Validada por el SIN', variant: 'green' },
  ANNULLED: { label: 'Anulada', variant: 'red' },
}

const REASONS: Record<number, string> = {
  1: 'Factura mal emitida',
  2: 'Nota de crédito-débito mal emitida',
  3: 'Datos de emisión incorrectos',
  4: 'Factura o nota devuelta',
}

export const fmtBOB = (n: number) => `Bs ${n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function FiscalSection({ inv, canManage, onChanged }: { inv: FiscalFields; canManage: boolean; onChanged: () => Promise<void> | void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [annulling, setAnnulling] = useState(false)
  const [reason, setReason] = useState('1')
  const [note, setNote] = useState('')
  const [copied, setCopied] = useState(false)
  const st = FISCAL_STATUS[inv.fiscalStatus]

  const act = async (key: string, body: Record<string, unknown>) => {
    setBusy(key)
    setError(null)
    try {
      await api(`/api/invoices/${inv.id}/fiscal`, { method: 'POST', body: JSON.stringify(body) })
      setAnnulling(false)
      await onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="rounded-lg border border-g80 bg-g85 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-2xs font-mono text-g40 uppercase tracking-[0.14em] flex items-center gap-2">
          <Landmark className="w-3.5 h-3.5" /> Factura fiscal (SIN)
        </h3>
        <Badge variant={st.variant} dot>{st.label}</Badge>
      </div>
      {error && (
        <div>
          <ErrorBanner message={error} />
          {/Configuración/.test(error) && <Link href="/settings#fiscal" className="text-2xs font-mono text-accent hover:underline">Ir a datos fiscales →</Link>}
          {/Clientes/.test(error) && <Link href="/clients" className="text-2xs font-mono text-accent hover:underline">Ir a clientes →</Link>}
        </div>
      )}

      {inv.fiscalStatus === 'NOT_ISSUED' ? (
        <>
          <p className="text-xs text-g40">
            Emitir asigna el número de factura y el CUF, convierte el detalle a bolivianos al tipo de cambio de la factura y fija los datos del comprador (NIT/CI y razón social).
            {inv.status === 'DRAFT' && ' El borrador pasa a Enviada.'}
          </p>
          {canManage ? (
            <Button size="sm" onClick={() => confirm('¿Emitir la factura fiscal? El número de factura no se puede reutilizar.') && act('issue', { action: 'issue' })} loading={busy === 'issue'} disabled={inv.status === 'PAID'}>
              <FileCheck2 className="w-4 h-4" /> Emitir factura fiscal
            </Button>
          ) : (
            <p className="text-2xs text-g50">Solo dirección y administración emiten facturas fiscales.</p>
          )}
        </>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-2xs font-mono text-g40 uppercase">N° factura</dt>
              <dd className="font-mono text-white">{inv.fiscalNumber}</dd>
            </div>
            <div>
              <dt className="text-2xs font-mono text-g40 uppercase">Total</dt>
              <dd className="font-mono text-white tabular">{fmtBOB(inv.amountBOB ?? 0)}</dd>
            </div>
            <div className="col-span-2 min-w-0">
              <dt className="text-2xs font-mono text-g40 uppercase">CUF</dt>
              <dd className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-xs text-g20 truncate" title={inv.cuf ?? ''}>{inv.cuf}</span>
                <button
                  aria-label="Copiar CUF"
                  className="p-1 rounded text-g40 hover:text-white hover:bg-g80 flex-shrink-0"
                  onClick={() => {
                    navigator.clipboard?.writeText(inv.cuf ?? '').then(() => {
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1500)
                    })
                  }}
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-2xs font-mono text-g40 uppercase">Comprador</dt>
              <dd className="text-g10">{inv.buyerName} · <span className="font-mono">{inv.buyerDocNumber}</span></dd>
            </div>
          </dl>
          {inv.fiscalStatus === 'ISSUED' && (
            <p className="flex gap-2 text-xs text-yellow-200/90 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              Emitida fuera de línea: la conexión con el SIAT no está configurada, así que el SIN aún no la validó y no es válida para crédito fiscal. Configúrala en Configuración → Integraciones.
            </p>
          )}
          {inv.fiscalStatus === 'ANNULLED' && (
            <p className="text-xs text-red-300">
              Anulada el {formatDate(inv.annulledAt!)} — {REASONS[inv.annulReasonCode ?? 0]}
              {inv.annulNote ? `: ${inv.annulNote}` : ''}
            </p>
          )}

          {annulling && (
            <div className="rounded-lg border border-g70 p-3 space-y-3">
              <Select label="Motivo de anulación (SIN)" value={reason} onChange={(e) => setReason(e.target.value)} options={Object.entries(REASONS).map(([value, label]) => ({ value, label }))} />
              <Textarea label="Detalle (opcional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAnnulling(false)}>Cancelar</Button>
                <Button size="sm" variant="danger" loading={busy === 'annul'} onClick={() => act('annul', { action: 'annul', reasonCode: Number(reason), note })}>
                  Anular factura {inv.fiscalNumber}
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => window.open(`/invoices/${inv.id}/print`, '_blank')}>
              <Printer className="w-4 h-4" /> Ver / imprimir factura
            </Button>
            {canManage && !annulling && (inv.fiscalStatus === 'ISSUED' || inv.fiscalStatus === 'VALIDATED') && (
              <Button size="sm" variant="ghost" onClick={() => setAnnulling(true)} disabled={inv.paymentsCount > 0} title={inv.paymentsCount > 0 ? 'Tiene cobros registrados' : undefined}>
                <Ban className="w-4 h-4" /> Anular
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  )
}
