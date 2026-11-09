'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import { Wallet, HandCoins, ClipboardCheck } from 'lucide-react'
import { Segmented } from '@/components/ui/Tabs'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState, ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'
import { formatCompact, formatCurrency } from '@/lib/utils'
import { ExpenseDetail, ExpenseForm, ExpenseRow, type ExpenseDTO } from './ExpenseModals'

type Filter = 'REVIEW' | 'REIMBURSE' | 'ALL' | 'MINE'

interface ListDTO {
  items: ExpenseDTO[]
  canReimburse: boolean
  isFinance: boolean
}

/**
 * Finance → Gastos. PRINCIPAL / ADMIN see every project; a PM sees their
 * own submissions plus their projects' expenses; everyone else sees theirs.
 */
export function ExpensesQueue() {
  const { data: session } = useSession()
  const me = session?.user as { id?: string } | undefined
  const [data, setData] = useState<ListDTO | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('REVIEW')
  const [viewing, setViewing] = useState<string | null>(null)
  const [editing, setEditing] = useState<ExpenseDTO | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await api<ListDTO>('/api/expenses?scope=all'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los gastos')
      setData({ items: [], canReimburse: false, isFinance: false })
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const { items, review, reimburse, mine } = useMemo(() => {
    const items = data?.items ?? []
    return {
      items,
      review: items.filter((e) => e.status === 'SUBMITTED' && e.canApprove),
      reimburse: items.filter((e) => e.status === 'APPROVED' && e.paidByStaff),
      mine: items.filter((e) => e.submittedById === me?.id),
    }
  }, [data, me?.id])

  const filtered = filter === 'REVIEW' ? review : filter === 'REIMBURSE' ? reimburse : filter === 'MINE' ? mine : items

  const month = new Date().toISOString().slice(0, 7)
  const monthCost = items
    .filter((e) => (e.status === 'APPROVED' || e.status === 'REIMBURSED') && e.incurredAt.slice(0, 7) === month)
    .reduce((a, e) => a + e.amountUSD, 0)
  const unbilled = items.filter((e) => e.billable && !e.invoice && (e.status === 'APPROVED' || e.status === 'REIMBURSED'))
  const sum = (xs: ExpenseDTO[], f: (e: ExpenseDTO) => number = (e) => e.amountUSD) => xs.reduce((a, e) => a + f(e), 0)
  const current = items.find((e) => e.id === viewing) ?? null

  return (
    <div className="space-y-4">
      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {!data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[120px] rounded-lg" />)
        ) : (
          <>
            <StatCard label="Por aprobar" icon={ClipboardCheck} value={formatCompact(sum(review))} tone={review.length ? 'yellow' : 'default'} hint={`${review.length} gasto${review.length === 1 ? '' : 's'} esperando tu revisión`} />
            <StatCard label="Por reembolsar" icon={HandCoins} value={formatCompact(sum(reimburse))} hint={`${reimburse.length} a personas del equipo`} />
            <StatCard label="Reembolsable sin facturar" icon={Wallet} value={formatCompact(sum(unbilled, (e) => e.billedAmountUSD))} hint={`${unbilled.length} gasto${unbilled.length === 1 ? '' : 's'} · factúralos desde el proyecto`} />
            <StatCard label="Gasto aprobado del mes" icon={Wallet} value={formatCompact(monthCost)} hint={new Date().toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })} />
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'REVIEW', label: `Por aprobar${review.length ? ` (${review.length})` : ''}` },
            { id: 'REIMBURSE', label: `Por reembolsar${reimburse.length ? ` (${reimburse.length})` : ''}` },
            { id: 'MINE', label: 'Mis gastos' },
            { id: 'ALL', label: 'Todos' },
          ]}
        />
      </div>

      <div className="bg-g85 border border-g80 rounded-lg overflow-hidden">
        {!data ? (
          <div className="p-5 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={filter === 'REVIEW' ? 'Nada pendiente de aprobación' : filter === 'REIMBURSE' ? 'No hay reembolsos pendientes' : 'Sin gastos'}
            description="Los gastos se registran desde cada proyecto (Proyectos → abrir proyecto → Gastos y reembolsables)."
          />
        ) : (
          <ul className="divide-y divide-g80">
            {filtered.map((e) => (
              <li key={e.id}>
                <ExpenseRow e={e} showProject onClick={() => setViewing(e.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {filter === 'REIMBURSE' && reimburse.length > 0 && (
        <ReimburseByPerson items={reimburse} />
      )}

      {typeof document !== 'undefined' &&
        createPortal(
          <>
            <ExpenseDetail
              expense={current}
              currentUserId={me?.id}
              canApprove={!!current?.canApprove}
              canReimburse={!!data?.canReimburse}
              onClose={() => setViewing(null)}
              onEdit={(e) => {
                setViewing(null)
                setEditing(e)
              }}
              onChanged={load}
            />
            <ExpenseForm
              projectId={editing?.projectId ?? ''}
              initial={editing}
              open={editing !== null}
              onClose={() => setEditing(null)}
              onSaved={async (e) => {
                setEditing(null)
                await load()
                setViewing(e.id)
              }}
            />
          </>,
          document.body
        )}
    </div>
  )
}

function ReimburseByPerson({ items }: { items: ExpenseDTO[] }) {
  const groups = new Map<string, { name: string; total: number; count: number }>()
  for (const e of items) {
    const key = e.submittedBy?.id ?? '—'
    const g = groups.get(key) ?? { name: e.submittedBy?.name ?? 'Sin asignar', total: 0, count: 0 }
    g.total += e.amountUSD
    g.count += 1
    groups.set(key, g)
  }
  return (
    <div className="rounded-lg border border-g80 p-4">
      <p className="text-2xs font-mono text-g40 uppercase tracking-wider mb-2">Total a pagar por persona</p>
      <ul className="space-y-1">
        {Array.from(groups.values()).map((g) => (
          <li key={g.name} className="flex justify-between text-sm">
            <span className="text-g20">{g.name} <span className="text-g50 text-xs">· {g.count}</span></span>
            <span className="font-mono tabular text-white">{formatCurrency(g.total)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
