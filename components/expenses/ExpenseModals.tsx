'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, XCircle, Paperclip, Trash2, ExternalLink, HandCoins, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorBanner } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'
import { EXPENSE_CATEGORY, EXPENSE_STATUS, PHASE, meta } from '@/lib/labels'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

export interface ExpenseDTO {
  id: string
  projectId: string
  description: string
  category: string
  vendor: string
  phase: string | null
  amountUSD: number
  currency: 'USD' | 'BOB'
  amountOriginal: number | null
  exchangeRate: number
  incurredAt: string
  billable: boolean
  markupPercent: number
  billedAmountUSD: number
  paidByStaff: boolean
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REIMBURSED'
  submittedById: string | null
  submittedBy: { id: string; name: string; avatarInitials: string } | null
  reviewedBy: { id: string; name: string } | null
  reviewedAt: string | null
  reviewNote: string
  reimbursedAt: string | null
  hasReceipt: boolean
  receiptName: string | null
  receiptSize: number | null
  invoice: { id: string; number: string; status: string } | null
  project: { id: string; code: string; name: string; projectManagerId: string }
  /** Only on the Finance list */
  canApprove?: boolean
  createdAt: string
}

const RECEIPT_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/heic'
const RECEIPT_MAX = 4 * 1024 * 1024
const today = () => new Date().toISOString().slice(0, 10)

export async function uploadReceipt(expenseId: string, file: File) {
  if (file.size > RECEIPT_MAX) throw new Error('El comprobante excede 4 MB')
  const fd = new FormData()
  fd.append('file', file)
  return api<ExpenseDTO>(`/api/expenses/${expenseId}/receipt`, { method: 'POST', body: fd })
}

// ─── Form (create / edit) ──────────────────────────────────────────────────

export function ExpenseForm({
  projectId,
  initial,
  open,
  onClose,
  onSaved,
  defaultMarkup = 10,
}: {
  projectId: string
  initial: ExpenseDTO | null
  open: boolean
  onClose: () => void
  onSaved: (e: ExpenseDTO) => void
  defaultMarkup?: number
}) {
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('OTHER')
  const [vendor, setVendor] = useState('')
  const [phase, setPhase] = useState('')
  const [currency, setCurrency] = useState<'USD' | 'BOB'>('USD')
  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState('6.96')
  const [date, setDate] = useState(today())
  const [billable, setBillable] = useState(false)
  const [markup, setMarkup] = useState(String(defaultMarkup))
  const [paidByStaff, setPaidByStaff] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setFile(null)
    setDescription(initial?.description ?? '')
    setCategory(initial?.category ?? 'OTHER')
    setVendor(initial?.vendor ?? '')
    setPhase(initial?.phase ?? '')
    setCurrency(initial?.currency ?? 'USD')
    setAmount(initial ? String(initial.amountOriginal ?? initial.amountUSD) : '')
    setRate(initial && initial.currency === 'BOB' ? String(initial.exchangeRate) : '6.96')
    setDate(initial ? initial.incurredAt.slice(0, 10) : today())
    setBillable(initial?.billable ?? false)
    setMarkup(String(initial?.billable ? initial.markupPercent : defaultMarkup))
    setPaidByStaff(initial?.paidByStaff ?? false)
  }, [open, initial, defaultMarkup])

  const amt = Number(amount)
  const usd = currency === 'USD' ? amt : amt / (Number(rate) || 1)
  const billed = billable ? usd * (1 + (Number(markup) || 0) / 100) : 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!Number.isFinite(amt) || amt <= 0) return setError('Indica un monto mayor a cero')
    if (file && file.size > RECEIPT_MAX) return setError('El comprobante excede 4 MB')
    setSaving(true)
    setError(null)
    const body = JSON.stringify({
      description,
      category,
      vendor,
      phase: phase || null,
      currency,
      amount: amt,
      exchangeRate: Number(rate) || 6.96,
      incurredAt: date,
      billable,
      markupPercent: billable ? Number(markup) || 0 : 0,
      paidByStaff,
    })
    try {
      let saved = initial
        ? await api<ExpenseDTO>(`/api/expenses/${initial.id}`, { method: 'PUT', body })
        : await api<ExpenseDTO>(`/api/projects/${projectId}/expenses`, { method: 'POST', body })
      if (file) {
        try {
          saved = await uploadReceipt(saved.id, file)
        } catch (err) {
          // The expense is saved; surface the receipt problem on the detail view.
          onSaved(saved)
          alert(`El gasto se guardó, pero el comprobante no: ${err instanceof Error ? err.message : 'error'}`)
          return
        }
      }
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Editar gasto' : 'Registrar gasto'}
      description={initial?.status === 'REJECTED' ? 'Al guardar se reenvía para aprobación.' : 'Viajes, ploteos, renders, consultores, trámites…'}
      size="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <Input label="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} required minLength={3} maxLength={300} placeholder="Ej. Ploteo de planos DD para revisión del cliente" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Categoría" value={category} onChange={(e) => setCategory(e.target.value)} options={Object.entries(EXPENSE_CATEGORY).map(([value, label]) => ({ value, label }))} />
          <Input label="Proveedor" value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={160} placeholder="Opcional" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-[110px_1fr_1fr] gap-4">
          <Select label="Moneda" value={currency} onChange={(e) => setCurrency(e.target.value as 'USD' | 'BOB')} options={[{ value: 'USD', label: 'USD' }, { value: 'BOB', label: 'Bs' }]} />
          <Input label={`Monto (${currency === 'USD' ? 'USD' : 'Bs'})`} type="number" inputMode="decimal" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          {currency === 'BOB' ? (
            <Input label="Tipo de cambio (Bs/USD)" type="number" min={0.01} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} hint={amt > 0 ? `≈ ${formatCurrency(usd)}` : undefined} />
          ) : (
            <Input label="Fecha" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required />
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {currency === 'BOB' && <Input label="Fecha" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} required />}
          <Select
            label="Fase"
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            options={[{ value: '', label: 'General (sin fase)' }, ...Object.entries(PHASE).map(([value, p]) => ({ value, label: `${p.short} · ${p.label}` }))]}
          />
        </div>

        <div className="rounded-lg border border-g80 divide-y divide-g80">
          <label className="flex items-start gap-3 p-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-accent" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
            <span className="flex-1">
              <span className="block text-sm text-g10">Reembolsable por el cliente</span>
              <span className="block text-xs text-g40">Se refactura al cliente con recargo.</span>
            </span>
            {billable && (
              <span className="flex items-center gap-1.5" onClick={(e) => e.preventDefault()}>
                <input
                  aria-label="Recargo %"
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={markup}
                  onChange={(e) => setMarkup(e.target.value)}
                  className="w-16 h-8 px-2 text-right text-xs font-mono bg-g95 border border-g70 rounded text-g10 focus:outline-none focus:ring-1 focus:ring-accent/60"
                />
                <span className="text-xs text-g40">%</span>
              </span>
            )}
          </label>
          <label className="flex items-start gap-3 p-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-accent" checked={paidByStaff} onChange={(e) => setPaidByStaff(e.target.checked)} />
            <span>
              <span className="block text-sm text-g10">Lo pagué de mi bolsillo</span>
              <span className="block text-xs text-g40">Administración te lo reembolsa una vez aprobado.</span>
            </span>
          </label>
        </div>

        {billable && amt > 0 && (
          <p className="text-xs font-mono text-g40">
            Costo {formatCurrency(usd)} · se factura al cliente <span className="text-g10">{formatCurrency(billed)}</span>
          </p>
        )}

        <div>
          <input ref={fileRef} type="file" accept={RECEIPT_ACCEPT} className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center gap-2 rounded-lg border border-dashed border-g70 hover:border-g50 p-3 text-left text-sm text-g30"
          >
            <Paperclip className="w-4 h-4 text-g50" />
            {file ? (
              <span className="truncate text-g10">{file.name} · {(file.size / 1024).toFixed(0)} KB</span>
            ) : initial?.hasReceipt ? (
              <span>Reemplazar comprobante ({initial.receiptName})</span>
            ) : (
              <span>Adjuntar comprobante (factura, recibo o foto · máx. 4 MB)</span>
            )}
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={saving}>{initial ? 'Guardar' : 'Registrar'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Detail (review / reimburse / receipt) ───────────────────────────────────

export function ExpenseDetail({
  expense: e,
  currentUserId,
  canApprove,
  canReimburse,
  onClose,
  onEdit,
  onChanged,
}: {
  expense: ExpenseDTO | null
  currentUserId?: string
  canApprove: boolean
  canReimburse: boolean
  onClose: () => void
  onEdit: (e: ExpenseDTO) => void
  onChanged: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setError(null)
    setRejecting(false)
    setNote('')
  }, [e?.id])

  if (!e) return null
  const st = meta(EXPENSE_STATUS, e.status)
  const mine = !!currentUserId && e.submittedById === currentUserId
  const locked = !!e.invoice || e.status === 'REIMBURSED'
  const canEdit = !locked && (canApprove || (mine && e.status !== 'APPROVED'))
  const canReview = canApprove && e.status === 'SUBMITTED'

  const run = async (key: string, fn: () => Promise<unknown>, close = false) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
      setRejecting(false)
      await onChanged()
      if (close) onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción')
    } finally {
      setBusy(null)
    }
  }
  const act = (action: string, extra: Record<string, unknown> = {}) =>
    run(action, () => api(`/api/expenses/${e.id}/status`, { method: 'POST', body: JSON.stringify({ action, ...extra }) }))

  return (
    <Modal open onClose={onClose} title={e.description} description={`${e.project.code} · ${EXPENSE_CATEGORY[e.category] ?? e.category}`} size="lg">
      <div className="space-y-5">
        {error && <ErrorBanner message={error} />}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={st.variant} dot>{st.label}</Badge>
          {e.billable && <Badge variant="outline">Reembolsable{e.markupPercent ? ` +${e.markupPercent}%` : ''}</Badge>}
          {e.paidByStaff && <Badge variant="outline">Pagado por {e.submittedBy?.name ?? 'el equipo'}</Badge>}
          {e.phase && <Badge variant="outline">{PHASE[e.phase]?.short ?? e.phase}</Badge>}
          {e.invoice && (
            <Link href={`/finance?invoice=${e.invoice.id}`} className="text-2xs font-mono text-accent hover:underline">
              Facturado en {e.invoice.number}
            </Link>
          )}
        </div>

        <div className="grid grid-cols-3 gap-px bg-g80 border border-g80 rounded-lg overflow-hidden">
          {[
            { l: 'Costo', v: formatCurrency(e.amountUSD), sub: e.currency === 'BOB' && e.amountOriginal ? `Bs ${e.amountOriginal.toLocaleString('es-BO', { minimumFractionDigits: 2 })} @ ${e.exchangeRate}` : undefined },
            { l: 'A facturar', v: e.billable ? formatCurrency(e.billedAmountUSD) : '—' },
            { l: 'Fecha', v: formatDate(e.incurredAt) },
          ].map((k) => (
            <div key={k.l} className="bg-g85 p-3 min-w-0">
              <p className="text-2xs font-mono text-g40 uppercase tracking-wider">{k.l}</p>
              <p className="font-mono text-sm text-white mt-1 tabular truncate">{k.v}</p>
              {k.sub && <p className="text-2xs font-mono text-g50 truncate">{k.sub}</p>}
            </div>
          ))}
        </div>

        {e.vendor && <p className="text-sm text-g30">Proveedor: <span className="text-g10">{e.vendor}</span></p>}

        <div className="flex items-center gap-2 rounded-lg border border-g80 p-3">
          <Paperclip className="w-4 h-4 text-g50 flex-shrink-0" />
          {e.hasReceipt ? (
            <>
              <a href={`/api/expenses/${e.id}/receipt`} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 truncate text-sm text-accent hover:underline inline-flex items-center gap-1">
                {e.receiptName} <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
              {(mine || canApprove) && !locked && (
                <Button variant="ghost" size="sm" aria-label="Quitar comprobante" loading={busy === 'rm-receipt'} onClick={() => run('rm-receipt', () => api(`/api/expenses/${e.id}/receipt`, { method: 'DELETE' }))}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </>
          ) : (
            <span className="flex-1 text-sm text-g40">Sin comprobante</span>
          )}
          {(mine || canApprove) && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={RECEIPT_ACCEPT}
                className="hidden"
                onChange={(ev) => {
                  const f = ev.target.files?.[0]
                  ev.target.value = ''
                  if (f) run('receipt', () => uploadReceipt(e.id, f))
                }}
              />
              <Button variant="secondary" size="sm" loading={busy === 'receipt'} onClick={() => fileRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" /> {e.hasReceipt ? 'Reemplazar' : 'Adjuntar'}
              </Button>
            </>
          )}
        </div>

        <dl className="text-2xs font-mono text-g40 space-y-1">
          <div>Registrado {formatDate(e.createdAt)}{e.submittedBy ? ` · ${e.submittedBy.name}` : ''}</div>
          {e.reviewedBy && e.reviewedAt && (
            <div className={e.status === 'REJECTED' ? 'text-red-300' : 'text-green-300'}>
              {e.status === 'REJECTED' ? 'Rechazado' : 'Aprobado'} por {e.reviewedBy.name} el {formatDate(e.reviewedAt)}
            </div>
          )}
          {e.reviewNote && <div className="text-g30 normal-case">“{e.reviewNote}”</div>}
          {e.reimbursedAt && <div className="text-blue-300">Reembolsado el {formatDate(e.reimbursedAt)}</div>}
        </dl>

        {rejecting && (
          <div className="rounded-lg border border-g70 p-4 space-y-3">
            <Textarea label="Motivo del rechazo" value={note} onChange={(ev) => setNote(ev.target.value)} rows={2} placeholder="Ej. Falta la factura con NIT del estudio" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>Cancelar</Button>
              <Button variant="danger" size="sm" loading={busy === 'reject'} disabled={note.trim().length < 3} onClick={() => act('reject', { note })}>
                Rechazar gasto
              </Button>
            </div>
          </div>
        )}

        {!rejecting && (canEdit || canReview || (canReimburse && e.paidByStaff && e.status === 'APPROVED')) && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-g80 -mx-6 px-6 pt-4">
            {canEdit && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={busy === 'delete'}
                  onClick={() => confirm('¿Eliminar este gasto?') && run('delete', () => api(`/api/expenses/${e.id}`, { method: 'DELETE' }), true)}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onEdit(e)}>
                  {e.status === 'REJECTED' ? 'Corregir y reenviar' : 'Editar'}
                </Button>
              </>
            )}
            {canReview && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setRejecting(true)}><XCircle className="w-3.5 h-3.5" /> Rechazar</Button>
                <Button variant="success" size="sm" loading={busy === 'approve'} onClick={() => act('approve')}><CheckCircle2 className="w-3.5 h-3.5" /> Aprobar</Button>
              </>
            )}
            {canReimburse && e.paidByStaff && e.status === 'APPROVED' && (
              <Button size="sm" loading={busy === 'reimburse'} onClick={() => act('reimburse')}>
                <HandCoins className="w-3.5 h-3.5" /> Marcar reembolsado
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

export function ExpenseRow({ e, onClick, showProject }: { e: ExpenseDTO; onClick: () => void; showProject?: boolean }) {
  const st = meta(EXPENSE_STATUS, e.status)
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3.5 py-2.5 bg-g85 hover:bg-g80/60 text-left">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-g40">{formatDate(e.incurredAt)}</span>
          <Badge variant={st.variant} dot>{st.label}</Badge>
          {e.billable && <Badge variant="outline">{e.invoice ? e.invoice.number : 'Reembolsable'}</Badge>}
          {e.paidByStaff && e.status !== 'REIMBURSED' && <Badge variant="outline">Pagado por {e.submittedBy?.name.split(' ')[0] ?? 'equipo'}</Badge>}
          {e.hasReceipt && <Paperclip className="w-3 h-3 text-g50" aria-label="Con comprobante" />}
        </div>
        <p className="text-sm text-g10 truncate mt-0.5">{e.description}</p>
        {showProject && <p className="text-2xs text-g40 truncate"><span className="font-mono">{e.project.code}</span> · {e.project.name}</p>}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-mono tabular text-white">{formatCurrency(e.amountUSD)}</p>
        <p className={cn('text-2xs font-mono', e.billable ? 'text-g30' : 'text-g50')}>
          {e.billable ? `→ ${formatCurrency(e.billedAmountUSD)}` : EXPENSE_CATEGORY[e.category]}
        </p>
      </div>
    </button>
  )
}
