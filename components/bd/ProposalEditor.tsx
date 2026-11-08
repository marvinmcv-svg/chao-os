'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Send, CheckCircle2, XCircle, Copy, FileText, Wand2, Save } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input, Textarea, fieldClass } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'
import { CONTRACT_TYPE, PHASE, PROPOSAL_STATUS, USER_ROLE, meta } from '@/lib/labels'
import { STAFF_ROLES, buildTemplatePhases, computeProposal, type FeePhase, type StaffRole } from '@/lib/fees'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

export interface ProposalDTO {
  id: string
  number: string
  version: number
  status: string
  contractType: string
  areaM2: number | null
  discountPercent: number
  phases: FeePhase[]
  scope: string
  exclusions: string
  paymentTerms: string
  validUntil: string
  sentAt: string | null
  decidedAt: string | null
  canEdit: boolean
  rateCard: Record<StaffRole, number>
  costRates?: Record<string, number>
  defaultCostRate?: number
  lead?: { id: string; projectName: string; company: string; projectType: string; convertedToProjectId: string | null }
  createdBy?: { name: string }
}

interface Props {
  proposalId: string | null
  open: boolean
  onClose: () => void
  /** Called after any server change (save, status, new version) */
  onChanged: (next?: ProposalDTO) => void
}

const num = (v: string) => (v === '' || Number.isNaN(Number(v)) ? 0 : Number(v))
const dayKey = (iso: string) => iso.slice(0, 10)

export function ProposalEditor({ proposalId, open, onClose, onChanged }: Props) {
  const [p, setP] = useState<ProposalDTO | null>(null)
  const [draft, setDraft] = useState<ProposalDTO | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [areaInput, setAreaInput] = useState('')

  const load = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await api<ProposalDTO>(`/api/proposals/${id}`)
      setP(data)
      setDraft(data)
      setAreaInput(data.areaM2 ? String(data.areaM2) : '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la propuesta')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && proposalId) load(proposalId)
    if (!open) {
      setP(null)
      setDraft(null)
    }
  }, [open, proposalId, load])

  const editable = !!draft && draft.canEdit && draft.status === 'DRAFT'
  const dirty = useMemo(() => JSON.stringify(p) !== JSON.stringify(draft), [p, draft])

  const totals = useMemo(
    () =>
      draft
        ? computeProposal(draft.phases, {
            discountPercent: draft.discountPercent,
            costRates: draft.costRates,
            defaultCostRate: draft.defaultCostRate,
          })
        : null,
    [draft],
  )

  // ─── local edits ─────────────────────────────────────────────────────────
  const set = <K extends keyof ProposalDTO>(k: K, v: ProposalDTO[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d))
  const setPhase = (i: number, patch: Partial<FeePhase>) =>
    setDraft((d) => (d ? { ...d, phases: d.phases.map((ph, j) => (j === i ? { ...ph, ...patch } : ph)) } : d))
  const setLine = (i: number, li: number, patch: Partial<FeePhase['lines'][number]>) =>
    setPhase(i, { lines: draft!.phases[i].lines.map((l, k) => (k === li ? { ...l, ...patch } : l)) })
  const addLine = (i: number) =>
    setPhase(i, {
      lines: [...draft!.phases[i].lines, { role: 'ARCHITECT', description: '', hours: 0, rateUSD: draft!.rateCard.ARCHITECT }],
    })
  const removeLine = (i: number, li: number) => setPhase(i, { lines: draft!.phases[i].lines.filter((_, k) => k !== li) })

  const applyTemplate = () => {
    if (!draft) return
    const area = num(areaInput)
    const hasHours = draft.phases.some((ph) => ph.lines.some((l) => l.hours > 0))
    if (hasHours && !window.confirm('Esto reemplaza las horas de todas las fases con la estimación por área. ¿Continuar?')) return
    setDraft({
      ...draft,
      areaM2: area || null,
      phases: buildTemplatePhases({ areaM2: area, projectType: draft.lead?.projectType, rates: draft.rateCard }),
    })
  }

  // ─── server actions ──────────────────────────────────────────────────────
  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción')
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    if (!draft) return null
    const saved = await api<ProposalDTO>(`/api/proposals/${draft.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        contractType: draft.contractType,
        areaM2: draft.areaM2,
        discountPercent: draft.discountPercent,
        phases: draft.phases,
        scope: draft.scope,
        exclusions: draft.exclusions,
        paymentTerms: draft.paymentTerms,
        validUntil: dayKey(draft.validUntil),
      }),
    })
    setP(saved)
    setDraft(saved)
    return saved
  }

  const onSave = () => run('save', async () => onChanged((await save()) ?? undefined))

  const transition = (action: 'send' | 'accept' | 'decline' | 'revise') =>
    run(action, async () => {
      if (action === 'send' && dirty) await save()
      if (action === 'accept' && !window.confirm('Marcar como aceptada mueve el lead a Ganado y fija este honorario como presupuesto del proyecto. ¿Continuar?')) return
      const next = await api<ProposalDTO>(`/api/proposals/${draft!.id}/status`, { method: 'POST', body: JSON.stringify({ action }) })
      setP(next)
      setDraft(next)
      setAreaInput(next.areaM2 ? String(next.areaM2) : '')
      onChanged(next)
    })

  const discard = () =>
    run('delete', async () => {
      if (!window.confirm('¿Eliminar este borrador?')) return
      await api(`/api/proposals/${draft!.id}`, { method: 'DELETE' })
      onChanged()
      onClose()
    })

  const openPdf = async () => {
    if (editable && dirty) await run('save', async () => void (await save()))
    window.open(`/proposals/${draft!.id}/print`, '_blank', 'noopener')
  }

  if (!open) return null
  const status = draft ? meta(PROPOSAL_STATUS, draft.status) : null
  const showCost = !!draft?.canEdit && totals?.costUSD != null

  return (
    <Modal
      open={open}
      onClose={() => {
        if (editable && dirty && !window.confirm('Hay cambios sin guardar. ¿Cerrar de todos modos?')) return
        onClose()
      }}
      title={draft ? `Propuesta ${draft.number} · v${draft.version}` : 'Propuesta de honorarios'}
      description={draft?.lead ? `${draft.lead.projectName} — ${draft.lead.company}` : undefined}
      size="xl"
      className="sm:max-w-6xl"
    >
      {error && <div className="mb-4"><ErrorBanner message={error} /></div>}
      {loading && !draft ? (
        <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>
      ) : draft && totals && status ? (
        <div className="space-y-6">
          {/* Status + actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status.variant} dot>{status.label}</Badge>
            {draft.sentAt && <span className="text-2xs font-mono text-g40">Enviada {formatDate(draft.sentAt)}</span>}
            {draft.decidedAt && <span className="text-2xs font-mono text-g40">· Decisión {formatDate(draft.decidedAt)}</span>}
            <div className="flex flex-wrap gap-2 ml-auto">
              <Button size="sm" variant="secondary" onClick={openPdf}><FileText className="w-3.5 h-3.5" /> Ver PDF</Button>
              {editable && (
                <>
                  <Button size="sm" variant="ghost" onClick={discard} loading={busy === 'delete'}><Trash2 className="w-3.5 h-3.5" /> Eliminar</Button>
                  <Button size="sm" variant="secondary" onClick={onSave} loading={busy === 'save'} disabled={!dirty}><Save className="w-3.5 h-3.5" /> Guardar</Button>
                  <Button size="sm" onClick={() => transition('send')} loading={busy === 'send'}><Send className="w-3.5 h-3.5" /> Marcar enviada</Button>
                </>
              )}
              {draft.canEdit && draft.status === 'SENT' && (
                <>
                  <Button size="sm" variant="danger" onClick={() => transition('decline')} loading={busy === 'decline'}><XCircle className="w-3.5 h-3.5" /> Rechazada</Button>
                  <Button size="sm" variant="success" onClick={() => transition('accept')} loading={busy === 'accept'}><CheckCircle2 className="w-3.5 h-3.5" /> Aceptada</Button>
                </>
              )}
              {draft.canEdit && ['SENT', 'DECLINED', 'SUPERSEDED'].includes(draft.status) && !draft.lead?.convertedToProjectId && (
                <Button size="sm" variant="secondary" onClick={() => transition('revise')} loading={busy === 'revise'}><Copy className="w-3.5 h-3.5" /> Nueva versión</Button>
              )}
            </div>
          </div>
          {!draft.canEdit && <p className="text-xs text-g40">Vista de solo lectura. Dirección y arquitectos senior gestionan las propuestas.</p>}
          {draft.canEdit && !editable && draft.status !== 'ACCEPTED' && (
            <p className="text-xs text-g40">Esta versión ya no es editable. Crea una nueva versión para cambiarla.</p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
            <div className="space-y-6 min-w-0">
              {/* Header fields */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Select
                  label="Contrato"
                  value={draft.contractType}
                  disabled={!editable}
                  onChange={(e) => set('contractType', e.target.value)}
                  options={Object.entries(CONTRACT_TYPE).map(([value, label]) => ({ value, label }))}
                />
                <Input label="Válida hasta" type="date" value={dayKey(draft.validUntil)} disabled={!editable} onChange={(e) => set('validUntil', `${e.target.value}T00:00:00.000Z`)} />
                <Input
                  label="Descuento %"
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={String(draft.discountPercent)}
                  disabled={!editable}
                  onChange={(e) => set('discountPercent', Math.min(50, Math.max(0, num(e.target.value))))}
                />
                <div className="space-y-1.5">
                  <label htmlFor="pp-area" className="block text-2xs font-mono text-g40 uppercase tracking-wider">Área m²</label>
                  <div className="flex gap-1.5">
                    <input
                      id="pp-area"
                      type="number"
                      min={0}
                      value={areaInput}
                      disabled={!editable}
                      onChange={(e) => setAreaInput(e.target.value)}
                      className={cn(fieldClass, 'h-10 px-3 border-g70 min-w-0')}
                      placeholder="ej. 850"
                    />
                    {editable && (
                      <Button variant="secondary" size="icon" onClick={applyTemplate} title="Estimar horas por área" aria-label="Estimar horas por área" disabled={!num(areaInput)}>
                        <Wand2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Phases */}
              <div className="space-y-4">
                {draft.phases.map((ph, i) => {
                  const pt = totals.phases[i]
                  return (
                    <section key={ph.phase} className={cn('rounded-lg border border-g80 bg-g85', !ph.included && 'opacity-60')}>
                      <header className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-g80">
                        <span className="font-mono text-2xs text-accent w-6">{PHASE[ph.phase]?.short ?? ph.phase}</span>
                        {editable ? (
                          <input
                            aria-label={`Nombre de la fase ${ph.phase}`}
                            value={ph.label}
                            onChange={(e) => setPhase(i, { label: e.target.value })}
                            className="flex-1 min-w-[140px] bg-transparent text-sm text-white font-semibold focus:outline-none focus:ring-1 focus:ring-accent/60 rounded px-1"
                          />
                        ) : (
                          <span className="flex-1 min-w-[140px] text-sm text-white font-semibold">{ph.label}</span>
                        )}
                        <label className="flex items-center gap-1.5 text-2xs font-mono text-g40">
                          <input
                            type="number"
                            min={0}
                            aria-label={`Semanas de ${ph.label}`}
                            value={ph.durationWeeks}
                            disabled={!editable}
                            onChange={(e) => setPhase(i, { durationWeeks: Math.max(0, Math.round(num(e.target.value))) })}
                            className="w-12 h-7 px-1.5 text-right bg-g95 border border-g70 rounded text-g10 tabular"
                          />
                          sem
                        </label>
                        <label className="flex items-center gap-1.5 text-2xs font-mono text-g40 cursor-pointer">
                          <input type="checkbox" checked={ph.included} disabled={!editable} onChange={(e) => setPhase(i, { included: e.target.checked })} />
                          Incluida
                        </label>
                        <span className="text-sm font-mono text-white tabular ml-auto" title={draft.discountPercent ? `Con descuento: ${formatCurrency(pt.feeUSD)}` : undefined}>{formatCurrency(pt.grossUSD)}</span>
                      </header>
                      {ph.included && (
                        <div className="px-4 py-3 overflow-x-auto">
                          <table className="w-full text-sm min-w-[560px]">
                            <thead>
                              <tr className="text-2xs font-mono text-g40 uppercase">
                                <th className="text-left font-normal pb-2 w-40">Rol</th>
                                <th className="text-left font-normal pb-2">Tarea</th>
                                <th className="text-right font-normal pb-2 w-20">Horas</th>
                                <th className="text-right font-normal pb-2 w-24">USD/h</th>
                                <th className="text-right font-normal pb-2 w-28">Subtotal</th>
                                {editable && <th className="w-8" />}
                              </tr>
                            </thead>
                            <tbody>
                              {ph.lines.map((l, li) => (
                                <tr key={li} className="border-t border-g80/60">
                                  <td className="py-1.5 pr-2">
                                    {editable ? (
                                      <select
                                        aria-label="Rol"
                                        value={l.role}
                                        onChange={(e) => {
                                          const role = e.target.value as StaffRole
                                          setLine(i, li, { role, rateUSD: draft.rateCard[role] })
                                        }}
                                        className="w-full h-8 px-2 bg-g95 border border-g70 rounded text-xs text-g10"
                                      >
                                        {STAFF_ROLES.map((r) => <option key={r} value={r}>{USER_ROLE[r]}</option>)}
                                      </select>
                                    ) : (
                                      <span className="text-g20 text-xs">{USER_ROLE[l.role]}</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    {editable ? (
                                      <input aria-label="Tarea" value={l.description} onChange={(e) => setLine(i, li, { description: e.target.value })} className="w-full h-8 px-2 bg-g95 border border-g70 rounded text-xs text-g10" />
                                    ) : (
                                      <span className="text-g30 text-xs">{l.description}</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 pl-2 text-right">
                                    {editable ? (
                                      <input aria-label="Horas" type="number" min={0} value={l.hours} onChange={(e) => setLine(i, li, { hours: Math.max(0, num(e.target.value)) })} className="w-full h-8 px-2 text-right bg-g95 border border-g70 rounded text-xs text-g10 tabular" />
                                    ) : (
                                      <span className="font-mono text-xs tabular">{l.hours}</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 pl-2 text-right">
                                    {editable ? (
                                      <input aria-label="Tarifa USD por hora" type="number" min={0} value={l.rateUSD} onChange={(e) => setLine(i, li, { rateUSD: Math.max(0, num(e.target.value)) })} className="w-full h-8 px-2 text-right bg-g95 border border-g70 rounded text-xs text-g10 tabular" />
                                    ) : (
                                      <span className="font-mono text-xs tabular">{l.rateUSD}</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 pl-2 text-right font-mono text-xs text-g10 tabular">{formatCurrency(l.hours * l.rateUSD)}</td>
                                  {editable && (
                                    <td className="py-1.5 pl-1 text-right">
                                      <button onClick={() => removeLine(i, li)} className="p-1 text-g50 hover:text-red-300" aria-label="Quitar línea"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </td>
                                  )}
                                </tr>
                              ))}
                              {ph.lines.length === 0 && (
                                <tr><td colSpan={6} className="py-3 text-xs text-g50">Sin horas. Agrega una línea o estima por área.</td></tr>
                              )}
                            </tbody>
                          </table>
                          <div className="flex items-center justify-between mt-2">
                            {editable ? (
                              <Button size="sm" variant="ghost" onClick={() => addLine(i)}><Plus className="w-3.5 h-3.5" /> Línea</Button>
                            ) : <span />}
                            <span className="text-2xs font-mono text-g40 tabular">{pt.hours} h · {pt.sharePercent}% del total</span>
                          </div>
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Textarea label="Alcance" rows={5} value={draft.scope} disabled={!editable} onChange={(e) => set('scope', e.target.value)} />
                <Textarea label="Exclusiones" rows={5} value={draft.exclusions} disabled={!editable} onChange={(e) => set('exclusions', e.target.value)} />
                <div className="md:col-span-2">
                  <Textarea label="Forma de pago" rows={3} value={draft.paymentTerms} disabled={!editable} onChange={(e) => set('paymentTerms', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Summary */}
            <aside className="space-y-4 lg:sticky lg:top-0 self-start">
              <div className="rounded-lg border border-g80 bg-g85 p-4 space-y-2">
                <p className="text-2xs font-mono text-g40 uppercase tracking-wider">Honorario propuesto</p>
                <p className="font-display text-3xl text-white tabular">{formatCurrency(totals.feeUSD)}</p>
                <Row label="Subtotal" value={formatCurrency(totals.subtotalUSD)} />
                {totals.discountUSD > 0 && <Row label={`Descuento ${draft.discountPercent}%`} value={`−${formatCurrency(totals.discountUSD)}`} />}
                <Row label="Horas" value={`${totals.hours.toLocaleString('es-BO')} h`} />
                <Row label="Tarifa promedio" value={`${formatCurrency(totals.blendedRateUSD)}/h`} />
                <Row label="Duración" value={`${totals.durationWeeks} semanas`} />
              </div>
              {showCost && (
                <div className="rounded-lg border border-g80 bg-g85 p-4 space-y-2">
                  <p className="text-2xs font-mono text-g40 uppercase tracking-wider">Interno · no se muestra al cliente</p>
                  <Row label="Costo estimado" value={formatCurrency(totals.costUSD)} />
                  <Row label="Margen" value={formatCurrency(totals.marginUSD)} />
                  <div className="flex items-center justify-between">
                    <span className="text-2xs font-mono text-g40 uppercase">Margen %</span>
                    <span className={cn('text-sm font-mono tabular', totals.marginPercent < 20 ? 'text-red-300' : totals.marginPercent < 35 ? 'text-yellow-300' : 'text-green-300')}>
                      {totals.marginPercent}%
                    </span>
                  </div>
                  {totals.feeUSD > 0 && totals.marginPercent < 20 && <p className="text-xs text-red-300">Margen bajo: revisa horas, tarifas o descuento.</p>}
                </div>
              )}
              <div className="rounded-lg border border-g80 bg-g85 p-4">
                <p className="text-2xs font-mono text-g40 uppercase tracking-wider mb-2">Distribución por fase</p>
                <div className="flex h-2 rounded overflow-hidden bg-g80" aria-hidden="true">
                  {totals.phases.map((pt, k) => (
                    <div key={pt.phase} style={{ width: `${pt.sharePercent}%` }} className={['bg-accent', 'bg-blue-400', 'bg-green-400', 'bg-yellow-300'][k]} />
                  ))}
                </div>
                <ul className="mt-3 space-y-1">
                  {totals.phases.map((pt, k) => (
                    <li key={pt.phase} className="flex items-center gap-2 text-xs">
                      <span className={cn('w-2 h-2 rounded-sm', ['bg-accent', 'bg-blue-400', 'bg-green-400', 'bg-yellow-300'][k])} />
                      <span className="text-g30 flex-1 truncate">{pt.label}</span>
                      <span className="font-mono text-g10 tabular">{pt.sharePercent}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              {draft.status === 'ACCEPTED' && (
                <p className="text-xs text-green-300">Aceptada. Al convertir el lead, este honorario y sus fases serán el presupuesto del proyecto.</p>
              )}
            </aside>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-2xs font-mono text-g40 uppercase">{label}</span>
      <span className="text-sm font-mono text-g10 tabular">{value}</span>
    </div>
  )
}
