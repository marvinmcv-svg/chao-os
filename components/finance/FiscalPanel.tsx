'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Landmark, FileSpreadsheet, BookOpen, Percent, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { StatCard } from '@/components/ui/StatCard'
import { EmptyState, ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { api } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'
import { FISCAL_STATUS, fmtBOB } from './FiscalSection'

interface Summary {
  month: string
  count: number
  annulled: number
  pendingValidation: number
  totalBOB: number
  ivaBOB: number
  itBOB: number
  netBOB: number
  notIssuedSent: number
  invoices: {
    id: string
    number: string
    fiscalNumber: number
    fiscalIssuedAt: string
    fiscalStatus: string
    buyerName: string | null
    buyerDocNumber: string | null
    amountBOB: number | null
    client: string
    project: string
  }[]
}

interface SettingsView {
  missing: string[]
  siatConnected: boolean
}

/** Bolivia is UTC−4: the current month there. */
const thisMonth = () => new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 7)
const shift = (m: string, d: number) => {
  const [y, mo] = m.split('-').map(Number)
  const t = new Date(Date.UTC(y, mo - 1 + d, 1))
  return t.toISOString().slice(0, 7)
}
const monthLabel = (m: string) => {
  const s = new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-BO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function FiscalPanel({ onOpenInvoice }: { onOpenInvoice: (id: string) => void }) {
  const [month, setMonth] = useState(thisMonth())
  const [data, setData] = useState<Summary | null>(null)
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setData(null)
    try {
      setData(await api<Summary>(`/api/finance/fiscal?month=${month}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el resumen fiscal')
    }
  }, [month])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    api<SettingsView>('/api/settings/fiscal').then(setSettings).catch(() => {})
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" aria-label="Mes anterior" onClick={() => setMonth((m) => shift(m, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <input
            type="month"
            aria-label="Mes"
            value={month}
            max={thisMonth()}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="h-9 px-3 bg-g90 border border-g80 rounded-md text-sm text-g10 font-mono focus:outline-none focus:ring-2 focus:ring-accent/60"
          />
          <Button size="icon" variant="ghost" aria-label="Mes siguiente" disabled={month >= thisMonth()} onClick={() => setMonth((m) => shift(m, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <span className="ml-2 text-sm text-g30 hidden sm:inline">{monthLabel(month)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/finance/exports/ventas?month=${month}`} download className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-md bg-g80 text-g10 border border-g70 hover:bg-g75 hover:border-g60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <FileSpreadsheet className="w-4 h-4" /> Registro de Ventas (CSV)
          </a>
          <a href={`/api/finance/exports/diario?month=${month}`} download className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-md bg-g80 text-g10 border border-g70 hover:bg-g75 hover:border-g60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <BookOpen className="w-4 h-4" /> Libro diario (CSV)
          </a>
        </div>
      </div>

      {settings && settings.missing.length > 0 && (
        <p className="flex gap-2 text-xs text-yellow-200/90 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            Para emitir facturas fiscales faltan datos del estudio: {settings.missing.join(', ')}.{' '}
            <Link href="/settings#fiscal" className="text-accent hover:underline">Completar en Configuración</Link>
          </span>
        </p>
      )}
      {settings && !settings.siatConnected && (
        <p className="text-2xs text-g50">
          Sin conexión al SIAT: las facturas se emiten fuera de línea y quedan pendientes de validación del SIN. Las exportaciones usan el formato del Registro de Compras y Ventas; revísalas con tu contador antes de presentarlas.
        </p>
      )}

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {!data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[120px] rounded-lg" />)
        ) : (
          <>
            <StatCard label="Ventas facturadas" icon={Landmark} value={fmtBOB(data.totalBOB)} hint={`${data.count} factura${data.count === 1 ? '' : 's'}${data.annulled ? ` · ${data.annulled} anulada${data.annulled === 1 ? '' : 's'}` : ''}`} />
            <StatCard label="Débito fiscal IVA 13%" icon={Percent} value={fmtBOB(data.ivaBOB)} hint="Formulario 200" />
            <StatCard label="IT 3%" icon={Percent} value={fmtBOB(data.itBOB)} hint="Formulario 400" />
            <StatCard
              label="Pendientes"
              icon={AlertTriangle}
              value={String(data.pendingValidation + data.notIssuedSent)}
              tone={data.pendingValidation + data.notIssuedSent > 0 ? 'yellow' : 'default'}
              hint={`${data.pendingValidation} sin validar SIN · ${data.notIssuedSent} enviada${data.notIssuedSent === 1 ? '' : 's'} sin factura fiscal`}
            />
          </>
        )}
      </div>

      <div className="bg-g85 border border-g80 rounded-lg overflow-hidden">
        {!data ? (
          <div className="p-5 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : data.invoices.length === 0 ? (
          <EmptyState icon={Landmark} title="Sin facturas fiscales este mes" description="Emite la factura fiscal desde el detalle de cada factura (Facturas → abrir → Emitir factura fiscal)." />
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead>N°</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Comprador</TableHead>
                <TableHead className="hidden md:table-cell">NIT / CI</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Estado</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {data.invoices.map((r) => {
                const st = FISCAL_STATUS[r.fiscalStatus]
                return (
                  <TableRow key={r.id} onClick={() => onOpenInvoice(r.id)}>
                    <TableCell className="font-mono text-g10">{r.fiscalNumber}<span className="block text-2xs text-g50">{r.number}</span></TableCell>
                    <TableCell className="text-xs font-mono text-g40">{formatDate(r.fiscalIssuedAt)}</TableCell>
                    <TableCell>
                      <p className="text-g10 truncate max-w-[220px]">{r.buyerName}</p>
                      <p className="text-2xs text-g40 font-mono">{r.project}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs text-g30">{r.buyerDocNumber}</TableCell>
                    <TableCell className={`text-right font-mono tabular ${r.fiscalStatus === 'ANNULLED' ? 'text-g50 line-through' : 'text-white'}`}>{fmtBOB(r.amountBOB ?? 0)}</TableCell>
                    <TableCell className="text-right"><Badge variant={st.variant} dot>{st.label}</Badge></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
