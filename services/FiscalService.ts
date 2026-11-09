/**
 * FiscalService — Bolivian fiscal invoicing (SIN) and accounting export
 * (roadmap item 5).
 *
 * Issuing turns an internal invoice into a fiscal one: it takes the next
 * fiscal number from an atomic counter, converts every line to bolivianos,
 * snapshots the buyer's NIT/CI and name, and computes the CUF — all in one
 * transaction, so a failed issue never burns a number. Without a SIAT
 * connection the invoice is "ISSUED" (emitida fuera de línea, pending SIN
 * validation) and its print shows that it is not yet valid.
 *
 * Exports: the monthly sales book (Registro de Ventas, SIN RCV layout) and
 * an accounting journal (accrual on issue, IT provision, collections,
 * annulment reversals), both as CSV in bolivianos.
 */
import { z } from 'zod'
import type { Invoice, InvoiceLineItem, Prisma, StudioFiscalSettings } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'
import { ForbiddenError, InvalidStateError, NotFoundError, ValidationError } from '@/lib/result'
import { ANNUL_REASONS, DEFAULT_LEYENDA, DOC_TYPES, generateCuf, isSiatConfigured, round2, taxSplit } from '@/lib/siat'
import { InvoiceService } from './InvoiceService'

export const FISCAL_ROLES = new Set(['PRINCIPAL', 'ADMIN'])
const SETTINGS_ID = 'default'

export const DEFAULT_ACCOUNTS = {
  clientes: { code: '1.1.3.01', name: 'Cuentas por cobrar clientes' },
  bancos: { code: '1.1.1.02', name: 'Bancos' },
  ingresos: { code: '4.1.1.01', name: 'Ingresos por servicios de arquitectura' },
  ivaDebito: { code: '2.1.4.01', name: 'Débito fiscal IVA' },
  itPorPagar: { code: '2.1.4.02', name: 'IT por pagar' },
  gastoIt: { code: '6.1.5.01', name: 'Impuesto a las transacciones' },
}
export type Accounts = typeof DEFAULT_ACCOUNTS

const account = z.object({ code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(120) })

export const fiscalSettingsSchema = z.object({
  nit: z.string().trim().regex(/^\d{5,13}$/, 'NIT: solo dígitos (5 a 13)').or(z.literal('')),
  razonSocial: z.string().trim().min(2).max(200),
  municipio: z.string().trim().max(100),
  direccion: z.string().trim().max(300),
  telefono: z.string().trim().max(40),
  actividadEconomica: z.string().trim().regex(/^\d{0,10}$/, 'Código CAEB: solo dígitos'),
  codigoProductoSin: z.string().trim().regex(/^\d{0,10}$/, 'Código de producto SIN: solo dígitos'),
  sucursal: z.number().int().min(0).max(9999),
  puntoVenta: z.number().int().min(0).max(9999),
  modalidad: z.union([z.literal(1), z.literal(2)]),
  ambiente: z.union([z.literal(1), z.literal(2)]),
  leyenda: z.string().trim().max(500),
  exchangeRate: z.number().positive().max(1000),
  accounts: z.object({ clientes: account, bancos: account, ingresos: account, ivaDebito: account, itPorPagar: account, gastoIt: account }).optional(),
})
export type FiscalSettingsInput = z.infer<typeof fiscalSettingsSchema>

export const clientFiscalSchema = z
  .object({
    billingName: z.string().trim().min(2, 'Razón social requerida').max(200),
    docType: z.enum(['CI', 'CEX', 'PAS', 'OD', 'NIT']),
    docNumber: z.string().trim().min(3, 'Número de documento requerido').max(20),
    docComplement: z.string().trim().max(5).default(''),
  })
  .superRefine((v, ctx) => {
    if ((v.docType === 'NIT' || v.docType === 'CI') && !/^\d+$/.test(v.docNumber)) {
      ctx.addIssue({ code: 'custom', path: ['docNumber'], message: `${v.docType}: solo dígitos` })
    }
    if (v.docType === 'NIT' && v.docComplement) ctx.addIssue({ code: 'custom', path: ['docComplement'], message: 'El NIT no lleva complemento' })
  })

export const annulSchema = z.object({
  reasonCode: z.number().int().refine((c) => c in ANNUL_REASONS, 'Motivo de anulación inválido'),
  note: z.string().trim().max(500).default(''),
})

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido (AAAA-MM)')

function assertFiscal(user: AuthUser) {
  if (!FISCAL_ROLES.has(user.role)) throw new ForbiddenError('Solo dirección y administración gestionan la facturación fiscal')
}

/** Fields that must be filled before any fiscal invoice can be issued. */
export function missingSettings(s: Pick<StudioFiscalSettings, 'nit' | 'razonSocial' | 'actividadEconomica' | 'codigoProductoSin' | 'municipio'>) {
  const missing: string[] = []
  if (!s.nit) missing.push('NIT del estudio')
  if (!s.razonSocial) missing.push('razón social')
  if (!s.municipio) missing.push('municipio')
  if (!s.actividadEconomica) missing.push('actividad económica (CAEB)')
  if (!s.codigoProductoSin) missing.push('código de producto SIN')
  return missing
}

/** Bolivia (UTC−4) month bounds as UTC instants. */
export function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number)
  const from = new Date(Date.UTC(y, m - 1, 1, 4))
  const to = new Date(Date.UTC(y, m, 1, 4))
  return { from, to }
}

const fmtDate = (d: Date) => {
  const t = new Date(d.getTime() - 4 * 3_600_000)
  return `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}/${t.getUTCFullYear()}`
}
const n2 = (n: number) => round2(n).toFixed(2)

/** RFC 4180 CSV with a BOM so Excel opens accents correctly. */
export function toCsv(rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

type LineIn = Pick<InvoiceLineItem, 'id' | 'quantity' | 'unitPriceUSD'>
/** Convert lines to Bs, rounding each line; the total is the sum of rounded lines. */
export function linesToBOB(lines: LineIn[], rate: number) {
  const out = lines.map((l) => {
    const unitPriceBOB = round2(l.unitPriceUSD * rate)
    return { id: l.id, unitPriceBOB, totalBOB: round2(unitPriceBOB * l.quantity) }
  })
  return { lines: out, totalBOB: round2(out.reduce((a, l) => a + l.totalBOB, 0)) }
}

export const FiscalService = {
  async getSettings() {
    return prisma.studioFiscalSettings.upsert({ where: { id: SETTINGS_ID }, create: { id: SETTINGS_ID }, update: {} })
  },

  async settingsView(args: { currentUser: AuthUser }) {
    const s = await this.getSettings()
    return {
      settings: { ...s, accounts: (s.accounts as Accounts | null) ?? DEFAULT_ACCOUNTS, leyenda: s.leyenda || DEFAULT_LEYENDA },
      missing: missingSettings(s),
      siatConnected: isSiatConfigured(),
      canEdit: FISCAL_ROLES.has(args.currentUser.role),
    }
  },

  async updateSettings(args: { currentUser: AuthUser; data: FiscalSettingsInput }) {
    assertFiscal(args.currentUser)
    await this.getSettings()
    const { accounts, ...rest } = args.data
    const s = await prisma.studioFiscalSettings.update({
      where: { id: SETTINGS_ID },
      data: { ...rest, ...(accounts ? { accounts: accounts as Prisma.InputJsonValue } : {}) },
    })
    await prisma.auditLog.create({
      data: { userId: args.currentUser.id, action: 'UPDATE', entityType: 'StudioFiscalSettings', entityId: s.id, payload: rest as Prisma.InputJsonValue },
    })
    return this.settingsView({ currentUser: args.currentUser })
  },

  async updateClientFiscal(args: { currentUser: AuthUser; clientId: string; data: z.infer<typeof clientFiscalSchema> }) {
    const client = await prisma.client.findUnique({ where: { id: args.clientId }, select: { id: true } })
    if (!client) throw new NotFoundError('Cliente', args.clientId)
    return prisma.client.update({ where: { id: client.id }, data: args.data })
  },

  /** Issue a fiscal invoice (assigns number + CUF, converts to Bs, snapshots the buyer). */
  async issue(args: { currentUser: AuthUser; invoiceId: string }) {
    const { currentUser: user } = args
    assertFiscal(user)
    const settings = await this.getSettings()
    const missing = missingSettings(settings)
    if (missing.length) throw new ValidationError(`Completa los datos fiscales del estudio en Configuración: ${missing.join(', ')}`)

    const inv = await prisma.invoice.findUnique({
      where: { id: args.invoiceId },
      include: { lineItems: true, client: true },
    })
    if (!inv) throw new NotFoundError('Factura', args.invoiceId)
    if (inv.fiscalStatus !== 'NOT_ISSUED') throw new InvalidStateError('Esta factura ya fue emitida al SIN')
    if (inv.status === 'PAID') throw new InvalidStateError('La factura ya está pagada; emite la factura fiscal antes de registrar el cobro')
    if (!inv.lineItems.length) throw new InvalidStateError('La factura no tiene detalle')
    const c = inv.client
    if (!c.docNumber || !(c.billingName || c.company)) {
      throw new ValidationError(`Faltan los datos de facturación de ${c.company}: NIT/CI y razón social (Clientes → ${c.company})`)
    }

    const rate = inv.currency === 'BOB' ? inv.exchangeRate : settings.exchangeRate
    const bob = linesToBOB(inv.lineItems, rate)
    const now = new Date()
    // Transmission to the SIN is not implemented yet, so every invoice is
    // issued fuera de línea (tipo de emisión 2) even if credentials exist.
    const siat = false

    const issued = await prisma.$transaction(async (tx) => {
      const counter = await tx.studioFiscalSettings.update({
        where: { id: SETTINGS_ID },
        data: { nextFiscalNumber: { increment: 1 } },
        select: { nextFiscalNumber: true },
      })
      const number = counter.nextFiscalNumber - 1
      const cuf = generateCuf({
        nit: settings.nit,
        issuedAt: now,
        sucursal: settings.sucursal,
        modalidad: settings.modalidad,
        tipoEmision: siat ? 1 : 2,
        tipoFactura: 1,
        tipoDocumentoSector: 1,
        numeroFactura: number,
        puntoVenta: settings.puntoVenta,
        codigoControl: '',
      })
      const claimed = await tx.invoice.updateMany({
        where: { id: inv.id, fiscalStatus: 'NOT_ISSUED' },
        data: {
          fiscalStatus: 'ISSUED',
          fiscalNumber: number,
          cuf,
          fiscalIssuedAt: now,
          fiscalEmissionType: siat ? 1 : 2,
          exchangeRate: rate,
          amountBOB: bob.totalBOB,
          buyerName: c.billingName || c.company,
          buyerDocType: c.docType,
          buyerDocNumber: c.docNumber,
          buyerDocComplement: c.docComplement,
          leyenda: settings.leyenda || DEFAULT_LEYENDA,
        },
      })
      // Rolls back the counter too: no number is burnt by a lost race.
      if (claimed.count === 0) throw new InvalidStateError('Otra persona emitió esta factura al mismo tiempo')
      for (const l of bob.lines) {
        await tx.invoiceLineItem.update({ where: { id: l.id }, data: { unitPriceBOB: l.unitPriceBOB, totalBOB: l.totalBOB } })
      }
      return { number, cuf }
    })

    await prisma.auditLog.create({
      data: { userId: user.id, action: 'FISCAL_ISSUE', entityType: 'Invoice', entityId: inv.id, payload: { ...issued, amountBOB: bob.totalBOB, rate } },
    })
    // Issuing is sending: a draft goes out to the client (email) as SENT.
    if (inv.status === 'DRAFT') await InvoiceService.updateStatus({ currentUser: user, id: inv.id, status: 'SENT' })
    return this.fiscalView(inv.id)
  },

  async annul(args: { currentUser: AuthUser; invoiceId: string; reasonCode: number; note: string }) {
    assertFiscal(args.currentUser)
    const inv = await prisma.invoice.findUnique({ where: { id: args.invoiceId }, include: { payments: { select: { id: true } } } })
    if (!inv) throw new NotFoundError('Factura', args.invoiceId)
    if (inv.fiscalStatus !== 'ISSUED' && inv.fiscalStatus !== 'VALIDATED') throw new InvalidStateError('Solo se anulan facturas fiscales emitidas')
    if (inv.payments.length) throw new InvalidStateError('La factura tiene cobros registrados; revierte los pagos antes de anularla')
    const r = await prisma.invoice.updateMany({
      where: { id: inv.id, fiscalStatus: inv.fiscalStatus },
      data: { fiscalStatus: 'ANNULLED', annulledAt: new Date(), annulReasonCode: args.reasonCode, annulNote: args.note },
    })
    if (r.count === 0) throw new InvalidStateError('La factura cambió de estado; recarga')
    await prisma.auditLog.create({
      data: { userId: args.currentUser.id, action: 'FISCAL_ANNUL', entityType: 'Invoice', entityId: inv.id, payload: { fiscalNumber: inv.fiscalNumber, reasonCode: args.reasonCode, note: args.note } },
    })
    return this.fiscalView(inv.id)
  },

  /** Everything the fiscal print page needs. Staff only. */
  async fiscalView(invoiceId: string) {
    const inv = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lineItems: { orderBy: { id: 'asc' } },
        client: { select: { id: true, name: true, company: true, email: true, billingName: true, docType: true, docNumber: true, docComplement: true } },
        project: { select: { id: true, code: true, name: true } },
        payments: { select: { amountUSD: true } },
      },
    })
    if (!inv) throw new NotFoundError('Factura', invoiceId)
    const settings = await this.getSettings()
    return { invoice: inv, settings: { ...settings, leyenda: settings.leyenda || DEFAULT_LEYENDA }, siatConnected: isSiatConfigured() }
  },

  async listFiscal(month: string) {
    const { from, to } = monthRange(month)
    return prisma.invoice.findMany({
      where: { fiscalNumber: { not: null }, fiscalIssuedAt: { gte: from, lt: to } },
      orderBy: { fiscalNumber: 'asc' },
      include: { client: { select: { company: true } }, project: { select: { code: true } } },
    })
  },

  async monthSummary(args: { currentUser: AuthUser; month: string }) {
    assertFiscal(args.currentUser)
    const rows = await this.listFiscal(args.month)
    const valid = rows.filter((r) => r.fiscalStatus !== 'ANNULLED')
    const total = round2(valid.reduce((a, r) => a + (r.amountBOB ?? 0), 0))
    const t = taxSplit(total)
    const pendingDrafts = await prisma.invoice.count({ where: { fiscalStatus: 'NOT_ISSUED', status: { not: 'DRAFT' } } })
    return {
      month: args.month,
      count: valid.length,
      annulled: rows.length - valid.length,
      pendingValidation: rows.filter((r) => r.fiscalStatus === 'ISSUED').length,
      totalBOB: total,
      ivaBOB: t.iva,
      itBOB: t.it,
      netBOB: t.net,
      notIssuedSent: pendingDrafts,
      invoices: rows.map((r) => ({
        id: r.id,
        number: r.number,
        fiscalNumber: r.fiscalNumber,
        fiscalIssuedAt: r.fiscalIssuedAt,
        fiscalStatus: r.fiscalStatus,
        buyerName: r.buyerName,
        buyerDocNumber: r.buyerDocNumber,
        amountBOB: r.amountBOB,
        client: r.client.company,
        project: r.project.code,
      })),
    }
  },

  /** Registro de Ventas (SIN RCV layout), one row per fiscal invoice issued in the month. */
  async salesBook(args: { currentUser: AuthUser; month: string }) {
    assertFiscal(args.currentUser)
    const rows = await this.listFiscal(args.month)
    const header = [
      'Nº', 'ESPECIFICACION', 'FECHA DE LA FACTURA', 'Nº DE LA FACTURA', 'CODIGO DE AUTORIZACION', 'NIT / CI CLIENTE', 'COMPLEMENTO',
      'NOMBRE O RAZON SOCIAL', 'IMPORTE TOTAL DE LA VENTA', 'IMPORTE ICE', 'IMPORTE IEHD', 'IMPORTE IPJ', 'TASAS', 'OTROS NO SUJETOS AL IVA',
      'EXPORTACIONES Y OPERACIONES EXENTAS', 'VENTAS GRAVADAS A TASA CERO', 'SUBTOTAL', 'DESCUENTOS, BONIFICACIONES Y REBAJAS SUJETAS AL IVA',
      'IMPORTE GIFT CARD', 'IMPORTE BASE PARA DEBITO FISCAL', 'DEBITO FISCAL', 'ESTADO', 'CODIGO DE CONTROL', 'TIPO DE VENTA',
    ]
    const body = rows.map((r, i) => {
      const annulled = r.fiscalStatus === 'ANNULLED'
      const total = annulled ? 0 : r.amountBOB ?? 0
      const t = taxSplit(total)
      return [
        i + 1, 2, fmtDate(r.fiscalIssuedAt!), r.fiscalNumber!, r.cuf ?? '', r.buyerDocNumber ?? '', r.buyerDocComplement ?? '',
        r.buyerName ?? '', n2(total), '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', n2(total), '0.00', '0.00',
        n2(t.base), n2(t.iva), annulled ? 'A' : 'V', '0', 0,
      ]
    })
    return { filename: `registro-ventas-${args.month}.csv`, csv: toCsv([header, ...body]) }
  },

  /**
   * Accounting journal for the month, in Bs:
   *  - issue:   Dr clientes / Cr ingresos (87%) + Cr débito fiscal IVA (13%); Dr gasto IT / Cr IT por pagar (3%)
   *  - payment: Dr bancos / Cr clientes, at the invoice's exchange rate
   *  - annul:   reversal of the issue entry, dated on annulment
   */
  async journal(args: { currentUser: AuthUser; month: string }) {
    assertFiscal(args.currentUser)
    const { from, to } = monthRange(args.month)
    const s = await this.getSettings()
    const acc = (s.accounts as Accounts | null) ?? DEFAULT_ACCOUNTS
    const [issued, annulled, payments] = await Promise.all([
      prisma.invoice.findMany({ where: { fiscalIssuedAt: { gte: from, lt: to }, fiscalNumber: { not: null } }, orderBy: { fiscalNumber: 'asc' } }),
      prisma.invoice.findMany({ where: { annulledAt: { gte: from, lt: to } }, orderBy: { annulledAt: 'asc' } }),
      prisma.payment.findMany({
        where: { paidAt: { gte: from, lt: to }, invoice: { fiscalStatus: { in: ['ISSUED', 'VALIDATED'] } } },
        orderBy: { paidAt: 'asc' },
        include: { invoice: { select: { number: true, fiscalNumber: true, exchangeRate: true, currency: true, buyerName: true } } },
      }),
    ])

    type Entry = { date: Date; ref: string; lines: [keyof Accounts, number, number][]; memo: string }
    const entries: Entry[] = []
    const issueLines = (inv: Invoice, sign: 1 | -1): Entry['lines'] => {
      const t = taxSplit(inv.amountBOB ?? 0)
      const dr = (v: number) => (sign === 1 ? v : 0)
      const cr = (v: number) => (sign === 1 ? 0 : v)
      return [
        ['clientes', dr(t.base), cr(t.base)],
        ['ingresos', cr(t.net), dr(t.net)],
        ['ivaDebito', cr(t.iva), dr(t.iva)],
        ['gastoIt', dr(t.it), cr(t.it)],
        ['itPorPagar', cr(t.it), dr(t.it)],
      ]
    }
    for (const inv of issued) {
      entries.push({ date: inv.fiscalIssuedAt!, ref: `F-${inv.fiscalNumber}`, lines: issueLines(inv, 1), memo: `Factura ${inv.fiscalNumber} (${inv.number}) — ${inv.buyerName ?? ''}` })
    }
    for (const p of payments) {
      const bob = round2(p.amountUSD * (p.invoice.exchangeRate || s.exchangeRate))
      entries.push({ date: p.paidAt, ref: `C-${p.invoice.fiscalNumber}`, lines: [['bancos', bob, 0], ['clientes', 0, bob]], memo: `Cobro factura ${p.invoice.fiscalNumber} (${p.invoice.number})${p.reference ? ` ref. ${p.reference}` : ''}` })
    }
    for (const inv of annulled) {
      entries.push({ date: inv.annulledAt!, ref: `A-${inv.fiscalNumber}`, lines: issueLines(inv, -1), memo: `Anulación factura ${inv.fiscalNumber} — ${ANNUL_REASONS[inv.annulReasonCode ?? 0] ?? ''}` })
    }
    entries.sort((a, b) => a.date.getTime() - b.date.getTime())

    const header = ['FECHA', 'COMPROBANTE', 'CUENTA', 'NOMBRE DE CUENTA', 'DEBE (Bs)', 'HABER (Bs)', 'GLOSA']
    const rows: (string | number)[][] = []
    let debit = 0
    let credit = 0
    for (const e of entries) {
      for (const [k, d, c] of e.lines) {
        if (!d && !c) continue
        debit += d
        credit += c
        rows.push([fmtDate(e.date), e.ref, acc[k].code, acc[k].name, n2(d), n2(c), e.memo])
      }
    }
    rows.push(['', '', '', 'TOTALES', n2(debit), n2(credit), ''])
    return { filename: `libro-diario-${args.month}.csv`, csv: toCsv([header, ...rows]), balanced: round2(debit) === round2(credit) }
  },
}

export const DOC_TYPE_OPTIONS = Object.entries(DOC_TYPES).map(([value, d]) => ({ value, label: d.label }))
