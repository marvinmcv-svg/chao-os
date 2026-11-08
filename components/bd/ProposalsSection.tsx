'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FileSignature, Plus, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { ProposalEditor, type ProposalDTO } from '@/components/bd/ProposalEditor'
import { api } from '@/lib/api-client'
import { CONTRACT_TYPE, PROPOSAL_STATUS, meta } from '@/lib/labels'
import { formatCurrency, formatDate } from '@/lib/utils'

interface ProposalSummary {
  id: string
  number: string
  version: number
  status: string
  contractType: string
  feeUSD: number
  hours: number
  marginPercent: number | null
  validUntil: string
  updatedAt: string
  createdBy: { name: string }
}

interface Props {
  leadId: string
  converted: boolean
  canEdit: boolean
  /** Lead-level data changed (stage, value) — refresh the parent */
  onLeadChanged: () => void
}

export function ProposalsSection({ leadId, converted, canEdit, onLeadChanged }: Props) {
  const [items, setItems] = useState<ProposalSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setItems(await api<ProposalSummary[]>(`/api/leads/${leadId}/proposals`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las propuestas')
    }
  }, [leadId])

  useEffect(() => {
    load()
  }, [load])

  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      const p = await api<ProposalDTO>(`/api/leads/${leadId}/proposals`, { method: 'POST', body: JSON.stringify({}) })
      await load()
      setOpenId(p.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la propuesta')
    } finally {
      setCreating(false)
    }
  }

  const hasDraft = items?.some((p) => p.status === 'DRAFT')
  const accepted = items?.some((p) => p.status === 'ACCEPTED')

  return (
    <section className="rounded-lg border border-g80 bg-g85 p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h4 className="text-2xs font-mono text-g40 uppercase tracking-[0.14em] flex items-center gap-2">
          <FileSignature className="w-3.5 h-3.5 text-accent" /> Propuesta de honorarios
        </h4>
        {canEdit && !converted && !hasDraft && !accepted && (
          <Button size="sm" variant="secondary" onClick={create} loading={creating}>
            <Plus className="w-3.5 h-3.5" /> {items?.length ? 'Nueva versión' : 'Crear propuesta'}
          </Button>
        )}
      </div>
      {error && <div className="mb-3"><ErrorBanner message={error} onRetry={load} /></div>}
      {items === null ? (
        <Skeleton className="h-14" />
      ) : items.length === 0 ? (
        <p className="text-sm text-g40">
          Sin propuesta. Estima horas por fase y rol, genera el PDF para el cliente y, al ganar, se convierte en el presupuesto del proyecto.
        </p>
      ) : (
        <ul className="divide-y divide-g80 -mx-2">
          {items.map((p) => {
            const s = meta(PROPOSAL_STATUS, p.status)
            return (
              <li key={p.id}>
                <button onClick={() => setOpenId(p.id)} className="w-full flex items-center gap-3 px-2 py-2.5 rounded hover:bg-g80 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-white font-mono">{p.number} · v{p.version}</span>
                      <Badge variant={s.variant} dot>{s.label}</Badge>
                    </div>
                    <p className="text-2xs font-mono text-g40 mt-0.5 truncate">
                      {CONTRACT_TYPE[p.contractType] ?? p.contractType} · {p.hours.toLocaleString('es-BO')} h · válida hasta {formatDate(p.validUntil)} · {p.createdBy.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-white tabular">{formatCurrency(p.feeUSD)}</p>
                    {p.marginPercent != null && <p className="text-2xs font-mono text-g40 tabular">margen {p.marginPercent}%</p>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-g50" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {typeof document !== 'undefined' &&
        createPortal(
          <ProposalEditor
            proposalId={openId}
            open={!!openId}
            onClose={() => setOpenId(null)}
            onChanged={(next) => {
              load()
              onLeadChanged()
              if (next && next.id !== openId) setOpenId(next.id)
            }}
          />,
          document.body,
        )}
    </section>
  )
}
