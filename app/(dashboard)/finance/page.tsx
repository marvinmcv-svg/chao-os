'use client'

import { useState, useEffect } from 'react'
import { Plus, Search, Eye, FileText, Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { InvoiceDetailPanel } from '@/components/finance/InvoiceDetailPanel'
import { NewInvoiceModal } from '@/components/modals/NewInvoiceModal'
import { FinanceCharts } from '@/components/finance/FinanceCharts'

interface Invoice {
  id: string
  invoiceNumber: string
  clientName: string
  projectCode: string
  amount: number
  status: 'draft' | 'sent' | 'paid' | 'overdue'
  issuedDate: string
  dueDate: string
}

const MOCK_INVOICES: Invoice[] = [
  { id: '1', invoiceNumber: 'INV-2025-001', clientName: 'TechCorp SRL', projectCode: 'TC-001', amount: 8500, status: 'paid', issuedDate: '2025-02-01', dueDate: '2025-02-15' },
  { id: '2', invoiceNumber: 'INV-2025-002', clientName: 'MediaLab SA', projectCode: 'ML-002', amount: 12300, status: 'sent', issuedDate: '2025-02-10', dueDate: '2025-02-25' },
  { id: '3', invoiceNumber: 'INV-2025-003', clientName: 'RetailPro', projectCode: 'RP-003', amount: 5600, status: 'overdue', issuedDate: '2025-01-15', dueDate: '2025-01-30' },
  { id: '4', invoiceNumber: 'INV-2025-004', clientName: 'FoodBrand', projectCode: 'FB-004', amount: 9200, status: 'draft', issuedDate: '2025-02-20', dueDate: '2025-03-06' },
]

const MOCK_PNL = [
  { projectId: 'p1', code: 'TC-001', name: 'TechCorp — Identidad Visual', revenue: 15000, expenses: 4200, laborCost: 6300, netProfit: 4500, margin: 30, hoursLogged: 120 },
  { projectId: 'p2', code: 'ML-002', name: 'MediaLab — Campaña Q1', revenue: 22000, expenses: 8800, laborCost: 7700, netProfit: 5500, margin: 25, hoursLogged: 200 },
  { projectId: 'p3', code: 'RP-003', name: 'RetailPro — Rebrand', revenue: 8500, expenses: 2100, laborCost: 3400, netProfit: 3000, margin: 35, hoursLogged: 80 },
  { projectId: 'p4', code: 'FB-004', name: 'FoodBrand — Packaging', revenue: 18000, expenses: 5400, laborCost: 7200, netProfit: 5400, margin: 30, hoursLogged: 160 },
  { projectId: 'p5', code: 'NX-005', name: 'Nexus — App MVP', revenue: 35000, expenses: 14200, laborCost: 15400, netProfit: 5400, margin: 15, hoursLogged: 340 },
]

const MOCK_CASHFLOW = {
  weekly: [
    { week: 'S1', expected: 12000, overdue: 0 },
    { week: 'S2', expected: 8500, overdue: 2300 },
    { week: 'S3', expected: 15000, overdue: 1200 },
    { week: 'S4', expected: 9800, overdue: 4500 },
    { week: 'S5', expected: 22000, overdue: 800 },
    { week: 'S6', expected: 17500, overdue: 3100 },
    { week: 'S7', expected: 13000, overdue: 2200 },
    { week: 'S8', expected: 9000, overdue: 0 },
    { week: 'S9', expected: 25000, overdue: 5000 },
    { week: 'S10', expected: 11000, overdue: 1800 },
    { week: 'S11', expected: 19000, overdue: 900 },
    { week: 'S12', expected: 7500, overdue: 4200 },
  ],
  summary: { totalExpected: 169300, totalOverdue: 25100, invoiceCount: 28 },
}

const STATUS_CONFIG = {
  draft: { label: 'Borrador', className: 'bg-g80 text-g40 border-g75' },
  sent: { label: 'Enviada', className: 'bg-blue-400/10 text-blue-400 border-blue-400/30' },
  paid: { label: 'Pagada', className: 'bg-green-400/10 text-green-400 border-green-400/30' },
  overdue: { label: 'Vencida', className: 'bg-red-400/10 text-red-400 border-red-400/30' },
}

export default function FinancePage() {
  const [invoices] = useState<Invoice[]>(MOCK_INVOICES)
  const [search, setSearch] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [showNewInvoice, setShowNewInvoice] = useState(false)
  const [activeView, setActiveView] = useState<'invoices' | 'charts'>('invoices')

  const filteredInvoices = invoices.filter(inv =>
    inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
    inv.clientName.toLowerCase().includes(search.toLowerCase()) ||
    inv.projectCode.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-white">Finanzas</h1>
          <p className="text-g40 mt-1 text-sm font-mono">Facturación y control financiero — CHAO OS</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant={activeView === 'charts' ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setActiveView('charts')}
          >
            Gráficos
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setActiveView('invoices')}>
            Facturas
          </Button>
          <Button size="sm" onClick={() => setShowNewInvoice(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Nueva Factura
          </Button>
        </div>
      </div>

      {/* Charts view */}
      {activeView === 'charts' && (
        <FinanceCharts pnlData={MOCK_PNL} cashFlowData={MOCK_CASHFLOW} />
      )}

      {/* Invoices view */}
      {activeView === 'invoices' && (
        <>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-g40" />
            <input
              type="text"
              placeholder="Buscar por número, cliente o proyecto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-g85 border border-g80 rounded-md text-sm text-g10 placeholder:text-g40 focus:outline-none focus:border-g75 font-mono"
            />
          </div>

          {/* Invoice list */}
          <div className="space-y-2">
            {filteredInvoices.map(invoice => {
              const status = STATUS_CONFIG[invoice.status]
              return (
                <Card key={invoice.id} onClick={() => setSelectedInvoice(invoice)}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-g80 rounded">
                        <FileText className="w-4 h-4 text-g40" />
                      </div>
                      <div>
                        <p className="text-sm font-mono text-g10">{invoice.invoiceNumber}</p>
                        <p className="text-sm text-g20">{invoice.clientName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm font-mono text-white">${invoice.amount.toLocaleString()}</p>
                        <p className="text-xs text-g40">{invoice.projectCode}</p>
                      </div>
                      <Badge className={status.className}>{status.label}</Badge>
                      <Eye className="w-4 h-4 text-g40" />
                    </div>
                  </CardContent>
                </Card>
              )
            })}

            {filteredInvoices.length === 0 && (
              <div className="text-center py-8 text-g40 text-sm font-mono">
                No se encontraron facturas
              </div>
            )}
          </div>

          {/* Stats summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs font-mono text-g40 uppercase">Total Facturado</p>
                <p className="font-display text-2xl text-white mt-1">
                  ${invoices.reduce((s, i) => s + i.amount, 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs font-mono text-g40 uppercase">Pendiente</p>
                <p className="font-display text-2xl text-yellow-400 mt-1">
                  ${invoices.filter(i => i.status === 'sent').reduce((s, i) => s + i.amount, 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs font-mono text-g40 uppercase">Cobrado</p>
                <p className="font-display text-2xl text-green-400 mt-1">
                  ${invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-xs font-mono text-g40 uppercase">Vencido</p>
                <p className="font-display text-2xl text-red-400 mt-1">
                  ${invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.amount, 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Invoice detail panel */}
      {selectedInvoice && (
        <InvoiceDetailPanel
          invoiceId={selectedInvoice.id}
          open={true}
          onClose={() => setSelectedInvoice(null)}
          onUpdate={() => {}}
        />
      )}

      {/* New invoice modal */}
      {showNewInvoice && (
        <NewInvoiceModal open={showNewInvoice} onClose={() => setShowNewInvoice(false)} onSuccess={() => setShowNewInvoice(false)} />
      )}
    </div>
  )
}