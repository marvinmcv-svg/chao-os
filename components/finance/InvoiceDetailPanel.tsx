'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Download, CheckCircle, Clock, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Invoice {
  id: string
  number: string
  milestoneLabel: string
  amountUSD: number
  currency: string
  exchangeRate: number
  status: string
  issuedAt: string
  dueDate: string
  paidAt: string | null
  notes: string
  project: { id: string; code: string; name: string }
  client: { id: string; name: string; company: string; email: string; phone: string }
  lineItems: { id: string; description: string; quantity: number; unitPriceUSD: number; totalUSD: number }[]
  payments: { id: string; amountUSD: number; paidAt: string; method: string | null; reference: string | null }[]
  paidAmount: number
}

interface Props {
  invoiceId: string | null
  open: boolean
  onClose: () => void
  onUpdate: () => void
}

export function InvoiceDetailPanel({ invoiceId, open, onClose, onUpdate }: Props) {
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(false)
  const [updating, setUpdating] = useState(false)

  const fetchInvoice = useCallback(async () => {
    if (!invoiceId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`)
      const json = await res.json()
      if (json.success) setInvoice(json.data)
    } catch (e) {
      console.error('Failed to fetch invoice', e)
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => {
    if (invoiceId && open) {
      fetchInvoice()
    }
    if (!open) setInvoice(null)
  }, [invoiceId, open, fetchInvoice])

  async function updateStatus(newStatus: string) {
    if (!invoice) return
    setUpdating(true)
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const json = await res.json()
      if (json.success) {
        onUpdate()
        fetchInvoice()
      }
    } catch (e) {
      console.error('Failed to update status', e)
    } finally {
      setUpdating(false)
    }
  }

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const remaining = invoice ? invoice.amountUSD - (invoice.paidAmount || 0) : 0
  const isPaid = invoice?.status === 'PAID'
  const isOverdue = invoice && invoice.status !== 'PAID' && new Date(invoice.dueDate) < new Date()

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen w-[480px] bg-g90 border-l border-g80 z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-g90 border-b border-g80 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-mono text-g40">{invoice?.number}</p>
            <h2 className="font-display text-xl text-white mt-0.5">{invoice?.milestoneLabel}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-g40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-g40 text-sm font-mono">Cargando...</div>
        ) : invoice ? (
          <div className="p-6 space-y-6">
            {/* Status */}
            <div className="flex items-center gap-3">
              <Badge variant={isPaid ? 'green' : isOverdue ? 'red' : 'yellow'}>
                {isPaid ? 'Pagada' : isOverdue ? 'Vencida' : invoice.status}
              </Badge>
              <span className="text-sm text-g30">
                {isPaid ? `Pagada el ${formatDate(invoice.paidAt!)}` : ''}
              </span>
            </div>

            {/* Amount */}
            <div className="bg-g85 border border-g80 rounded-md p-5">
              <p className="text-xs font-mono text-g40">Monto Total</p>
              <p className="text-3xl font-display text-white mt-1">{formatCurrency(invoice.amountUSD)}</p>
              {invoice.currency === 'BOB' && (
                <p className="text-xs text-g40 mt-1">Bs. {(invoice.amountUSD * invoice.exchangeRate).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</p>
              )}
              {!isPaid && remaining > 0 && (
                <div className="mt-3 pt-3 border-t border-g80">
                  <p className="text-xs font-mono text-g40">Saldo pendiente</p>
                  <p className="text-lg font-mono text-yellow-400">{formatCurrency(remaining)}</p>
                </div>
              )}
            </div>

            {/* Status actions */}
            {!isPaid && (
              <div className="space-y-2">
                <p className="text-xs font-mono text-g40 uppercase">Cambiar estado</p>
                <div className="flex flex-wrap gap-2">
                  {invoice.status === 'DRAFT' && (
                    <Button size="sm" onClick={() => updateStatus('SENT')} disabled={updating}>Marcar como Enviada</Button>
                  )}
                  {['SENT', 'PENDING'].includes(invoice.status) && (
                    <Button size="sm" variant="secondary" onClick={() => updateStatus('PENDING')} disabled={updating}>Marcar Pendiente</Button>
                  )}
                  {!isOverdue && ['SENT', 'PENDING'].includes(invoice.status) && (
                    <Button size="sm" variant="secondary" onClick={() => updateStatus('OVERDUE')} disabled={updating}>Marcar Vencida</Button>
                  )}
                  <Button size="sm" variant="primary" onClick={() => updateStatus('PAID')} disabled={updating}>
                    <CheckCircle className="w-4 h-4 mr-1" /> Marcar Pagada
                  </Button>
                </div>
              </div>
            )}

            {/* Client */}
            <div className="bg-g85 border border-g80 rounded-md p-4">
              <h3 className="text-xs font-mono text-g40 uppercase tracking-wider mb-2">Cliente</h3>
              <p className="text-white font-medium">{invoice.client.name}</p>
              <p className="text-sm text-g30">{invoice.client.company}</p>
              <p className="text-xs text-g40 mt-1">{invoice.client.email}</p>
            </div>

            {/* Project */}
            <div className="bg-g85 border border-g80 rounded-md p-4">
              <h3 className="text-xs font-mono text-g40 uppercase tracking-wider mb-2">Proyecto</h3>
              <p className="text-white">{invoice.project.name}</p>
              <p className="text-xs font-mono text-g40">{invoice.project.code}</p>
            </div>

            {/* Dates */}
            <div className="flex gap-4 text-sm">
              <div>
                <p className="text-xs font-mono text-g40">Emitida</p>
                <p className="text-g20 mt-0.5">{formatDate(invoice.issuedAt)}</p>
              </div>
              <div>
                <p className="text-xs font-mono text-g40">Vence</p>
                <p className={isOverdue ? 'text-red-400 mt-0.5' : 'text-g20 mt-0.5'}>{formatDate(invoice.dueDate)}</p>
              </div>
            </div>

            {/* Line items */}
            {invoice.lineItems.length > 0 && (
              <div>
                <h3 className="text-xs font-mono text-g40 uppercase tracking-wider mb-2">Línea de detalles</h3>
                <div className="space-y-2">
                  {invoice.lineItems.map(item => (
                    <div key={item.id} className="flex justify-between py-2 border-b border-g80/50 last:border-0">
                      <div>
                        <p className="text-sm text-g20">{item.description}</p>
                        <p className="text-xs text-g40">{item.quantity} × {formatCurrency(item.unitPriceUSD)}</p>
                      </div>
                      <p className="text-sm font-mono text-white">{formatCurrency(item.totalUSD)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Payments history */}
            {invoice.payments.length > 0 && (
              <div>
                <h3 className="text-xs font-mono text-g40 uppercase tracking-wider mb-2">Pagos ({invoice.payments.length})</h3>
                <div className="space-y-2">
                  {invoice.payments.map(p => (
                    <div key={p.id} className="flex justify-between py-2 border-b border-g80/50 last:border-0">
                      <div>
                        <p className="text-sm text-g20">{formatDate(p.paidAt)}</p>
                        {p.method && <p className="text-xs text-g40">{p.method}{p.reference ? ` — ${p.reference}` : ''}</p>}
                      </div>
                      <p className="text-sm font-mono text-green-400">{formatCurrency(p.amountUSD)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {invoice.notes && (
              <div>
                <h3 className="text-xs font-mono text-g40 uppercase tracking-wider mb-1">Notas</h3>
                <p className="text-sm text-g20 whitespace-pre-wrap">{invoice.notes}</p>
              </div>
            )}

            {/* PDF download */}
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => window.open(`/api/invoices/${invoice.id}/pdf`, '_blank')}
            >
              <Download className="w-4 h-4 mr-2" />
              Descargar PDF
            </Button>
          </div>
        ) : (
          <div className="p-6 text-center text-g40 text-sm">Factura no encontrada</div>
        )}
      </div>
    </>
  )
}