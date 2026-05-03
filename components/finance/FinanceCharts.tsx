'use client'

import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent } from '@/components/ui/Card'
import { formatCurrency } from '@/lib/utils'

interface PnLRow {
  projectId: string
  code: string
  name: string
  revenue: number
  expenses: number
  laborCost: number
  netProfit: number
  margin: number
  hoursLogged: number
}

interface CashFlowData {
  weekly: { week: string; expected: number; overdue: number }[]
  summary: { totalExpected: number; totalOverdue: number; invoiceCount: number }
}

const CHART_COLORS = {
  revenue: '#4ade80',
  expenses: '#f87171',
  laborCost: '#60a5fa',
  netProfit: '#4ade80',
  expected: '#60a5fa',
  overdue: '#f87171',
  grid: '#222222',
  text: '#888888',
}

interface Props {
  pnlData: PnLRow[]
  cashFlowData: CashFlowData | null
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-g85 border border-g80 rounded-md p-3 shadow-xl">
      <p className="text-xs font-mono text-g40 mb-2">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-g30">{entry.name}:</span>
          <span className="font-mono text-white">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function FinanceCharts({ pnlData, cashFlowData }: Props) {
  if (!pnlData.length && !cashFlowData) {
    return (
      <div className="text-center py-8 text-g40 text-sm font-mono">
        Cargando datos financieros...
      </div>
    )
  }

  const totalRevenue = pnlData.reduce((sum, p) => sum + p.revenue, 0)
  const totalExpenses = pnlData.reduce((sum, p) => sum + p.expenses, 0)
  const totalLabor = pnlData.reduce((sum, p) => sum + p.laborCost, 0)
  const totalProfit = pnlData.reduce((sum, p) => sum + p.netProfit, 0)
  const avgMargin = pnlData.length > 0 ? Math.round(pnlData.reduce((sum, p) => sum + p.margin, 0) / pnlData.length) : 0

  return (
    <div className="space-y-6">
      {/* P&L Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-mono text-g40 uppercase">Ingresos</p>
            <p className="font-display text-2xl text-green-400 mt-1">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-mono text-g40 uppercase">Costos</p>
            <p className="font-display text-2xl text-red-400 mt-1">{formatCurrency(totalExpenses + totalLabor)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-mono text-g40 uppercase">Utilidad Neta</p>
            <p className="font-display text-2xl text-white mt-1">{formatCurrency(totalProfit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs font-mono text-g40 uppercase">Margen Promedio</p>
            <p className="font-display text-2xl text-white mt-1">{avgMargin}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* P&L by Project — Horizontal Bar */}
        <div className="bg-g85 border border-g80 rounded-md p-5">
          <h3 className="font-mono text-sm text-g40 uppercase tracking-wider mb-4">Rentabilidad por Proyecto</h3>
          <div style={{ height: Math.max(200, pnlData.length * 48) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={pnlData}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 60, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={v => formatCurrency(v)}
                  tick={{ fill: CHART_COLORS.text, fontSize: 10, fontFamily: 'DM Mono' }}
                  axisLine={{ stroke: CHART_COLORS.grid }}
                />
                <YAxis
                  type="category"
                  dataKey="code"
                  tick={{ fill: CHART_COLORS.text, fontSize: 11, fontFamily: 'DM Mono' }}
                  axisLine={{ stroke: CHART_COLORS.grid }}
                  width={56}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{ fontSize: 11, fontFamily: 'DM Mono' }}
                  formatter={(value) => <span style={{ color: CHART_COLORS.text }}>{value}</span>}
                />
                <Bar dataKey="revenue" name="Ingresos" fill={CHART_COLORS.revenue} radius={[0, 2, 2, 0]} />
                <Bar dataKey="netProfit" name="Utilidad Neta" fill={CHART_COLORS.netProfit} radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cash Flow — Area chart */}
        {cashFlowData && cashFlowData.weekly.length > 0 && (
          <div className="bg-g85 border border-g80 rounded-md p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-mono text-sm text-g40 uppercase tracking-wider">Flujo de Caja (90 días)</h3>
                <div className="flex gap-4 mt-2">
                  <span className="text-xs text-g40">
                    Esperado: <span className="text-blue-400">{formatCurrency(cashFlowData.summary.totalExpected)}</span>
                  </span>
                  <span className="text-xs text-g40">
                    Vencido: <span className="text-red-400">{formatCurrency(cashFlowData.summary.totalOverdue)}</span>
                  </span>
                </div>
              </div>
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cashFlowData.weekly} margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                  <XAxis
                    dataKey="week"
                    tick={{ fill: CHART_COLORS.text, fontSize: 9, fontFamily: 'DM Mono' }}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                    interval={1}
                  />
                  <YAxis
                    tickFormatter={v => formatCurrency(v)}
                    tick={{ fill: CHART_COLORS.text, fontSize: 10, fontFamily: 'DM Mono' }}
                    axisLine={{ stroke: CHART_COLORS.grid }}
                    width={70}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, fontFamily: 'DM Mono' }}
                    formatter={(value) => <span style={{ color: CHART_COLORS.text }}>{value}</span>}
                  />
                  <Area
                    type="monotone"
                    dataKey="expected"
                    name="Esperado"
                    stroke={CHART_COLORS.expected}
                    fill={CHART_COLORS.expected}
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="overdue"
                    name="Vencido"
                    stroke={CHART_COLORS.overdue}
                    fill={CHART_COLORS.overdue}
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* P&L Table */}
      {pnlData.length > 0 && (
        <div className="bg-g85 border border-g80 rounded-md overflow-hidden">
          <div className="px-4 py-3 border-b border-g80">
            <h3 className="font-mono text-sm text-g40 uppercase tracking-wider">Detalle P&L por Proyecto</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-g80">
                <th className="px-4 py-2.5 text-left text-xs font-mono text-g40 uppercase">Proyecto</th>
                <th className="px-4 py-2.5 text-right text-xs font-mono text-g40 uppercase">Ingresos</th>
                <th className="px-4 py-2.5 text-right text-xs font-mono text-g40 uppercase">Gastos</th>
                <th className="px-4 py-2.5 text-right text-xs font-mono text-g40 uppercase">Mano de Obra</th>
                <th className="px-4 py-2.5 text-right text-xs font-mono text-g40 uppercase">Utilidad</th>
                <th className="px-4 py-2.5 text-right text-xs font-mono text-g40 uppercase">Margen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-g80/50">
              {pnlData.map(p => (
                <tr key={p.projectId} className="hover:bg-g80/30">
                  <td className="px-4 py-2.5">
                    <p className="text-sm font-mono text-g10">{p.code}</p>
                    <p className="text-sm text-g20">{p.name}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm font-mono text-green-400">
                    {formatCurrency(p.revenue)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm font-mono text-red-400">
                    {formatCurrency(p.expenses)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-sm font-mono text-blue-400">
                    {formatCurrency(p.laborCost)}
                  </td>
                  <td className={`px-4 py-2.5 text-right text-sm font-mono ${p.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(p.netProfit)}
                  </td>
                  <td className={`px-4 py-2.5 text-right text-sm font-mono ${p.margin >= 30 ? 'text-green-400' : p.margin >= 15 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {p.margin}%
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className="border-t border-g80 bg-g80/30">
                <td className="px-4 py-2.5">
                  <p className="text-sm font-mono text-white font-medium">TOTAL</p>
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-mono text-green-400 font-medium">
                  {formatCurrency(totalRevenue)}
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-mono text-red-400 font-medium">
                  {formatCurrency(totalExpenses)}
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-mono text-blue-400 font-medium">
                  {formatCurrency(totalLabor)}
                </td>
                <td className={`px-4 py-2.5 text-right text-sm font-mono font-medium ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(totalProfit)}
                </td>
                <td className="px-4 py-2.5 text-right text-sm font-mono text-white font-medium">
                  {avgMargin}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}