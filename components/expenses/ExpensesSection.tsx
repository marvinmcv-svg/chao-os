'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import { Wallet, Plus, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'
import { cn, formatCurrency } from '@/lib/utils'
import { ExpenseDetail, ExpenseForm, ExpenseRow, type ExpenseDTO } from './ExpenseModals'

interface Summary {
  costUSD: number
  pendingUSD: number
  pendingCount: number
  unbilledCostUSD: number
  unbilledAmountUSD: number
  unbilledCount: number
  billedAmountUSD: number
  toReimburseUSD: number
  toReimburseCount: number
}

interface ListDTO {
  items: ExpenseDTO[]
  summary: Summary
  canApprove: boolean
  canInvoice: boolean
}

const FINANCE_ROLES = new Set(['PRINCIPAL', 'ADMIN'])

export function ExpensesSection({ projectId, onChanged }: { projectId: string; onChanged?: () => void }) {
  const { data: session } = useSession()
  const me = session?.user as { id?: string; role?: string } | undefined
  const [data, setData] = useState<ListDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ExpenseDTO | 'new' | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [invoicing, setInvoicing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await api<ListDTO>(`/api/projects/${projectId}/expenses`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los gastos')
    }
  }, [projectId])

  useEffect(() => {
    load()
  }, [load])

  const refresh = async () => {
    await load()
    onChanged?.()
  }

  const invoice = async () => {
    if (!data) return
    const s = data.summary
    if (!confirm(`¿Crear una factura borrador con ${s.unbilledCount} gasto${s.unbilledCount === 1 ? '' : 's'} reembolsable${s.unbilledCount === 1 ? '' : 's'} por ${formatCurrency(s.unbilledAmountUSD)}?`)) return
    setInvoicing(true)
    setError(null)
    try {
      const r = await api<{ invoice: { id: string; number: string } }>(`/api/projects/${projectId}/expenses/invoice`, { method: 'POST', body: '{}' })
      setNotice(`Factura ${r.invoice.number} creada como borrador — revísala en Finanzas antes de emitirla.`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo facturar')
    } finally {
      setInvoicing(false)
    }
  }

  const s = data?.summary
  const current = data?.items.find((i) => i.id === viewing) ?? null

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-2xs font-mono text-g40 uppercase tracking-[0.14em] flex items-center gap-2">
          <Wallet className="w-3.5 h-3.5" />
          Gastos y reembolsables
        </h3>
        <div className="flex gap-2">
          {data?.canInvoice && s && s.unbilledCount > 0 && (
            <Button size="sm" variant="secondary" loading={invoicing} onClick={invoice}>
              <Receipt className="w-3.5 h-3.5" /> Facturar {formatCurrency(s.unbilledAmountUSD)}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
            <Plus className="w-3.5 h-3.5" /> Gasto
          </Button>
        </div>
      </div>

      {error && <div className="mb-3"><ErrorBanner message={error} onRetry={load} /></div>}
      {notice && (
        <p className="mb-3 text-xs text-green-300 rounded-md border border-green-700/40 bg-green-500/5 p-3" role="status">
          {notice}
        </p>
      )}

      {!data ? (
        <Skeleton className="h-16" />
      ) : (
        <>
          {data.items.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-g80 border border-g80 rounded-lg overflow-hidden mb-3">
              {[
                { l: 'Costo aprobado', v: formatCurrency(s!.costUSD) },
                { l: 'Por aprobar', v: s!.pendingCount ? formatCurrency(s!.pendingUSD) : '—', tone: s!.pendingCount ? 'text-yellow-400' : '' },
                { l: 'Por facturar', v: s!.unbilledCount ? formatCurrency(s!.unbilledAmountUSD) : '—', tone: s!.unbilledCount ? 'text-accent' : '' },
                { l: 'Por reembolsar', v: s!.toReimburseCount ? formatCurrency(s!.toReimburseUSD) : '—', tone: s!.toReimburseCount ? 'text-blue-300' : '' },
              ].map((k) => (
                <div key={k.l} className="bg-g85 p-3 min-w-0">
                  <p className="text-2xs font-mono text-g40 uppercase tracking-wider truncate">{k.l}</p>
                  <p className={cn('font-mono text-sm text-white mt-1 tabular truncate', k.tone)}>{k.v}</p>
                </div>
              ))}
            </div>
          )}

          {data.items.length === 0 ? (
            <p className="text-sm text-g40">
              Sin gastos registrados. Registra viajes, ploteos, renders o consultores; los reembolsables se facturan al cliente con recargo y lo que pagó el equipo se reembolsa desde Finanzas.
            </p>
          ) : (
            <ul className="divide-y divide-g80 border border-g80 rounded-lg overflow-hidden">
              {data.items.map((e) => (
                <li key={e.id}>
                  <ExpenseRow e={e} onClick={() => setViewing(e.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {typeof document !== 'undefined' &&
        createPortal(
          <>
            <ExpenseForm
              projectId={projectId}
              initial={editing === 'new' ? null : editing}
              open={editing !== null}
              onClose={() => setEditing(null)}
              onSaved={async (e) => {
                setEditing(null)
                await refresh()
                setViewing(e.id)
              }}
            />
            <ExpenseDetail
              expense={current}
              currentUserId={me?.id}
              canApprove={!!data?.canApprove}
              canReimburse={FINANCE_ROLES.has(me?.role ?? '')}
              onClose={() => setViewing(null)}
              onEdit={(e) => {
                setViewing(null)
                setEditing(e)
              }}
              onChanged={refresh}
            />
          </>,
          document.body
        )}
    </section>
  )
}
