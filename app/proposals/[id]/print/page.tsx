import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import type { AuthUser } from '@/lib/auth'
import { DomainError } from '@/lib/result'
import { FeeProposalService } from '@/services/FeeProposalService'
import { CONTRACT_TYPE, PHASE, USER_ROLE } from '@/lib/labels'
import { schedulePhases } from '@/lib/fees'
import { formatCurrency } from '@/lib/utils'
import { PrintButton } from './PrintButton'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Propuesta de honorarios · CHAO' }

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * Client-facing fee proposal, styled for A4 print. "Imprimir / Guardar
 * PDF" uses the browser's print dialog, which works on Vercel without a
 * headless browser. Internal cost and margin are never rendered here.
 */
export default async function ProposalPrintPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  let p: Awaited<ReturnType<typeof FeeProposalService.get>>
  try {
    p = await FeeProposalService.get({ currentUser: session.user as AuthUser, id: params.id })
  } catch (e) {
    if (e instanceof DomainError && e.code === 'NOT_FOUND') notFound()
    throw e
  }

  const lead = p.lead as { projectName: string; company: string; contactName: string; contactEmail: string } | undefined
  const issued = p.sentAt ?? p.updatedAt
  const included = p.phases.map((ph, i) => ({ ph, t: p.totals.phases[i] })).filter((x) => x.ph.included)
  const schedule = schedulePhases(p.phases, new Date(0))
  let weekCursor = 0
  const weeks = p.phases.map((ph, i) => {
    if (!schedule[i].startDate) return null
    const from = weekCursor + 1
    weekCursor += ph.durationWeeks
    return { from, to: weekCursor }
  })
  const roleHours = new Map<string, number>()
  for (const { ph } of included) for (const l of ph.lines) roleHours.set(l.role, (roleHours.get(l.role) ?? 0) + l.hours)

  return (
    <div className="proposal-doc flow-root min-h-screen bg-neutral-200 print:bg-white text-neutral-900 font-ui">
      <style>{`
        @page { size: A4; margin: 16mm 14mm; }
        @media print { .no-print { display: none !important } .sheet { box-shadow: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important } body { background: #fff !important } }
        .proposal-doc table { border-collapse: collapse; width: 100% }
        .proposal-doc h2 { break-after: avoid }
        .proposal-doc section { break-inside: avoid }
      `}</style>

      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white/90 backdrop-blur border-b border-neutral-300">
        <p className="text-sm text-neutral-600">
          {p.number} · v{p.version} {p.status === 'DRAFT' && <span className="ml-2 px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">Borrador</span>}
        </p>
        <PrintButton />
      </div>

      <main className="sheet bg-white max-w-[210mm] mx-auto my-6 px-[14mm] py-[16mm] shadow-lg">
        {p.status === 'DRAFT' && (
          <p className="mb-6 text-xs uppercase tracking-[0.2em] text-amber-700 border border-amber-300 rounded px-3 py-1.5 inline-block">Borrador — no válido como oferta</p>
        )}
        <header className="flex items-start justify-between gap-6 pb-6 border-b-2 border-neutral-900">
          <div>
            <p className="font-display text-3xl tracking-tight">CHAO Arquitectura</p>
            <p className="text-xs text-neutral-500 mt-1">S.R.L. · Santa Cruz de la Sierra, Bolivia · www.chaoarquitectura.bo</p>
          </div>
          <div className="text-right text-xs text-neutral-600 leading-relaxed">
            <p className="text-sm font-semibold text-neutral-900">Propuesta de honorarios</p>
            <p>{p.number} · versión {p.version}</p>
            <p>Fecha: {fmtDate(issued)}</p>
            <p>Válida hasta: {fmtDate(p.validUntil)}</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 py-6 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-1">Cliente</p>
            <p className="font-semibold">{lead?.company}</p>
            <p>{lead?.contactName}</p>
            <p className="text-neutral-600">{lead?.contactEmail}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-1">Proyecto</p>
            <p className="font-semibold">{lead?.projectName}</p>
            {p.areaM2 ? <p>Superficie estimada: {p.areaM2.toLocaleString('es-BO')} m²</p> : null}
            <p>Modalidad: {CONTRACT_TYPE[p.contractType] ?? p.contractType}</p>
          </div>
        </section>

        {p.scope && (
          <section className="pb-6">
            <h2 className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">1. Alcance de los servicios</h2>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{p.scope}</p>
          </section>
        )}

        <section className="pb-6">
          <h2 className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">2. Honorarios por fase</h2>
          <table className="text-sm">
            <thead>
              <tr className="border-b border-neutral-900 text-left text-[11px] uppercase tracking-wider text-neutral-500">
                <th className="py-2 font-normal">Fase</th>
                <th className="py-2 font-normal text-right">Plazo</th>
                <th className="py-2 font-normal text-right">%</th>
                <th className="py-2 font-normal text-right">Honorario (USD)</th>
              </tr>
            </thead>
            <tbody>
              {included.map(({ ph, t }) => (
                <tr key={ph.phase} className="border-b border-neutral-200">
                  <td className="py-2.5">
                    <span className="text-neutral-400 font-mono text-xs mr-2">{PHASE[ph.phase]?.short}</span>
                    {ph.label}
                  </td>
                  <td className="py-2.5 text-right tabular">{ph.durationWeeks} sem</td>
                  <td className="py-2.5 text-right tabular">{t.sharePercent}%</td>
                  <td className="py-2.5 text-right tabular">{formatCurrency(t.grossUSD)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              {p.totals.discountUSD > 0 && (
                <>
                  <tr>
                    <td colSpan={3} className="pt-3 text-right text-neutral-600">Subtotal</td>
                    <td className="pt-3 text-right tabular">{formatCurrency(p.totals.subtotalUSD)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="py-1 text-right text-neutral-600">Descuento ({p.discountPercent}%)</td>
                    <td className="py-1 text-right tabular">−{formatCurrency(p.totals.discountUSD)}</td>
                  </tr>
                </>
              )}
              <tr className="border-t-2 border-neutral-900">
                <td colSpan={3} className="pt-3 text-right font-semibold">Honorario total</td>
                <td className="pt-3 text-right text-lg font-semibold tabular">{formatCurrency(p.totals.feeUSD)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="text-xs text-neutral-500 mt-3">
            Esfuerzo estimado: {p.totals.hours.toLocaleString('es-BO')} horas profesionales
            {roleHours.size > 0 && (
              <> ({Array.from(roleHours.entries()).filter(([, h]) => h > 0).map(([r, h]) => `${USER_ROLE[r] ?? r} ${h.toLocaleString('es-BO')} h`).join(' · ')})</>
            )}
            . Montos en dólares estadounidenses; no incluyen impuestos de ley.
          </p>
        </section>

        <section className="pb-6">
          <h2 className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">3. Cronograma</h2>
          <div className="space-y-1.5">
            {p.phases.map((ph, i) => {
              const w = weeks[i]
              if (!w || !p.totals.durationWeeks) return null
              const left = ((w.from - 1) / p.totals.durationWeeks) * 100
              const width = (ph.durationWeeks / p.totals.durationWeeks) * 100
              return (
                <div key={ph.phase} className="flex items-center gap-3 text-xs">
                  <span className="w-44 truncate">{ph.label}</span>
                  <div className="relative flex-1 h-3 bg-neutral-100 rounded-sm">
                    <div className="absolute top-0 h-3 bg-neutral-800 rounded-sm" style={{ left: `${left}%`, width: `${width}%` }} />
                  </div>
                  <span className="w-24 text-right tabular text-neutral-600">sem {w.from}–{w.to}</span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-neutral-500 mt-2">Duración total estimada: {p.totals.durationWeeks} semanas desde la firma del contrato.</p>
        </section>

        {p.paymentTerms && (
          <section className="pb-6">
            <h2 className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">4. Forma de pago</h2>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{p.paymentTerms}</p>
          </section>
        )}
        {p.exclusions && (
          <section className="pb-6">
            <h2 className="text-[10px] uppercase tracking-[0.15em] text-neutral-500 mb-2">5. Exclusiones</h2>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{p.exclusions}</p>
          </section>
        )}

        <section className="grid grid-cols-2 gap-12 pt-12 text-xs text-neutral-600">
          <div className="border-t border-neutral-400 pt-2">
            <p className="font-semibold text-neutral-900">CHAO Arquitectura S.R.L.</p>
            <p>{(p.createdBy as { name?: string } | undefined)?.name}</p>
          </div>
          <div className="border-t border-neutral-400 pt-2">
            <p className="font-semibold text-neutral-900">Aceptado por {lead?.company}</p>
            <p>Nombre, firma y fecha</p>
          </div>
        </section>
      </main>
    </div>
  )
}
