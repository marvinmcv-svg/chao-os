'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Panel } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { EmptyState } from '@/components/ui/EmptyState'
import { CHART } from '@/lib/chart-theme'
import { cn, formatCompact, formatCurrency } from '@/lib/utils'
import { BarChart3 } from 'lucide-react'

export interface PnLRow {
  projectId: string
  code: string
  name: string
  status?: string
  feeUSD?: number
  revenue: number
  expenses: number
  laborCost: number
  netProfit: number
  margin: number
  hoursLogged: number
}

export interface CashFlowData {
  weekly: { week: string; expected: number; overdue: number }[]
  summary: { totalExpected: number; totalOverdue: number; invoiceCount: number }
}

const OVERDUE = '#e66767'

function MoneyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-g90 border border-g70 rounded-md px-3 py-2 shadow-panel min-w-[160px]">
      <p className="text-2xs font-mono text-g40 uppercase mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-g30">{p.name}</span>
          <span className="font-mono text-white ml-auto tabular">{formatCurrency(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <div className="flex items-center gap-4 text-2xs font-mono text-g40">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}

export function FinanceCharts({ pnlData, cashFlowData }: { pnlData: PnLRow[]; cashFlowData: CashFlowData | null }) {
  const rows = pnlData.filter((p) => p.revenue > 0 || p.laborCost > 0 || p.expenses > 0)
  const totalRevenue = rows.reduce((s, p) => s + p.revenue, 0)
  const totalExpenses = rows.reduce((s, p) => s + p.expenses, 0)
  const totalLabor = rows.reduce((s, p) => s + p.laborCost, 0)
  const totalProfit = totalRevenue - totalExpenses - totalLabor
  // Weighted margin (not an average of percentages)
  const margin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0
  const chartRows = rows.map((p) => ({ ...p, cost: p.laborCost + p.expenses })).sort((a, b) => b.revenue - a.revenue)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Ingresos facturados" value={formatCompact(totalRevenue)} hint={`${rows.length} proyectos con actividad`} />
        <StatCard label="Costo (horas + gastos)" value={formatCompact(totalLabor + totalExpenses)} hint={`${formatCompact(totalLabor)} mano de obra · ${formatCompact(totalExpenses)} gastos`} />
        <StatCard label="Utilidad" value={formatCompact(totalProfit)} tone={totalProfit < 0 ? 'red' : 'default'} />
        <StatCard label="Margen ponderado" value={`${margin}%`} tone={margin < 15 ? 'red' : margin < 30 ? 'yellow' : 'green'} hint="Meta del estudio: ≥ 30%" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Ingresos vs costo por proyecto" action={<Legend items={[{ color: CHART.blue, label: 'Ingresos' }, { color: CHART.orange, label: 'Costo' }]} />}>
          {chartRows.length === 0 ? (
            <EmptyState icon={BarChart3} title="Sin datos de P&L todavía" description="Registra horas y emite facturas para ver la rentabilidad." />
          ) : (
            <div className="px-2 py-4" style={{ height: Math.max(220, chartRows.length * 44 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} layout="vertical" barGap={2} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => formatCompact(v)} tick={{ fill: CHART.axis, fontSize: 11, fontFamily: CHART.font }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="code" tick={{ fill: CHART.axis, fontSize: 11, fontFamily: CHART.font }} axisLine={false} tickLine={false} width={84} />
                  <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                  <Bar dataKey="revenue" name="Ingresos" fill={CHART.blue} radius={[0, 4, 4, 0]} maxBarSize={14} />
                  <Bar dataKey="cost" name="Costo" fill={CHART.orange} radius={[0, 4, 4, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel
          title="Flujo de caja · próximas 12 semanas"
          action={<Legend items={[{ color: CHART.blue, label: 'Por cobrar' }, { color: OVERDUE, label: 'Vencido' }]} />}
        >
          {cashFlowData ? (
            <>
              <div className="grid grid-cols-2 border-b border-g80">
                <div className="px-5 py-3 border-r border-g80">
                  <p className="text-2xs font-mono text-g40 uppercase">Esperado</p>
                  <p className="font-display text-2xl text-white tabular">{formatCompact(cashFlowData.summary.totalExpected)}</p>
                </div>
                <div className="px-5 py-3">
                  <p className="text-2xs font-mono text-g40 uppercase">Vencido (en semana 1)</p>
                  <p className={cn('font-display text-2xl tabular', cashFlowData.summary.totalOverdue > 0 ? 'text-red-400' : 'text-white')}>{formatCompact(cashFlowData.summary.totalOverdue)}</p>
                </div>
              </div>
              <div className="h-[240px] px-2 py-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cashFlowData.weekly} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="week" tick={{ fill: CHART.axis, fontSize: 10, fontFamily: CHART.font }} axisLine={false} tickLine={false} interval={1} />
                    <YAxis tickFormatter={(v) => formatCompact(v)} tick={{ fill: CHART.axis, fontSize: 11, fontFamily: CHART.font }} axisLine={false} tickLine={false} width={52} />
                    <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="overdue" name="Vencido" stackId="a" fill={OVERDUE} maxBarSize={24} />
                    <Bar dataKey="expected" name="Por cobrar" stackId="a" fill={CHART.blue} radius={[4, 4, 0, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <EmptyState icon={BarChart3} title="Sin datos de flujo de caja" />
          )}
        </Panel>
      </div>

      {rows.length > 0 && (
        <Panel title="Detalle P&L por proyecto">
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Proyecto</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                <TableHead className="text-right">Ingresos</TableHead>
                <TableHead className="text-right">Mano de obra</TableHead>
                <TableHead className="text-right">Gastos</TableHead>
                <TableHead className="text-right">Utilidad</TableHead>
                <TableHead className="text-right">Margen</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.projectId}>
                  <TableCell>
                    <span className="text-2xs font-mono text-g40 mr-2">{p.code}</span>
                    <span className="text-g10">{p.name}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular text-g30">{Math.round(p.hoursLogged)}</TableCell>
                  <TableCell className="text-right font-mono tabular text-g10">{formatCurrency(p.revenue)}</TableCell>
                  <TableCell className="text-right font-mono tabular">{formatCurrency(p.laborCost)}</TableCell>
                  <TableCell className="text-right font-mono tabular">{formatCurrency(p.expenses)}</TableCell>
                  <TableCell className={cn('text-right font-mono tabular', p.netProfit < 0 ? 'text-red-400' : 'text-g10')}>{formatCurrency(p.netProfit)}</TableCell>
                  <TableCell className="text-right">
                    <span className={cn('font-mono text-xs px-1.5 py-0.5 rounded tabular', p.revenue === 0 ? 'text-g50' : p.margin >= 30 ? 'status-green' : p.margin >= 15 ? 'status-yellow' : 'status-red')}>
                      {p.revenue === 0 ? '—' : `${p.margin}%`}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              <tr className="border-t border-g70 bg-g90/40">
                <TableCell className="font-mono text-2xs uppercase tracking-wider text-g30">Total</TableCell>
                <TableCell className="text-right font-mono tabular text-g30">{Math.round(rows.reduce((s, p) => s + p.hoursLogged, 0))}</TableCell>
                <TableCell className="text-right font-mono tabular text-white">{formatCurrency(totalRevenue)}</TableCell>
                <TableCell className="text-right font-mono tabular text-white">{formatCurrency(totalLabor)}</TableCell>
                <TableCell className="text-right font-mono tabular text-white">{formatCurrency(totalExpenses)}</TableCell>
                <TableCell className={cn('text-right font-mono tabular', totalProfit < 0 ? 'text-red-400' : 'text-white')}>{formatCurrency(totalProfit)}</TableCell>
                <TableCell className="text-right font-mono tabular text-white">{margin}%</TableCell>
              </tr>
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  )
}
