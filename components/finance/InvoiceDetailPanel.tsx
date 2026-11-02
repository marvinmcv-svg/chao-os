'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Download, Send, Banknote, AlertTriangle, ArrowUpRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Drawer } from '@/components/ui/Drawer'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { ErrorBanner, Skeleton } from '@/components/ui/EmptyState'
import { api } from '@/lib/api-client'
import { INVOICE_STATUS, meta } from '@/lib/labels'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Invoice {
  id: string
  number: string
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

const METHODS = ['Transferencia', 'Depósito', 'Cheque', 'QR', 'Efectivo']

export function InvoiceDetailPanel({ invoiceId, open, onClose, onUpdate }: Props) {
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPay, setShowPay] = useState(false)
  const [pay, setPay] = useState({ amount: '', method: METHODS[0], reference: '' })

  const fetchInvoice = useCallback(async () => {
    if (!invoiceId) return
    setLoading(true)
    setError(null)
    try {
      const inv = await api<Invoice>(`/api/invoices/${invoiceId}`)
      setInvoice(inv)
      setPay((p) => ({ ...p, amount: String(Math.max(0, Math.round((inv.amountUSD - inv.paidAmount) * 100) / 100)) }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Factura no encontrada')
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => {
    if (invoiceId && open) fetchInvoice()
    if (!open) {
      setInvoice(null)
      setShowPay(false)
    }
  }, [invoiceId, open, fetchInvoice])

  async function run(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await fetchInvoice()
      onUpdate()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la acción')
      return false
    } finally {
      setBusy(false)
    }
  }

  const updateStatus = (status: string) =>
    run(() => api(`/api/invoices/${invoiceId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }))

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(pay.amount)
    if (!(amount > 0)) return setError('Ingresa un monto válido')
    const ok = await run(() =>
      api(`/api/invoices/${invoiceId}/payments`, {
        method: 'POST',
        body: JSON.stringify({ amountUSD: amount, method: pay.method, reference: pay.reference || undefined }),
      })
    )
    if (ok) {
      setShowPay(false)
      setPay((p) => ({ ...p, reference: '' }))
    }
  }

  const remaining = invoice ? Math.max(0, invoice.amountUSD - (invoice.paidAmount || 0)) : 0
  const isPaid = invoice?.status === 'PAID'
  const isOverdue = !!invoice && !isPaid && invoice.status !== 'DRAFT' && new Date(invoice.dueDate) < new Date()
  const st = invoice ? (isOverdue ? { label: 'Vencida', variant: 'red' as const } : meta(INVOICE_STATUS, invoice.status)) : null
  const paidPct = invoice && invoice.amountUSD > 0 ? ((invoice.paidAmount || 0) / invoice.amountUSD) * 100 : 0

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow={invoice ? `${invoice.project.code} · ${invoice.client.company}` : 'Factura'}
      title={invoice?.number ?? (loading ? 'Cargando…' : '')}
      actions={
        invoice && (
          <Button size="sm" variant="ghost" onClick={() => window.open(`/api/invoices/${invoice.id}/pdf`, '_blank')} aria-label="Descargar PDF">
            <Download className="w-4 h-4" /> PDF
          </Button>
        )
      }
    >
      {error && <div className="px-6 pt-4"><ErrorBanner message={error} /></div>}

      {loading && !invoice ? (
        <div className="p-6 space-y-4"><Skeleton className="h-28" /><Skeleton className="h-20" /><Skeleton className="h-32" /></div>
      ) : invoice && st ? (
        <div className="p-6 space-y-6">
          <div className="rounded-lg border border-g80 bg-g85 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-2xs font-mono text-g40 uppercase tracking-wider">Monto</p>
                <p className="font-display text-4xl text-white mt-1 tabular">{formatCurrency(invoice.amountUSD)}</p>
                {invoice.currency === 'BOB' && (
                  <p className="text-xs text-g40 mt-1 font-mono">
                    Bs. {(invoice.amountUSD * invoice.exchangeRate).toLocaleString('es-BO', { minimumFractionDigits: 2 })} · TC {invoice.exchangeRate}
                  </p>
                )}
              </div>
              <Badge variant={st.variant} dot>{st.label}</Badge>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-2xs font-mono text-g40 mb-1.5 tabular">
                <span>Cobrado {formatCurrency(invoice.paidAmount || 0)}</span>
                <span className={remaining > 0 ? (isOverdue ? 'text-red-300' : 'text-yellow-300') : 'text-green-300'}>
                  {remaining > 0 ? `Saldo ${formatCurrency(remaining)}` : 'Saldado'}
                </span>
              </div>
              <ProgressBar value={isPaid ? 100 : paidPct} variant={isPaid || remaining === 0 ? 'green' : isOverdue ? 'red' : 'yellow'} />
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-g80 text-sm">
              <div>
                <p className="text-2xs font-mono text-g40 uppercase">Emitida</p>
                <p className="text-g10 mt-0.5">{formatDate(invoice.issuedAt)}</p>
              </div>
              <div>
                <p className="text-2xs font-mono text-g40 uppercase">Vence</p>
                <p className={isOverdue ? 'text-red-300 mt-0.5' : 'text-g10 mt-0.5'}>{formatDate(invoice.dueDate)}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          {!isPaid && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {invoice.status === 'DRAFT' && (
                  <Button size="sm" onClick={() => updateStatus('SENT')} loading={busy}>
                    <Send className="w-4 h-4" /> Emitir y enviar
                  </Button>
                )}
                {invoice.status !== 'DRAFT' && (
                  <Button size="sm" variant="success" onClick={() => setShowPay((s) => !s)} disabled={busy}>
                    <Banknote className="w-4 h-4" /> Registrar pago
                  </Button>
                )}
                {invoice.status !== 'DRAFT' && invoice.status !== 'OVERDUE' && isOverdue && (
                  <Button size="sm" variant="danger" onClick={() => updateStatus('OVERDUE')} disabled={busy}>
                    <AlertTriangle className="w-4 h-4" /> Marcar vencida
                  </Button>
                )}
              </div>

              {showPay && (
                <form onSubmit={recordPayment} className="rounded-lg border border-green-800/50 bg-green-950/20 p-4 space-y-3 animate-pop-in">
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Monto (USD)" type="number" step="0.01" min="0.01" max={remaining} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} required />
                    <Select label="Método" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} options={METHODS.map((m) => ({ value: m, label: m }))} />
                  </div>
                  <Input label="Referencia (opcional)" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="N° de transferencia" />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-2xs text-g40">Al cubrir el saldo la factura pasa a <span className="text-green-300">Pagada</span> automáticamente.</p>
                    <Button type="submit" size="sm" loading={busy}>Guardar pago</Button>
                  </div>
                </form>
              )}
            </div>
          )}

          {isPaid && invoice.paidAt && (
            <div className="flex items-center gap-2 text-sm text-green-300">
              <CheckCircle2 className="w-4 h-4" /> Pagada el {formatDate(invoice.paidAt)}
            </div>
          )}

          {/* Line items */}
          {invoice.lineItems.length > 0 && (
            <section>
              <h3 className="text-2xs font-mono text-g40 uppercase tracking-[0.14em] mb-2">Concepto</h3>
              <div className="divide-y divide-g80 border border-g80 rounded-lg overflow-hidden">
                {invoice.lineItems.map((item) => (
                  <div key={item.id} className="flex justify-between gap-3 px-3.5 py-2.5 bg-g85">
                    <div className="min-w-0">
                      <p className="text-sm text-g10">{item.description}</p>
                      {item.quantity !== 1 && <p className="text-2xs font-mono text-g40">{item.quantity} × {formatCurrency(item.unitPriceUSD)}</p>}
                    </div>
                    <p className="text-sm font-mono text-white tabular">{formatCurrency(item.totalUSD)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Payments */}
          <section>
            <h3 className="text-2xs font-mono text-g40 uppercase tracking-[0.14em] mb-2">Pagos ({invoice.payments.length})</h3>
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-g40">Sin pagos registrados.</p>
            ) : (
              <div className="divide-y divide-g80 border border-g80 rounded-lg overflow-hidden">
                {invoice.payments.map((p) => (
                  <div key={p.id} className="flex justify-between px-3.5 py-2.5 bg-g85">
                    <div>
                      <p className="text-sm text-g10">{formatDate(p.paidAt)}</p>
                      <p className="text-2xs font-mono text-g40">{[p.method, p.reference].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                    <p className="text-sm font-mono text-green-300 tabular">{formatCurrency(p.amountUSD)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Client + project */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-g80 bg-g85 p-4">
              <p className="text-2xs font-mono text-g40 uppercase tracking-wider mb-2">Cliente</p>
              <p className="text-sm text-white">{invoice.client.company}</p>
              <p className="text-xs text-g30">{invoice.client.name}</p>
              <p className="text-xs text-g40 mt-1 truncate">{invoice.client.email}</p>
            </div>
            <Link href={`/projects?id=${invoice.project.id}`} className="rounded-lg border border-g80 bg-g85 p-4 hover:border-g70 group">
              <p className="text-2xs font-mono text-g40 uppercase tracking-wider mb-2 flex items-center justify-between">
                Proyecto <ArrowUpRight className="w-3 h-3 group-hover:text-white" />
              </p>
              <p className="text-sm text-white">{invoice.project.name}</p>
              <p className="text-xs font-mono text-g40">{invoice.project.code}</p>
            </Link>
          </div>

          {invoice.notes && (
            <section>
              <h3 className="text-2xs font-mono text-g40 uppercase tracking-[0.14em] mb-1">Notas</h3>
              <p className="text-sm text-g20 whitespace-pre-wrap">{invoice.notes}</p>
            </section>
          )}
        </div>
      ) : null}
    </Drawer>
  )
}
