'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, Search, Receipt, Banknote, AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tabs, Segmented } from '@/components/ui/Tabs'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState, ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { InvoiceDetailPanel } from '@/components/finance/InvoiceDetailPanel'
import { NewInvoiceModal } from '@/components/modals/NewInvoiceModal'
import { FinanceCharts, type CashFlowData, type PnLRow } from '@/components/finance/FinanceCharts'
import { ExpensesQueue } from '@/components/expenses/ExpensesQueue'
import { FiscalPanel } from '@/components/finance/FiscalPanel'
import { api } from '@/lib/api-client'
import { INVOICE_STATUS, meta } from '@/lib/labels'
import { cn, formatCompact, formatCurrency, formatDate } from '@/lib/utils'

interface Invoice {
  id: string
  number: string
  amountUSD: number
  currency: string
  exchangeRate: number
  amountBOB: number | null
  fiscalNumber: number | null
  fiscalStatus: string
  status: string
  issuedAt: string
  dueDate: string
  paidAmount: number
  project: { id: string; code: string; name: string }
  client: { id: string; name: string; company: string }
  lineItems: { description: string }[]
}

type Filter = 'ALL' | 'OPEN' | 'OVERDUE' | 'PAID' | 'DRAFT'

function isPastDue(i: Invoice) {
  return i.status === 'OVERDUE' || (i.status !== 'PAID' && i.status !== 'DRAFT' && new Date(i.dueDate) < new Date())
}

function FinanceInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [view, setView] = useState('invoices')
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [pnl, setPnl] = useState<PnLRow[] | null>(null)
  const [cashflow, setCashflow] = useState<CashFlowData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('ALL')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    const id = params.get('invoice')
    if (id) setSelectedId(id)
    if (params.get('new')) setShowNew(true)
    const tab = params.get('tab')
    if (tab === 'expenses' || tab === 'analytics' || tab === 'fiscal') setView(tab)
  }, [params])

  // Previously this page rendered hard-coded mock invoices from a different
  // business (TechCorp, MediaLab…) — everything now comes from the API.
  const loadInvoices = useCallback(async () => {
    setError(null)
    try {
      setInvoices(await api<Invoice[]>('/api/invoices'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las facturas')
      setInvoices([])
    }
  }, [])

  const loadAnalytics = useCallback(() => {
    api<PnLRow[]>('/api/finance/pnl').then(setPnl).catch(() => setPnl([]))
    api<CashFlowData>('/api/finance/cashflow').then(setCashflow).catch(() => setCashflow(null))
  }, [])

  useEffect(() => { loadInvoices() }, [loadInvoices])
  useEffect(() => { if (view === 'analytics') loadAnalytics() }, [view, loadAnalytics])

  const stats = useMemo(() => {
    const list = invoices ?? []
    const billed = list.filter((i) => i.status !== 'DRAFT')
    const open = billed.filter((i) => i.status !== 'PAID')
    const overdue = open.filter(isPastDue)
    const outstanding = (i: Invoice) => Math.max(0, i.amountUSD - (i.paidAmount || 0))
    const paid = list.filter((i) => i.status === 'PAID')
    return {
      billed: billed.reduce((s, i) => s + i.amountUSD, 0),
      outstanding: open.reduce((s, i) => s + outstanding(i), 0),
      openCount: open.length,
      overdue: overdue.reduce((s, i) => s + outstanding(i), 0),
      overdueCount: overdue.length,
      drafts: list.filter((i) => i.status === 'DRAFT').length,
      paidCount: paid.length,
    }
  }, [invoices])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (invoices ?? []).filter((i) => {
      const f =
        filter === 'ALL' ||
        (filter === 'OPEN' && i.status !== 'PAID' && i.status !== 'DRAFT') ||
        (filter === 'OVERDUE' && isPastDue(i)) ||
        (filter === 'PAID' && i.status === 'PAID') ||
        (filter === 'DRAFT' && i.status === 'DRAFT')
      return f && (!q || i.number.toLowerCase().includes(q) || i.client.company.toLowerCase().includes(q) || i.client.name.toLowerCase().includes(q) || i.project.name.toLowerCase().includes(q) || i.project.code.toLowerCase().includes(q))
    })
  }, [invoices, search, filter])

  function closePanel() {
    setSelectedId(null)
    if (params.get('invoice')) router.replace('/finance')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finanzas"
        subtitle="Facturación por hitos, cobranza y rentabilidad por proyecto"
        actions={
          <Button onClick={() => setShowNew(true)}>
            <Plus className="w-4 h-4" /> Nueva factura
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={loadInvoices} />}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {!invoices ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[120px] rounded-lg" />)
        ) : (
          <>
            <StatCard label="Facturado total" icon={Receipt} value={formatCompact(stats.billed)} hint={`${stats.drafts} borrador${stats.drafts !== 1 ? 'es' : ''} sin emitir`} />
            <StatCard label="Por cobrar" icon={Clock3} value={formatCompact(stats.outstanding)} hint={`${stats.openCount} factura${stats.openCount !== 1 ? 's' : ''} abierta${stats.openCount !== 1 ? 's' : ''}`} />
            <StatCard label="Vencido" icon={AlertTriangle} value={formatCompact(stats.overdue)} tone={stats.overdue > 0 ? 'red' : 'default'} hint={stats.overdueCount > 0 ? `${stats.overdueCount} requiere${stats.overdueCount === 1 ? '' : 'n'} gestión de cobro` : 'Cartera al día'} hintTone={stats.overdueCount > 0 ? 'red' : 'green'} />
            <StatCard label="Cobrado" icon={Banknote} value={formatCompact(stats.billed - stats.outstanding)} hint={`${stats.paidCount} factura${stats.paidCount !== 1 ? 's' : ''} pagada${stats.paidCount !== 1 ? 's' : ''}`} hintTone="green" />
          </>
        )}
      </div>

      <Tabs
        tabs={[
          { id: 'invoices', label: 'Facturas', count: invoices?.length },
          { id: 'expenses', label: 'Gastos y reembolsos' },
          { id: 'fiscal', label: 'Impuestos y contabilidad' },
          { id: 'analytics', label: 'Rentabilidad y flujo de caja' },
        ]}
        activeTab={view}
        onTabChange={setView}
      />

      {view === 'invoices' && (
        <>
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-g50" />
              <input
                type="search"
                placeholder="Buscar por número, cliente o proyecto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 bg-g90 border border-g80 rounded-md text-sm text-g10 placeholder:text-g50 focus:outline-none focus:ring-2 focus:ring-accent/60"
              />
            </div>
            <div className="overflow-x-auto">
              <Segmented<Filter>
                value={filter}
                onChange={setFilter}
                options={[
                  { id: 'ALL', label: 'Todas' },
                  { id: 'OPEN', label: 'Abiertas' },
                  { id: 'OVERDUE', label: 'Vencidas' },
                  { id: 'PAID', label: 'Pagadas' },
                  { id: 'DRAFT', label: 'Borradores' },
                ]}
              />
            </div>
          </div>

          <div className="bg-g85 border border-g80 rounded-lg overflow-hidden">
            {!invoices ? (
              <div className="p-5 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title={invoices.length === 0 ? 'Aún no hay facturas' : 'Ninguna factura coincide con el filtro'}
                action={invoices.length === 0 ? <Button size="sm" onClick={() => setShowNew(true)}><Plus className="w-4 h-4" /> Nueva factura</Button> : undefined}
              />
            ) : (
              <Table>
                <TableHeader>
                  <tr>
                    <TableHead>Factura</TableHead>
                    <TableHead>Cliente · proyecto</TableHead>
                    <TableHead className="hidden md:table-cell">Emitida</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right hidden md:table-cell">Saldo</TableHead>
                    <TableHead className="text-right">Estado</TableHead>
                  </tr>
                </TableHeader>
                <TableBody>
                  {filtered.map((inv) => {
                    const overdue = isPastDue(inv)
                    const st = overdue && inv.status !== 'OVERDUE' ? { label: 'Vencida', variant: 'red' as const } : meta(INVOICE_STATUS, inv.status)
                    const balance = inv.status === 'PAID' ? 0 : Math.max(0, inv.amountUSD - (inv.paidAmount || 0))
                    const days = Math.round((Date.now() - new Date(inv.dueDate).getTime()) / 86_400_000)
                    return (
                      <TableRow key={inv.id} onClick={() => setSelectedId(inv.id)}>
                        <TableCell>
                          <p className="font-mono text-g10">
                            {inv.number}
                            {inv.fiscalNumber != null && (
                              <span className={cn('ml-2 text-2xs px-1.5 py-0.5 rounded border', inv.fiscalStatus === 'ANNULLED' ? 'border-red-800 text-red-300 line-through' : 'border-g70 text-g30')} title="N° de factura fiscal (SIN)">
                                F-{inv.fiscalNumber}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-g40 truncate max-w-[220px]">{inv.lineItems?.[0]?.description ?? ''}</p>
                        </TableCell>
                        <TableCell>
                          <p className="text-g10 truncate max-w-[240px]">{inv.client.company}</p>
                          <p className="text-xs text-g40 truncate max-w-[240px]"><span className="font-mono">{inv.project.code}</span> · {inv.project.name}</p>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs font-mono text-g40">{formatDate(inv.issuedAt)}</TableCell>
                        <TableCell>
                          <p className={cn('text-xs font-mono', overdue ? 'text-red-300' : 'text-g30')}>{formatDate(inv.dueDate)}</p>
                          {overdue && <p className="text-2xs font-mono text-red-400">{days} días de mora</p>}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular text-white">
                          {inv.amountBOB != null || inv.currency === 'BOB' ? (
                            <>
                              {`Bs ${(inv.amountBOB ?? inv.amountUSD * inv.exchangeRate).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                              <span className="block text-2xs text-g50">{formatCurrency(inv.amountUSD)}</span>
                            </>
                          ) : (
                            formatCurrency(inv.amountUSD)
                          )}
                        </TableCell>
                        <TableCell className="text-right hidden md:table-cell font-mono tabular text-g30">
                          {balance > 0 ? formatCurrency(balance) : <CheckCircle2 className="w-4 h-4 text-green-400 inline" />}
                        </TableCell>
                        <TableCell className="text-right"><Badge variant={st.variant} dot>{st.label}</Badge></TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}

      {view === 'expenses' && <ExpensesQueue />}

      {view === 'fiscal' && <FiscalPanel onOpenInvoice={setSelectedId} />}

      {view === 'analytics' && (pnl === null ? <Skeleton className="h-96 rounded-lg" /> : <FinanceCharts pnlData={pnl} cashFlowData={cashflow} />)}

      <InvoiceDetailPanel
        invoiceId={selectedId}
        open={!!selectedId}
        onClose={closePanel}
        onUpdate={() => {
          loadInvoices()
          if (view === 'analytics') loadAnalytics()
        }}
      />

      <NewInvoiceModal
        open={showNew}
        onClose={() => {
          setShowNew(false)
          if (params.get('new')) router.replace('/finance')
        }}
        onSuccess={(inv) => {
          setShowNew(false)
          loadInvoices()
          if (inv && typeof inv === 'object' && 'id' in inv) setSelectedId((inv as { id: string }).id)
        }}
      />
    </div>
  )
}

export default function FinancePage() {
  return (
    <Suspense fallback={null}>
      <FinanceInner />
    </Suspense>
  )
}
