'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Clock, FilePlus2 } from 'lucide-react'

export interface PortalChangeOrder {
  id: string
  number: string
  kind: 'CHANGE_ORDER' | 'ADDITIONAL_SERVICE'
  title: string
  description: string
  reason: string
  phase: string | null
  feeUSD: number
  scheduleImpactDays: number
  status: 'SENT' | 'APPROVED' | 'REJECTED'
  sentAt: string | null
  decidedAt: string | null
  decidedByName: string | null
  decisionNote: string
}

export interface PortalContract {
  originalFeeUSD: number
  approvedUSD: number
  pendingUSD: number
  currentFeeUSD: number
  pendingCount: number
}

const KIND: Record<string, string> = { CHANGE_ORDER: 'Orden de cambio', ADDITIONAL_SERVICE: 'Servicio adicional' }
const PHASE: Record<string, string> = { SD: 'Esquema preliminar', DD: 'Desarrollo de diseño', CD: 'Documentos de construcción', CA: 'Administración de obra' }
const usd = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const signed = (n: number) => `${n < 0 ? '−' : '+'}${usd(n)}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-BO')

function Decision({
  co,
  projectId,
  token,
  onDecided,
}: {
  co: PortalChangeOrder
  projectId: string
  token: string
  onDecided: () => void
}) {
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mode) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/portal/project/${encodeURIComponent(projectId)}/change-orders/${encodeURIComponent(co.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, decision: mode, name, note }),
      })
      const json = await res.json().catch(() => null)
      if (!json?.success) throw new Error(json?.error?.message || 'No se pudo registrar tu respuesta')
      onDecided()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de conexión')
    } finally {
      setBusy(false)
    }
  }

  if (!mode) {
    return (
      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
        <button onClick={() => setMode('reject')} className="h-10 px-4 rounded-md border border-g70 text-sm text-g20 hover:bg-g80">
          Rechazar
        </button>
        <button onClick={() => setMode('approve')} className="h-10 px-4 rounded-md bg-accent text-g95 text-sm font-medium hover:opacity-90">
          Aprobar
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3 border-t border-g80 pt-4">
      <p className="text-sm text-g10">
        {mode === 'approve'
          ? `Al aprobar, aceptas un ajuste de ${signed(co.feeUSD)} al honorario${co.scheduleImpactDays ? ` y ${co.scheduleImpactDays > 0 ? '+' : '−'}${Math.abs(co.scheduleImpactDays)} días de plazo` : ''}.`
          : 'Indícanos el motivo para que podamos revisar la propuesta.'}
      </p>
      <label className="block">
        <span className="text-xs text-g30">Tu nombre completo (firma)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          className="mt-1 w-full h-10 px-3 rounded-md bg-g95 border border-g70 text-g10 focus:outline-none focus:ring-1 focus:ring-accent/60"
        />
      </label>
      <label className="block">
        <span className="text-xs text-g30">Comentario {mode === 'approve' && '(opcional)'}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={2000}
          className="mt-1 w-full px-3 py-2 rounded-md bg-g95 border border-g70 text-g10 focus:outline-none focus:ring-1 focus:ring-accent/60"
        />
      </label>
      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <button type="button" onClick={() => setMode(null)} className="h-10 px-4 rounded-md text-sm text-g30 hover:text-white">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={busy || name.trim().length < 2}
          className={`h-10 px-4 rounded-md text-sm font-medium disabled:opacity-50 ${mode === 'approve' ? 'bg-accent text-g95' : 'bg-red-500/80 text-white'}`}
        >
          {busy ? 'Enviando…' : mode === 'approve' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
        </button>
      </div>
    </form>
  )
}

function Body({ co }: { co: PortalChangeOrder }) {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-2xs font-mono text-g40 uppercase tracking-wider">{co.number} · {KIND[co.kind]}</p>
          <h3 className="text-g10 font-medium mt-1">{co.title}</h3>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`font-mono text-lg ${co.feeUSD < 0 ? 'text-green-300' : 'text-white'}`}>{signed(co.feeUSD)}</p>
          <p className="text-2xs font-mono text-g40">
            {co.scheduleImpactDays ? `${co.scheduleImpactDays > 0 ? '+' : '−'}${Math.abs(co.scheduleImpactDays)} días` : 'Sin cambio de plazo'}
          </p>
        </div>
      </div>
      {co.description && <p className="text-sm text-g30 mt-3 whitespace-pre-line">{co.description}</p>}
      {co.reason && <p className="text-xs text-g40 mt-2">Motivo: {co.reason}</p>}
      {co.phase && <p className="text-xs text-g40 mt-1">Fase: {PHASE[co.phase] ?? co.phase}</p>}
    </>
  )
}

export function PortalChangeOrders({
  projectId,
  token,
  changeOrders,
  contract,
  onChanged,
  part,
}: {
  part: 'pending' | 'history'
  projectId: string
  token: string
  changeOrders: PortalChangeOrder[]
  contract: PortalContract
  onChanged: () => void
}) {
  const items = changeOrders
  const pending = items.filter((c) => c.status === 'SENT')
  const decided = items.filter((c) => c.status !== 'SENT')
  if (items.length === 0) return null

  // The server applies the decision to the contract; reload everything.
  const replace = () => onChanged()

  return (
    <>
      {part === 'pending' && pending.length > 0 && (
        <section aria-labelledby="co-pending">
          <h2 id="co-pending" className="font-mono text-sm text-yellow-300 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4" /> Pendiente de tu aprobación ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((co) => (
              <article key={co.id} className="border border-yellow-500/30 bg-g85 rounded-lg p-4 space-y-4">
                <Body co={co} />
                <Decision co={co} projectId={projectId} token={token} onDecided={replace} />
              </article>
            ))}
          </div>
        </section>
      )}

      {part === 'history' && decided.length > 0 && (
        <section aria-labelledby="co-history">
          <h2 id="co-history" className="font-mono text-sm text-g40 uppercase tracking-wider mb-4 flex items-center gap-2">
            <FilePlus2 className="w-4 h-4" /> Órdenes de cambio
          </h2>
          <div className="bg-g85 border border-g80 rounded-lg p-4 mb-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xs font-mono text-g40 uppercase">Contrato original</p>
              <p className="font-mono text-white mt-1">{usd(contract.originalFeeUSD)}</p>
            </div>
            <div>
              <p className="text-2xs font-mono text-g40 uppercase">Cambios aprobados</p>
              <p className="font-mono text-white mt-1">{contract.approvedUSD ? signed(contract.approvedUSD) : '—'}</p>
            </div>
            <div>
              <p className="text-2xs font-mono text-g40 uppercase">Honorario vigente</p>
              <p className="font-mono text-white mt-1">{usd(contract.currentFeeUSD)}</p>
            </div>
          </div>
          <div className="space-y-2">
            {decided.map((co) => (
              <article key={co.id} className="border border-g80 bg-g85 rounded-lg p-4">
                <Body co={co} />
                <p className={`mt-3 text-xs flex items-center gap-1.5 ${co.status === 'APPROVED' ? 'text-green-300' : 'text-red-300'}`}>
                  {co.status === 'APPROVED' ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {co.status === 'APPROVED' ? 'Aprobada' : 'Rechazada'}
                  {co.decidedByName ? ` por ${co.decidedByName}` : ''}
                  {co.decidedAt ? ` · ${fmtDate(co.decidedAt)}` : ''}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
