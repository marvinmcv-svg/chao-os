import { notFound, redirect } from 'next/navigation'
import QRCode from 'qrcode'
import { auth } from '@/lib/auth'
import { DomainError } from '@/lib/result'
import { FiscalService } from '@/services/FiscalService'
import { DOC_TYPES, LEYENDA_ILICITO, amountInWords, round2, siatQrUrl, taxSplit } from '@/lib/siat'
import { formatCurrency } from '@/lib/utils'
import { PrintButton } from '@/app/proposals/[id]/print/PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Factura · CHAO' }

const bs = (n: number) => n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** Bolivia (UTC−4) date + time, e.g. 09/11/2026 10:23 */
const fmtDateTime = (d: Date) => {
  const t = new Date(d.getTime() - 4 * 3_600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)}/${t.getUTCFullYear()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`
}

/**
 * Invoice print view (A4 / "media página" style). Issued invoices follow
 * the SIN graphic representation: issuer and buyer data, CUF, detail in
 * bolivianos, amount in words, legends and the verification QR. Invoices
 * not issued to the SIN print as a non-fiscal "nota de cobro".
 */
export default async function InvoicePrintPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  let view: Awaited<ReturnType<typeof FiscalService.fiscalView>>
  try {
    view = await FiscalService.fiscalView(params.id)
  } catch (e) {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound()
    throw e
  }
  const { invoice: inv, settings: s } = view
  const fiscal = inv.fiscalStatus !== 'NOT_ISSUED'
  const inBs = fiscal || inv.currency === 'BOB'
  const rate = inv.exchangeRate || s.exchangeRate
  const lines = inv.lineItems.map((l) => {
    const unit = fiscal ? l.unitPriceBOB ?? round2(l.unitPriceUSD * rate) : inBs ? round2(l.unitPriceUSD * rate) : l.unitPriceUSD
    const total = fiscal ? l.totalBOB ?? round2(unit * l.quantity) : round2(unit * l.quantity)
    return { ...l, unit, total }
  })
  const total = fiscal ? inv.amountBOB ?? 0 : round2(lines.reduce((a, l) => a + l.total, 0))
  const t = taxSplit(total)
  const qrUrl = fiscal && inv.cuf ? siatQrUrl({ nit: s.nit, cuf: inv.cuf, numero: inv.fiscalNumber!, ambiente: s.ambiente }) : null
  const qrSvg = qrUrl ? await QRCode.toString(qrUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }) : null
  const watermark =
    inv.fiscalStatus === 'ANNULLED' ? 'ANULADA' : inv.fiscalStatus === 'ISSUED' ? 'PENDIENTE DE VALIDACIÓN SIN' : !fiscal ? 'SIN VALOR FISCAL' : null
  const docLabel = inv.buyerDocType ? (inv.buyerDocType === 'NIT' ? 'NIT' : DOC_TYPES[inv.buyerDocType].label) : 'NIT/CI/CEX'
  const money = (n: number) => (inBs ? bs(n) : formatCurrency(n))

  return (
    <div className="invoice-doc flow-root min-h-screen bg-neutral-200 print:bg-white text-neutral-900 font-ui">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print { .no-print { display: none !important } .sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important } body { background: #fff !important } }
        .invoice-doc table { border-collapse: collapse; width: 100% }
        .invoice-doc td, .invoice-doc th { padding: 6px 8px }
        .invoice-doc .qr svg { width: 100%; height: 100% }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white/90 backdrop-blur border-b border-neutral-300">
        <p className="text-sm text-neutral-600">
          {inv.number}
          {fiscal && ` · Factura N° ${inv.fiscalNumber}`}
          {inv.fiscalStatus === 'ISSUED' && <span className="ml-2 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">Pendiente de validación SIN</span>}
          {inv.fiscalStatus === 'ANNULLED' && <span className="ml-2 px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs">Anulada</span>}
          {!fiscal && <span className="ml-2 px-2 py-0.5 rounded bg-neutral-200 text-neutral-700 text-xs">Sin factura fiscal</span>}
        </p>
        <PrintButton />
      </div>

      <div className="sheet relative bg-white max-w-[800px] mx-auto my-6 p-10 shadow-lg print:p-0 text-[12px] leading-snug overflow-hidden">
        {watermark && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="text-[42px] font-bold tracking-widest text-neutral-900/[0.07] -rotate-[24deg] whitespace-nowrap select-none">{watermark}</span>
          </div>
        )}

        <header className="grid grid-cols-[1fr_auto] gap-6 items-start">
          <div>
            <p className="text-base font-bold uppercase">{s.razonSocial}</p>
            <p>{s.sucursal === 0 ? 'CASA MATRIZ' : `SUCURSAL N° ${s.sucursal}`}</p>
            <p>N° Punto de Venta {s.puntoVenta}</p>
            {s.direccion && <p>{s.direccion}</p>}
            {s.telefono && <p>Teléfono: {s.telefono}</p>}
            <p>{s.municipio}</p>
          </div>
          <table className="text-[11px] w-auto">
            <tbody>
              <tr><th className="text-left font-bold">NIT</th><td className="font-mono">{s.nit || '—'}</td></tr>
              <tr><th className="text-left font-bold">{fiscal ? 'FACTURA N°' : 'NOTA N°'}</th><td className="font-mono">{fiscal ? inv.fiscalNumber : inv.number}</td></tr>
              {fiscal && (
                <tr><th className="text-left font-bold align-top">CÓD. AUTORIZACIÓN</th><td className="font-mono break-all max-w-[230px]">{inv.cuf}</td></tr>
              )}
            </tbody>
          </table>
        </header>

        <h1 className="text-center text-lg font-bold mt-6">{fiscal ? 'FACTURA' : 'NOTA DE COBRO'}</h1>
        <p className="text-center text-[11px]">{fiscal ? '(Con Derecho a Crédito Fiscal)' : '(Documento sin valor fiscal)'}</p>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 mt-5 text-[11.5px]">
          <p><b>Fecha:</b> {fmtDateTime(inv.fiscalIssuedAt ?? inv.issuedAt)}</p>
          <p><b>{docLabel}:</b> {inv.buyerDocNumber ?? inv.client.docNumber ?? '—'}{(inv.buyerDocComplement ?? inv.client.docComplement) ? `-${inv.buyerDocComplement ?? inv.client.docComplement}` : ''}</p>
          <p><b>Nombre/Razón Social:</b> {inv.buyerName ?? (inv.client.billingName || inv.client.company)}</p>
          <p><b>Cód. Cliente:</b> {inv.client.id.slice(-8).toUpperCase()}</p>
          <p className="sm:col-span-2"><b>Proyecto:</b> {inv.project.code} · {inv.project.name}</p>
        </section>

        <table className="mt-5 text-[11px] border border-neutral-400">
          <thead className="bg-neutral-100">
            <tr className="border-b border-neutral-400">
              <th className="text-left">CÓDIGO</th>
              <th className="text-right">CANTIDAD</th>
              <th className="text-left">UNIDAD</th>
              <th className="text-left">DESCRIPCIÓN</th>
              <th className="text-right">PRECIO UNIT.</th>
              <th className="text-right">DESCUENTO</th>
              <th className="text-right">SUBTOTAL</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-neutral-200 align-top">
                <td className="font-mono">{s.codigoProductoSin || '—'}</td>
                <td className="text-right font-mono">{l.quantity.toLocaleString('es-BO', { maximumFractionDigits: 2 })}</td>
                <td>Servicio</td>
                <td>{l.description}</td>
                <td className="text-right font-mono">{money(l.unit)}</td>
                <td className="text-right font-mono">{money(0)}</td>
                <td className="text-right font-mono">{money(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_300px] gap-6 mt-3">
          <p className="text-[11.5px] self-end">
            <b>Son:</b> {inBs ? amountInWords(total) : amountInWords(total, 'Dólares estadounidenses')}
            {fiscal && inv.currency === 'USD' && <span className="block text-[10.5px] text-neutral-600 mt-1">Tipo de cambio: {rate} Bs/USD · Equivalente {formatCurrency(inv.amountUSD)}</span>}
          </p>
          <table className="text-[11.5px]">
            <tbody>
              <tr><td>SUBTOTAL {inBs ? 'Bs' : 'USD'}</td><td className="text-right font-mono">{money(total)}</td></tr>
              <tr><td>DESCUENTO {inBs ? 'Bs' : 'USD'}</td><td className="text-right font-mono">{money(0)}</td></tr>
              <tr><td>TOTAL {inBs ? 'Bs' : 'USD'}</td><td className="text-right font-mono">{money(total)}</td></tr>
              <tr><td>MONTO GIFT CARD {inBs ? 'Bs' : 'USD'}</td><td className="text-right font-mono">{money(0)}</td></tr>
              <tr className="font-bold border-t border-neutral-400"><td>MONTO A PAGAR {inBs ? 'Bs' : 'USD'}</td><td className="text-right font-mono">{money(total)}</td></tr>
              {fiscal && <tr className="font-bold"><td>IMPORTE BASE CRÉDITO FISCAL</td><td className="text-right font-mono">{bs(t.base)}</td></tr>}
            </tbody>
          </table>
        </div>

        <footer className="grid grid-cols-[1fr_auto] gap-6 items-end mt-8 pt-4 border-t border-neutral-300">
          <div className="space-y-2 text-[10.5px] text-center">
            {fiscal ? (
              <>
                <p className="font-bold">{LEYENDA_ILICITO}</p>
                <p>{inv.leyenda ?? s.leyenda}</p>
                <p className="italic">
                  {inv.fiscalEmissionType === 1
                    ? '“Este documento es la Representación Gráfica de un Documento Fiscal Digital emitido en una modalidad de facturación en línea”'
                    : '“Este documento es la Representación Gráfica de un Documento Fiscal Digital emitido fuera de línea, verifique su envío con su proveedor o en la página web www.impuestos.gob.bo”'}
                </p>
                {inv.fiscalStatus === 'ANNULLED' && <p className="font-bold text-red-700">FACTURA ANULADA</p>}
              </>
            ) : (
              <p>Nota de cobro interna. La factura fiscal se emite al registrar la emisión ante el SIN.</p>
            )}
          </div>
          {qrSvg && <div className="qr w-[110px] h-[110px]" aria-label="Código QR de verificación SIN" dangerouslySetInnerHTML={{ __html: qrSvg }} />}
        </footer>
      </div>
    </div>
  )
}
