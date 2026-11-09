/**
 * FiscalService unit tests — mocks @/lib/prisma.
 * Covers settings completeness, issuing (atomic number, Bs conversion,
 * buyer snapshot, CUF, offline emission, draft → SENT), the issue race,
 * annulment rules, the RCV sales book and the balanced journal.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: Record<string, any> = {
    studioFiscalSettings: { upsert: vi.fn(), update: vi.fn() },
    invoice: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    invoiceLineItem: { update: vi.fn() },
    payment: { findMany: vi.fn() },
    client: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma))
  return { prisma }
})
vi.mock('@/services/InvoiceService', () => ({ InvoiceService: { updateStatus: vi.fn() } }))

import { prisma } from '@/lib/prisma'
import { FiscalService, linesToBOB, missingSettings, monthRange, toCsv, clientFiscalSchema } from '@/services/FiscalService'
import { InvoiceService } from '@/services/InvoiceService'
import { ForbiddenError, InvalidStateError, ValidationError } from '@/lib/result'

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const user = (role: string) => ({ id: `u_${role}`, role, name: role, email: 'x@x.bo', avatarInitials: 'XX' }) as any
const ADMIN = user('ADMIN')
const ARCH = user('ARCHITECT')

const SETTINGS = {
  id: 'default',
  nit: '1020304050',
  razonSocial: 'CHAO Arquitectura S.R.L.',
  municipio: 'Santa Cruz de la Sierra',
  direccion: '',
  telefono: '',
  actividadEconomica: '711000',
  codigoProductoSin: '83111',
  sucursal: 0,
  puntoVenta: 0,
  modalidad: 2,
  ambiente: 2,
  leyenda: '',
  exchangeRate: 6.96,
  nextFiscalNumber: 1,
  accounts: null,
}
const CLIENT = { id: 'c1', company: 'Inmobiliaria Oriente', billingName: 'INMOBILIARIA ORIENTE S.R.L.', docType: 'NIT', docNumber: '1023456027', docComplement: '' }
const INVOICE = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  number: 'INV-0150',
  status: 'DRAFT',
  currency: 'USD',
  exchangeRate: 1,
  amountUSD: 18500.5,
  fiscalStatus: 'NOT_ISSUED',
  lineItems: [
    { id: 'l1', quantity: 1, unitPriceUSD: 18500 },
    { id: 'l2', quantity: 2, unitPriceUSD: 0.25 },
  ],
  client: CLIENT,
  payments: [],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  db.studioFiscalSettings.upsert.mockResolvedValue(SETTINGS)
  db.studioFiscalSettings.update.mockResolvedValue({ nextFiscalNumber: 153 })
  db.invoice.findUnique.mockResolvedValue(INVOICE())
  db.invoice.updateMany.mockResolvedValue({ count: 1 })
})

describe('helpers', () => {
  it('missingSettings names what blocks issuing', () => {
    expect(missingSettings(SETTINGS)).toEqual([])
    expect(missingSettings({ ...SETTINGS, nit: '', codigoProductoSin: '' })).toEqual(['NIT del estudio', 'código de producto SIN'])
  })

  it('linesToBOB rounds per line and sums the rounded lines', () => {
    const r = linesToBOB([{ id: 'a', quantity: 3, unitPriceUSD: 10.333 }, { id: 'b', quantity: 1, unitPriceUSD: 0.005 }], 6.96)
    expect(r.lines).toEqual([{ id: 'a', unitPriceBOB: 71.92, totalBOB: 215.76 }, { id: 'b', unitPriceBOB: 0.03, totalBOB: 0.03 }])
    expect(r.totalBOB).toBe(215.79)
  })

  it('monthRange uses Bolivian midnight (04:00 UTC)', () => {
    const r = monthRange('2026-12')
    expect(r.from.toISOString()).toBe('2026-12-01T04:00:00.000Z')
    expect(r.to.toISOString()).toBe('2027-01-01T04:00:00.000Z')
  })

  it('toCsv quotes commas/quotes and starts with a BOM', () => {
    expect(toCsv([['a', 'b,c', 'd"e', 1]])).toBe('﻿a,"b,c","d""e",1\r\n')
  })

  it('client fiscal schema: NIT digits only, no complement on NIT', () => {
    expect(() => clientFiscalSchema.parse({ billingName: 'X S.A.', docType: 'NIT', docNumber: '12AB' })).toThrow()
    expect(() => clientFiscalSchema.parse({ billingName: 'X S.A.', docType: 'NIT', docNumber: '123456', docComplement: '1A' })).toThrow()
    expect(clientFiscalSchema.parse({ billingName: 'Ana Roca', docType: 'CI', docNumber: '4567890', docComplement: '1A' }).docComplement).toBe('1A')
    expect(clientFiscalSchema.parse({ billingName: 'John Doe', docType: 'PAS', docNumber: 'X1234567' }).docType).toBe('PAS')
  })
})

describe('issue', () => {
  it('assigns the next number, converts to Bs at the studio rate, snapshots the buyer and issues offline', async () => {
    await FiscalService.issue({ currentUser: ADMIN, invoiceId: 'i1' })
    expect(db.studioFiscalSettings.update).toHaveBeenCalledWith(expect.objectContaining({ data: { nextFiscalNumber: { increment: 1 } } }))
    const call = db.invoice.updateMany.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'i1', fiscalStatus: 'NOT_ISSUED' })
    expect(call.data).toEqual(
      expect.objectContaining({
        fiscalStatus: 'ISSUED',
        fiscalNumber: 152,
        fiscalEmissionType: 2,
        exchangeRate: 6.96,
        amountBOB: 128763.48, // 18500 × 6.96 = 128760 + 2 × 1.74
        buyerName: 'INMOBILIARIA ORIENTE S.R.L.',
        buyerDocType: 'NIT',
        buyerDocNumber: '1023456027',
      })
    )
    expect(call.data.cuf).toMatch(/^[0-9A-F]{40,}$/)
    expect(db.invoiceLineItem.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: { unitPriceBOB: 128760, totalBOB: 128760 } })
    expect(db.invoiceLineItem.update).toHaveBeenCalledWith({ where: { id: 'l2' }, data: { unitPriceBOB: 1.74, totalBOB: 3.48 } })
    // a draft goes out as SENT
    expect(InvoiceService.updateStatus).toHaveBeenCalledWith({ currentUser: ADMIN, id: 'i1', status: 'SENT' })
  })

  it('a BOB invoice keeps its own exchange rate', async () => {
    db.invoice.findUnique.mockResolvedValue(INVOICE({ currency: 'BOB', exchangeRate: 7, status: 'SENT' }))
    await FiscalService.issue({ currentUser: ADMIN, invoiceId: 'i1' })
    expect(db.invoice.updateMany.mock.calls[0][0].data.exchangeRate).toBe(7)
    expect(InvoiceService.updateStatus).not.toHaveBeenCalled()
  })

  it('throws (rolling back the counter) when someone issued it first', async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 0 })
    await expect(FiscalService.issue({ currentUser: ADMIN, invoiceId: 'i1' })).rejects.toBeInstanceOf(InvalidStateError)
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(db.invoiceLineItem.update).not.toHaveBeenCalled()
  })

  it('requires complete studio settings and client NIT/CI', async () => {
    db.studioFiscalSettings.upsert.mockResolvedValue({ ...SETTINGS, nit: '' })
    await expect(FiscalService.issue({ currentUser: ADMIN, invoiceId: 'i1' })).rejects.toThrow(/NIT del estudio/)
    db.studioFiscalSettings.upsert.mockResolvedValue(SETTINGS)
    db.invoice.findUnique.mockResolvedValue(INVOICE({ client: { ...CLIENT, docNumber: '' } }))
    await expect(FiscalService.issue({ currentUser: ADMIN, invoiceId: 'i1' })).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses architects, already-issued and paid invoices', async () => {
    await expect(FiscalService.issue({ currentUser: ARCH, invoiceId: 'i1' })).rejects.toBeInstanceOf(ForbiddenError)
    db.invoice.findUnique.mockResolvedValue(INVOICE({ fiscalStatus: 'ISSUED' }))
    await expect(FiscalService.issue({ currentUser: ADMIN, invoiceId: 'i1' })).rejects.toBeInstanceOf(InvalidStateError)
    db.invoice.findUnique.mockResolvedValue(INVOICE({ status: 'PAID' }))
    await expect(FiscalService.issue({ currentUser: ADMIN, invoiceId: 'i1' })).rejects.toBeInstanceOf(InvalidStateError)
  })
})

describe('annul', () => {
  it('annuls an issued invoice with a SIN reason', async () => {
    db.invoice.findUnique.mockResolvedValue(INVOICE({ fiscalStatus: 'ISSUED', fiscalNumber: 152 }))
    await FiscalService.annul({ currentUser: ADMIN, invoiceId: 'i1', reasonCode: 3, note: 'NIT incorrecto' })
    expect(db.invoice.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'i1', fiscalStatus: 'ISSUED' },
      data: expect.objectContaining({ fiscalStatus: 'ANNULLED', annulReasonCode: 3, annulNote: 'NIT incorrecto' }),
    })
  })

  it('refuses when payments exist or the invoice was never issued', async () => {
    db.invoice.findUnique.mockResolvedValue(INVOICE({ fiscalStatus: 'ISSUED', payments: [{ id: 'p1' }] }))
    await expect(FiscalService.annul({ currentUser: ADMIN, invoiceId: 'i1', reasonCode: 1, note: '' })).rejects.toThrow(/cobros/)
    db.invoice.findUnique.mockResolvedValue(INVOICE())
    await expect(FiscalService.annul({ currentUser: ADMIN, invoiceId: 'i1', reasonCode: 1, note: '' })).rejects.toBeInstanceOf(InvalidStateError)
  })
})

describe('exports', () => {
  const issued = {
    id: 'i1', number: 'INV-0150', fiscalNumber: 152, cuf: 'ABC123', fiscalStatus: 'ISSUED',
    fiscalIssuedAt: new Date('2026-11-09T14:00:00Z'), amountBOB: 1000, buyerName: 'INMOBILIARIA ORIENTE S.R.L.',
    buyerDocNumber: '1023456027', buyerDocComplement: '', exchangeRate: 6.96,
    client: { company: 'Inmobiliaria Oriente' }, project: { code: 'P-1' },
  }
  const annulled = { ...issued, id: 'i2', fiscalNumber: 153, cuf: 'DEF', fiscalStatus: 'ANNULLED', amountBOB: 500, annulledAt: new Date('2026-11-10T14:00:00Z'), annulReasonCode: 1 }

  it('sales book: V rows with IVA 13%, A rows zeroed', async () => {
    db.invoice.findMany.mockResolvedValue([issued, annulled])
    const { csv, filename } = await FiscalService.salesBook({ currentUser: ADMIN, month: '2026-11' })
    expect(filename).toBe('registro-ventas-2026-11.csv')
    const rows = csv.replace('﻿', '').trim().split('\r\n').map((r) => r.split(','))
    // 24 columns; the one header cell with a comma is quoted
    expect(csv).toContain(',"DESCUENTOS, BONIFICACIONES Y REBAJAS SUJETAS AL IVA",')
    expect(rows[0]).toHaveLength(25)
    expect(rows[1]).toHaveLength(24)
    expect(rows[1]).toEqual(['1', '2', '09/11/2026', '152', 'ABC123', '1023456027', '', 'INMOBILIARIA ORIENTE S.R.L.', '1000.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '1000.00', '0.00', '0.00', '1000.00', '130.00', 'V', '0', '0'])
    expect(rows[2][8]).toBe('0.00')
    expect(rows[2][21]).toBe('A')
  })

  it('journal balances: accrual, IT, collection and annulment reversal', async () => {
    db.invoice.findMany.mockResolvedValueOnce([issued, annulled]).mockResolvedValueOnce([annulled])
    db.payment.findMany.mockResolvedValue([
      { amountUSD: 100, paidAt: new Date('2026-11-20T15:00:00Z'), reference: 'TRX-9', invoice: { number: 'INV-0150', fiscalNumber: 152, exchangeRate: 6.96, currency: 'USD', buyerName: 'X' } },
    ])
    const { csv, balanced } = await FiscalService.journal({ currentUser: ADMIN, month: '2026-11' })
    expect(balanced).toBe(true)
    expect(csv).toContain('1.1.3.01,Cuentas por cobrar clientes,1000.00,0.00')
    expect(csv).toContain('2.1.4.01,Débito fiscal IVA,0.00,130.00')
    expect(csv).toContain('2.1.4.02,IT por pagar,0.00,30.00')
    expect(csv).toContain('1.1.1.02,Bancos,696.00,0.00')
    expect(csv).toMatch(/A-153.*Ingresos por servicios de arquitectura,435\.00,0\.00/)
    const totals = csv.trim().split('\r\n').pop()!
    expect(totals).toBe(',,,TOTALES,2756.00,2756.00,')
  })

  it('exports are restricted to principals and admins', async () => {
    await expect(FiscalService.salesBook({ currentUser: ARCH, month: '2026-11' })).rejects.toBeInstanceOf(ForbiddenError)
    await expect(FiscalService.journal({ currentUser: ARCH, month: '2026-11' })).rejects.toBeInstanceOf(ForbiddenError)
  })
})
