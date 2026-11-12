'use client'

import { useCallback, useEffect, useState } from 'react'
import { Calculator, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'
import { PHASE } from '@/lib/labels'
import { cn, formatCurrency, getRelativeTime } from '@/lib/utils'

interface PhaseCost {
  phase: string
  budgetUSD: number
  spentUSD: number
  openingSpentUSD: number
  laborCostUSD: number
  expenseCostUSD: number
}
interface Breakdown {
  totalBudgetUSD: number
  totalSpentUSD: number
  laborCostUSD: number
  laborHours: number
  expenseCostUSD: number
  costsDerivedAt: string | null
  phases: PhaseCost[]
  unphased: { laborCostUSD: number; expenseCostUSD: number; openingSpentUSD: number }
  canEdit: boolean
}

const fmt = (n: number) => (n ? formatCurrency(n) : '—')

/**
 * Where the project's spend comes from: labour (timesheets × snapshotted
 * cost rate), approved expenses and the opening balance (cost incurred
 * before CHAO OS). Principals/admins can adjust opening balances.
 */
export function CostBreakdown({ projectId, version, onChanged }: { projectId: string; version?: unknown; onChanged: () => void }) {
  const [data, setData] = useState<Breakdown | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await api<Breakdown>(`/api/projects/${projectId}/costs`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el costo')
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load, version])

  const startEdit = () => {
    if (!data) return
    const d: Record<string, string> = { _: String(data.unphased.openingSpentUSD) }
    for (const p of data.phases) d[p.phase] = String(p.openingSpentUSD)
    setDraft(d)
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const phases: Record<string, number> = {}
      for (const p of data!.phases) phases[p.phase] = Number(draft[p.phase]) || 0
      setData(await api<Breakdown>(`/api/projects/${projectId}/costs`, { method: 'PUT', body: JSON.stringify({ phases, unphasedUSD: Number(draft._) || 0 }) }))
      setEditing(false)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const unph = data ? data.unphased.laborCostUSD + data.unphased.expenseCostUSD + data.unphased.openingSpentUSD : 0
  const input = 'w-24 h-7 px-2 text-right text-xs font-mono bg-g95 border border-g70 rounded text-g10 focus:outline-none focus:ring-1 focus:ring-accent/60 tabular'

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-2xs font-mono text-g40 uppercase tracking-[0.14em] flex items-center gap-2">
          <Calculator className="w-3.5 h-3.5" /> Costo real
        </h3>
        {data?.canEdit && !editing && (
          <Button size="sm" variant="ghost" onClick={startEdit}><Pencil className="w-3.5 h-3.5" /> Saldos iniciales</Button>
        )}
      </div>
      {error && <div className="mb-3"><ErrorBanner message={error} onRetry={load} /></div>}
      {!data ? (
        <Skeleton className="h-28" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-px bg-g80 border border-g80 rounded-lg overflow-hidden mb-3">
            {[
              { l: 'Mano de obra', v: formatCurrency(data.laborCostUSD), s: `${data.laborHours.toLocaleString('es-BO')} h registradas` },
              { l: 'Gastos aprobados', v: formatCurrency(data.expenseCostUSD) },
              { l: 'Saldo inicial', v: formatCurrency(data.phases.reduce((a, p) => a + p.openingSpentUSD, 0) + data.unphased.openingSpentUSD), s: 'Previo a CHAO OS' },
            ].map((k) => (
              <div key={k.l} className="bg-g85 p-3 min-w-0">
                <p className="text-2xs font-mono text-g40 uppercase tracking-wider truncate">{k.l}</p>
                <p className="font-mono text-sm text-white mt-1 tabular truncate">{k.v}</p>
                {k.s && <p className="text-2xs text-g50 truncate">{k.s}</p>}
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono tabular">
              <thead>
                <tr className="text-2xs text-g40 uppercase">
                  <th className="text-left font-normal py-1.5">Fase</th>
                  <th className="text-right font-normal">Obra</th>
                  <th className="text-right font-normal">Gastos</th>
                  <th className="text-right font-normal">Inicial</th>
                  <th className="text-right font-normal">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-g80">
                {data.phases.map((p) => (
                  <tr key={p.phase} className="text-g20">
                    <td className="py-1.5 text-g30">{PHASE[p.phase]?.short ?? p.phase}</td>
                    <td className="text-right">{fmt(p.laborCostUSD)}</td>
                    <td className="text-right">{fmt(p.expenseCostUSD)}</td>
                    <td className="text-right">
                      {editing ? (
                        <input aria-label={`Saldo inicial ${PHASE[p.phase]?.short}`} type="number" min={0} step="0.01" className={input} value={draft[p.phase]} onChange={(e) => setDraft({ ...draft, [p.phase]: e.target.value })} />
                      ) : (
                        fmt(p.openingSpentUSD)
                      )}
                    </td>
                    <td className={cn('text-right', p.spentUSD > p.budgetUSD ? 'text-red-300' : 'text-white')}>{formatCurrency(p.spentUSD)}</td>
                  </tr>
                ))}
                {(unph > 0 || editing) && (
                  <tr className="text-g20">
                    <td className="py-1.5 text-g30">Sin fase</td>
                    <td className="text-right">{fmt(data.unphased.laborCostUSD)}</td>
                    <td className="text-right">{fmt(data.unphased.expenseCostUSD)}</td>
                    <td className="text-right">
                      {editing ? (
                        <input aria-label="Saldo inicial sin fase" type="number" min={0} step="0.01" className={input} value={draft._} onChange={(e) => setDraft({ ...draft, _: e.target.value })} />
                      ) : (
                        fmt(data.unphased.openingSpentUSD)
                      )}
                    </td>
                    <td className="text-right text-white">{formatCurrency(unph)}</td>
                  </tr>
                )}
                <tr className="text-white">
                  <td className="py-1.5">Total</td>
                  <td className="text-right">{formatCurrency(data.laborCostUSD)}</td>
                  <td className="text-right">{formatCurrency(data.expenseCostUSD)}</td>
                  <td />
                  <td className={cn('text-right', data.totalSpentUSD > data.totalBudgetUSD ? 'text-red-300' : '')}>{formatCurrency(data.totalSpentUSD)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {editing ? (
            <div className="flex items-center justify-between gap-2 mt-3">
              <p className="text-2xs text-g50">Costo incurrido antes de registrar horas y gastos en CHAO OS.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
                <Button size="sm" loading={saving} onClick={save}>Guardar</Button>
              </div>
            </div>
          ) : (
            <p className="text-2xs text-g50 mt-2">
              Horas × costo por hora vigente al registrarlas + gastos aprobados + saldo inicial.
              {data.costsDerivedAt && ` Actualizado ${getRelativeTime(data.costsDerivedAt).toLowerCase()}.`}
            </p>
          )}
        </>
      )}
    </section>
  )
}
