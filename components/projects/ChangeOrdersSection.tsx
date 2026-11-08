'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { FilePlus2, Plus, ChevronRight, Send, Undo2, Ban, CheckCircle2, XCircle, Receipt, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'
import { CHANGE_ORDER_KIND, CHANGE_ORDER_STATUS, PHASE, meta } from '@/lib/labels'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

export interface ChangeOrderDTO {
  id: string
  number: string
  kind: 'CHANGE_ORDER' | 'ADDITIONAL_SERVICE'
  title: string
  description: string
  reason: string
  phase: string | null
  feeUSD: number
  hours: number
  scheduleImpactDays: number
  status: string
  sentAt: string | null
  decidedAt: string | null
  decidedByName: string | null
  decisionNote: string
  decisionChannel: string | null
  createdAt: string
  createdBy?: { name: string }
  invoice: { id: string; number: string; status: string } | null
}

interface ListDTO {
  items: ChangeOrderDTO[]
  summary: { originalFeeUSD: number; approvedUSD: number; pendingUSD: number; currentFeeUSD: number; approvedDays: number; pendingCount: number }
  canManage: boolean
}

interface Props {
  projectId: string
  /** Contract figures changed (approval) — refresh the project */
  onContractChanged: () => void
}

const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + formatCurrency(Math.abs(n))
const days = (n: number) => (n === 0 ? 'sin impacto en plazo' : `${n > 0 ? '+' : '−'}${Math.abs(n)} días`)

export function ChangeOrdersSection({ projectId, onContractChanged }: Props) {
  const [data, setData] = useState<ListDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ChangeOrderDTO | 'new' | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await api<ListDTO>(`/api/projects/${projectId}/change-orders`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las órdenes de cambio')
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const current = data?.items.find((i) => i.id === viewing) ?? null
  const s = data?.summary

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-2xs font-mono text-g40 uppercase tracking-[0.14em] flex items-center gap-2">
          <FilePlus2 className="w-3.5 h-3.5" />
          Órdenes de cambio y servicios adicionales
        </h3>
        {data?.canManage && (
          <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
            <Plus className="w-3.5 h-3.5" /> Nueva
          </Button>
        )}
      </div>

      {error && <div className="mb-3"><ErrorBanner message={error} onRetry={load} /></div>}

      {!data ? (
        <Skeleton className="h-16" />
      ) : (
        <>
          {(s!.approvedUSD !== 0 || s!.pendingUSD !== 0) && (
            <div className="grid grid-cols-3 gap-px bg-g80 border border-g80 rounded-lg overflow-hidden mb-3">
              {[
                { l: 'Contrato original', v: formatCurrency(s!.originalFeeUSD) },
                { l: 'Cambios aprobados', v: signed(s!.approvedUSD), tone: s!.approvedUSD > 0 ? 'text-green-400' : s!.approvedUSD < 0 ? 'text-red-400' : '' },
                { l: 'Pendiente cliente', v: s!.pendingCount ? signed(s!.pendingUSD) : '—', tone: s!.pendingCount ? 'text-yellow-400' : '' },
              ].map((k) => (
                <div key={k.l} className="bg-g85 p-3">
                  <p className="text-2xs font-mono text-g40 uppercase tracking-wider">{k.l}</p>
                  <p className={cn('font-mono text-sm text-white mt-1 tabular', k.tone)}>{k.v}</p>
                </div>
              ))}
            </div>
          )}

          {data.items.length === 0 ? (
            <p className="text-sm text-g40">
              Sin órdenes de cambio. Registra cambios de alcance o servicios fuera de contrato; el cliente los aprueba desde su portal y el honorario del proyecto se actualiza solo.
            </p>
          ) : (
            <ul className="divide-y divide-g80 border border-g80 rounded-lg overflow-hidden">
              {data.items.map((co) => {
                const st = meta(CHANGE_ORDER_STATUS, co.status)
                return (
                  <li key={co.id}>
                    <button onClick={() => setViewing(co.id)} className="w-full flex items-center gap-3 px-3.5 py-2.5 bg-g85 hover:bg-g80/60 text-left">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-g40">{co.number}</span>
                          <Badge variant={st.variant} dot>{st.label}</Badge>
                          {co.invoice && <Badge variant="outline">{co.invoice.number}</Badge>}
                        </div>
                        <p className="text-sm text-g10 truncate mt-0.5">{co.title}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={cn('text-sm font-mono tabular', co.feeUSD < 0 ? 'text-red-300' : 'text-white')}>{signed(co.feeUSD)}</p>
                        <p className="text-2xs font-mono text-g40">{CHANGE_ORDER_KIND[co.kind]}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-g50 flex-shrink-0" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {typeof document !== 'undefined' &&
        createPortal(
          <>
            <ChangeOrderForm
              projectId={projectId}
              initial={editing === 'new' ? null : editing}
              open={editing !== null}
              onClose={() => setEditing(null)}
              onSaved={async (co) => {
                setEditing(null)
                await load()
                setViewing(co.id)
              }}
            />
            <ChangeOrderDetail
              co={current}
              canManage={!!data?.canManage}
              onClose={() => setViewing(null)}
              onEdit={(co) => {
                setViewing(null)
                setEditing(co)
              }}
              onChanged={async (contractChanged) => {
                await load()
                if (contractChanged) onContractChanged()
              }}
            />
          </>,
          document.body
        )}
    </section>
  )
}

// ─── Form ────────────────────────────────────────────────────────────────

function ChangeOrderForm({
  projectId,
  initial,
  open,
  onClose,
  onSaved,
}: {
  projectId: string
  initial: ChangeOrderDTO | null
  open: boolean
  onClose: () => void
  onSaved: (co: ChangeOrderDTO) => void
}) {
  const [kind, setKind] = useState('CHANGE_ORDER')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [reason, setReason] = useState('')
  const [phase, setPhase] = useState('')
  const [sign, setSign] = useState<'add' | 'credit'>('add')
  const [amount, setAmount] = useState('')
  const [hours, setHours] = useState('')
  const [impact, setImpact] = useState('0')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setKind(initial?.kind ?? 'CHANGE_ORDER')
    setTitle(initial?.title ?? '')
    setDescription(initial?.description ?? '')
    setReason(initial?.reason ?? '')
    setPhase(initial?.phase ?? '')
    setSign(initial && initial.feeUSD < 0 ? 'credit' : 'add')
    setAmount(initial ? String(Math.abs(initial.feeUSD)) : '')
    setHours(initial?.hours ? String(initial.hours) : '')
    setImpact(String(initial?.scheduleImpactDays ?? 0))
  }, [open, initial])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const fee = Number(amount)
    if (!Number.isFinite(fee) || fee <= 0) return setError('Indica un monto mayor a cero')
    if (kind === 'ADDITIONAL_SERVICE' && sign === 'credit') return setError('Un servicio adicional no puede ser un crédito')
    setSaving(true)
    setError(null)
    const body = JSON.stringify({
      kind,
      title,
      description,
      reason,
      phase: phase || null,
      feeUSD: sign === 'credit' ? -fee : fee,
      hours: Number(hours) || 0,
      scheduleImpactDays: Math.round(Number(impact) || 0),
    })
    try {
      const co = initial
        ? await api<ChangeOrderDTO>(`/api/change-orders/${initial.id}`, { method: 'PUT', body })
        : await api<ChangeOrderDTO>(`/api/projects/${projectId}/change-orders`, { method: 'POST', body })
      onSaved(co)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Editar ${initial.number}` : 'Nueva orden de cambio'} description="Se guarda como borrador; envíala al cliente cuando esté lista." size="lg">
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Tipo"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value)
              if (e.target.value === 'ADDITIONAL_SERVICE') setSign('add')
            }}
            options={Object.entries(CHANGE_ORDER_KIND).map(([value, label]) => ({ value, label }))}
          />
          <Select
            label="Fase afectada"
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
            options={[{ value: '', label: 'Fase actual del proyecto' }, ...Object.entries(PHASE).map(([value, p]) => ({ value, label: `${p.short} · ${p.label}` }))]}
          />
        </div>
        <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={200} placeholder="Ej. Ampliación de terraza en planta alta" />
        <Textarea label="Descripción del alcance" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Qué se agrega, modifica o elimina respecto al contrato." />
        <Textarea label="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Solicitud del cliente, condición de obra, cambio normativo…" />
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 items-end">
          {kind === 'CHANGE_ORDER' ? (
            <div className="space-y-1.5">
              <span className="block text-xs text-g30">Efecto</span>
              <div role="radiogroup" aria-label="Efecto en honorario" className="flex h-10 rounded-md border border-g70 overflow-hidden">
                {(['add', 'credit'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={sign === k}
                    onClick={() => setSign(k)}
                    className={cn('px-3 text-xs font-mono', sign === k ? 'bg-g70 text-white' : 'bg-g95 text-g40 hover:text-g10')}
                  >
                    {k === 'add' ? '+ Adicional' : '− Crédito'}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div />
          )}
          <Input label="Honorario (USD)" type="number" inputMode="decimal" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Horas estimadas" type="number" min={0} step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} hint="Uso interno" />
          <Input label="Impacto en plazo (días)" type="number" min={-365} max={730} step="1" value={impact} onChange={(e) => setImpact(e.target.value)} hint="Negativo acorta el plazo" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={saving}>{initial ? 'Guardar' : 'Crear borrador'}</Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Detail ──────────────────────────────────────────────────────────────

function ChangeOrderDetail({
  co,
  canManage,
  onClose,
  onEdit,
  onChanged,
}: {
  co: ChangeOrderDTO | null
  canManage: boolean
  onClose: () => void
  onEdit: (co: ChangeOrderDTO) => void
  onChanged: (contractChanged: boolean) => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [record, setRecord] = useState<'approve' | 'reject' | null>(null)
  const [signedBy, setSignedBy] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    setError(null)
    setRecord(null)
    setSignedBy('')
    setNote('')
  }, [co?.id])

  if (!co) return null
  const st = meta(CHANGE_ORDER_STATUS, co.status)
  const hasActions = co.status === 'DRAFT' || co.status === 'SENT' || (co.status === 'APPROVED' && co.feeUSD > 0 && !co.invoice)

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action)
    setError(null)
    try {
      await api(`/api/change-orders/${co.id}/status`, { method: 'POST', body: JSON.stringify({ action, ...extra }) })
      setRecord(null)
      await onChanged(action === 'approve')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción')
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    if (!confirm(`¿Eliminar el borrador ${co.number}?`)) return
    setBusy('delete')
    try {
      await api(`/api/change-orders/${co.id}`, { method: 'DELETE' })
      onClose()
      await onChanged(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open onClose={onClose} title={co.title} description={`${co.number} · ${CHANGE_ORDER_KIND[co.kind]}`} size="lg">
      <div className="space-y-5">
        {error && <ErrorBanner message={error} />}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={st.variant} dot>{st.label}</Badge>
          <Badge variant="outline">Fase {co.phase ? PHASE[co.phase]?.label ?? co.phase : 'actual'}</Badge>
          {co.invoice && (
            <Link href={`/finance?invoice=${co.invoice.id}`} className="text-2xs font-mono text-accent hover:underline">
              Factura {co.invoice.number}
            </Link>
          )}
        </div>

        <div className="grid grid-cols-3 gap-px bg-g80 border border-g80 rounded-lg overflow-hidden">
          {[
            { l: 'Honorario', v: signed(co.feeUSD), tone: co.feeUSD < 0 ? 'text-red-300' : '' },
            { l: 'Plazo', v: days(co.scheduleImpactDays) },
            { l: 'Horas', v: co.hours ? `${co.hours.toLocaleString('es-BO')} h` : '—' },
          ].map((k) => (
            <div key={k.l} className="bg-g85 p-3">
              <p className="text-2xs font-mono text-g40 uppercase tracking-wider">{k.l}</p>
              <p className={cn('font-mono text-sm text-white mt-1 tabular', k.tone)}>{k.v}</p>
            </div>
          ))}
        </div>

        {co.description && (
          <div>
            <p className="text-2xs font-mono text-g40 uppercase tracking-wider mb-1">Alcance</p>
            <p className="text-sm text-g20 whitespace-pre-line">{co.description}</p>
          </div>
        )}
        {co.reason && (
          <div>
            <p className="text-2xs font-mono text-g40 uppercase tracking-wider mb-1">Motivo</p>
            <p className="text-sm text-g20 whitespace-pre-line">{co.reason}</p>
          </div>
        )}

        <dl className="text-2xs font-mono text-g40 space-y-1">
          <div>Creada {formatDate(co.createdAt)}{co.createdBy ? ` · ${co.createdBy.name}` : ''}</div>
          {co.sentAt && <div>Enviada al cliente {formatDate(co.sentAt)}</div>}
          {co.decidedAt && (
            <div className={co.status === 'APPROVED' ? 'text-green-300' : 'text-red-300'}>
              {co.status === 'APPROVED' ? 'Aprobada' : 'Rechazada'} por {co.decidedByName} el {formatDate(co.decidedAt)}
              {co.decisionChannel === 'PORTAL' ? ' en el portal' : ' (registrada por el estudio)'}
            </div>
          )}
          {co.decisionNote && <div className="text-g30 normal-case">“{co.decisionNote}”</div>}
        </dl>

        {co.status === 'SENT' && (
          <p className="text-xs text-g30 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
            El cliente la ve en su portal y puede aprobarla o rechazarla. Si firmó una copia impresa, registra su decisión aquí.
          </p>
        )}

        {record && (
          <div className="rounded-lg border border-g70 p-4 space-y-3">
            <p className="text-sm text-g10">{record === 'approve' ? 'Registrar aprobación firmada' : 'Registrar rechazo del cliente'}</p>
            <Input label="Firmado por (cliente)" value={signedBy} onChange={(e) => setSignedBy(e.target.value)} placeholder="Nombre de quien firmó" />
            <Textarea label="Nota" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRecord(null)}>Cancelar</Button>
              <Button
                size="sm"
                variant={record === 'approve' ? 'success' : 'danger'}
                loading={busy === record}
                disabled={signedBy.trim().length < 2}
                onClick={() => act(record, { signedBy, note })}
              >
                Confirmar
              </Button>
            </div>
          </div>
        )}

        {canManage && !record && hasActions && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-g80 -mx-6 px-6 pt-4">
            {co.status === 'DRAFT' && (
              <>
                <Button variant="ghost" size="sm" onClick={remove} loading={busy === 'delete'}><Trash2 className="w-3.5 h-3.5" /> Eliminar</Button>
                <Button variant="secondary" size="sm" onClick={() => onEdit(co)}>Editar</Button>
                <Button size="sm" onClick={() => act('send')} loading={busy === 'send'}><Send className="w-3.5 h-3.5" /> Enviar al cliente</Button>
              </>
            )}
            {co.status === 'SENT' && (
              <>
                <Button variant="ghost" size="sm" onClick={() => act('void')} loading={busy === 'void'}><Ban className="w-3.5 h-3.5" /> Anular</Button>
                <Button variant="ghost" size="sm" onClick={() => act('withdraw')} loading={busy === 'withdraw'}><Undo2 className="w-3.5 h-3.5" /> Retirar y editar</Button>
                <Button variant="secondary" size="sm" onClick={() => setRecord('reject')}><XCircle className="w-3.5 h-3.5" /> Registrar rechazo</Button>
                <Button variant="success" size="sm" onClick={() => setRecord('approve')}><CheckCircle2 className="w-3.5 h-3.5" /> Registrar aprobación</Button>
              </>
            )}
            {co.status === 'APPROVED' && co.feeUSD > 0 && !co.invoice && (
              <Button size="sm" onClick={() => act('invoice')} loading={busy === 'invoice'}><Receipt className="w-3.5 h-3.5" /> Crear factura (borrador)</Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
