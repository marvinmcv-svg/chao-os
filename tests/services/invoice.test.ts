/**
 * InvoiceService unit tests — mocks @/lib/prisma, @/lib/email, @/lib/pdf.
 * Mirrors the existing service-test style.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma = {
    invoice: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    payment: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    project: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
    notification: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return { prisma }
})

vi.mock('@/lib/email', () => ({
  sendInvoiceEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentReceivedEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/pdf/generateInvoicePdf', () => ({
  generateInvoicePdf: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { sendInvoiceEmail, sendPaymentReceivedEmail } from '@/lib/email'
import { generateInvoicePdf } from '@/lib/pdf/generateInvoicePdf'
import { InvoiceService } from '@/services/InvoiceService'
import {
  InsufficientPaymentsError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from '@/lib/result'

const mockPrisma = prisma as unknown as {
invoice: {
      findMany: ReturnType<typeof vi.fn>
      findUnique: ReturnType<typeof vi.fn>
      findFirst: ReturnType<typeof vi.fn>
      create: ReturnType<typeof vi.fn>
      update: ReturnType<typeof vi.fn>
      delete: ReturnType<typeof vi.fn>
    }
  payment: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  project: { findUnique: ReturnType<typeof vi.fn> }
  user: { findMany: ReturnType<typeof vi.fn> }
  notification: { createMany: ReturnType<typeof vi.fn> }
  auditLog: { create: ReturnType<typeof vi.fn> }
}
const mockSendInvoiceEmail = sendInvoiceEmail as unknown as ReturnType<typeof vi.fn>
const mockSendPaymentEmail = sendPaymentReceivedEmail as unknown as ReturnType<typeof vi.fn>
const mockGeneratePdf = generateInvoicePdf as unknown as ReturnType<typeof vi.fn>

// Test helpers
function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_1',
    email: 'admin@chao-os.com',
    name: 'Ada Admin',
    role: 'ADMIN',
    avatarInitials: 'AA',
    ...overrides,
  } as any
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv_1',
    number: 'INV-0142',
    projectId: 'proj_1',
    clientId: 'client_1',
    amountUSD: 10000,
    currency: 'USD',
    exchangeRate: 1,
    status: 'DRAFT',
    issuedAt: new Date('2026-01-15'),
    dueDate: new Date('2026-08-01'),
    paidAt: null,
    notes: '',
    pdfUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    project: { id: 'proj_1', code: 'P-2026-001', name: 'Tower Renovation' },
    client: { id: 'client_1', name: 'Acme Corp', company: 'Acme', email: 'billing@acme.com' },
    lineItems: [],
    payments: [],
    ...overrides,
  } as any
}

const VALID_CREATE = {
  projectId: 'proj_1',
  clientId: 'client_1',
  milestoneLabel: 'Hito 1',
  amountUSD: 10000,
  currency: 'USD',
  exchangeRate: 1,
  dueDate: '2026-08-01T00:00:00.000Z',
  notes: '',
} as const

beforeEach(() => {
  vi.clearAllMocks()
})

describe('InvoiceService.list', () => {
  it('returns all invoices with no filters', async () => {
    const invoices = [makeInvoice(), makeInvoice({ id: 'inv_2', number: 'INV-0143' })]
    mockPrisma.invoice.findMany.mockResolvedValue(invoices)

    const result = await InvoiceService.list({ currentUser: makeUser() })

    expect(result).toHaveLength(2)
    expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { issuedAt: 'desc' } }),
    )
  })

  it('passes status and projectId filters when provided', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice()])

    await InvoiceService.list({
      currentUser: makeUser(),
      status: 'SENT',
      projectId: 'proj_9',
    })

    expect(mockPrisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'SENT', projectId: 'proj_9' } }),
    )
  })

  it('computes paidAmount from each invoice payments', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({
        payments: [
          { id: 'pay_1', amountUSD: 4000 },
          { id: 'pay_2', amountUSD: 3500 },
        ],
      }),
    ])

    const [inv] = await InvoiceService.list({ currentUser: makeUser() })

    expect(inv.paidAmount).toBe(7500)
  })
})

describe('InvoiceService.create', () => {
  it('uses explicit clientId when provided (no project lookup needed)', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null)
    mockPrisma.invoice.create.mockResolvedValue(makeInvoice())

    await InvoiceService.create({ currentUser: makeUser(), data: VALID_CREATE as any })

    expect(mockPrisma.project.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientId: 'client_1' }) }),
    )
  })

  it('derives clientId from the project when omitted', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ clientId: 'client_project' })
    mockPrisma.invoice.findFirst.mockResolvedValue(null) // no last invoice -> seed 141
    mockPrisma.invoice.create.mockResolvedValue(makeInvoice())

    const { clientId: _omit, ...dataWithoutClient } = VALID_CREATE
    await InvoiceService.create({
      currentUser: makeUser(),
      data: { ...dataWithoutClient, clientId: undefined } as any,
    })

    expect(mockPrisma.project.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'proj_1' } }),
    )
    expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ clientId: 'client_project' }) }),
    )
  })

  it('throws ValidationError when no client can be derived', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null)

    await expect(
      InvoiceService.create({
        currentUser: makeUser(),
        data: { ...VALID_CREATE, clientId: undefined } as any,
      }),
    ).rejects.toThrow(ValidationError)
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled()
  })

  it('generates sequential INV numbers and writes CREATE audit log', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(makeInvoice({ number: 'INV-0143' }))
    mockPrisma.invoice.create.mockResolvedValue(makeInvoice({ number: 'INV-0144' }))

    await InvoiceService.create({ currentUser: makeUser(), data: VALID_CREATE })

    expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ number: 'INV-0144' }) }),
    )
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CREATE',
          entityType: 'Invoice',
          payload: { number: 'INV-0144' },
        }),
      }),
    )
  })

  it('creates line items with computed totals when provided', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null)
    mockPrisma.invoice.create.mockResolvedValue(makeInvoice())

    await InvoiceService.create({
      currentUser: makeUser(),
      data: {
        ...VALID_CREATE,
        lineItems: [
          { description: 'Design', quantity: 2, unitPriceUSD: 2500 },
          { description: 'Permits', quantity: 1, unitPriceUSD: 5000 },
        ],
      } as any,
    })

    expect(mockPrisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lineItems: {
            create: [
              { description: 'Design', quantity: 2, unitPriceUSD: 2500, totalUSD: 5000 },
              { description: 'Permits', quantity: 1, unitPriceUSD: 5000, totalUSD: 5000 },
            ],
          },
        }),
      }),
    )
  })
})

describe('InvoiceService.getById', () => {
  it('returns invoice with paidAmount when found', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(
      makeInvoice({
        payments: [{ amountUSD: 2500 }, { amountUSD: 2500 }],
      }),
    )

    const result = await InvoiceService.getById({ currentUser: makeUser(), id: 'inv_1' })

    expect(result.id).toBe('inv_1')
    expect(result.paidAmount).toBe(5000)
  })

  it('throws NotFoundError when invoice does not exist', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(null)

    await expect(
      InvoiceService.getById({ currentUser: makeUser(), id: 'missing' }),
    ).rejects.toThrow(NotFoundError)
  })
})

describe('InvoiceService.update', () => {
  it('updates fields and writes audit with before/after', async () => {
    const before = makeInvoice({ amountUSD: 10000 })
    mockPrisma.invoice.findUnique.mockResolvedValue(before)
    mockPrisma.invoice.update.mockResolvedValue({ ...before, amountUSD: 12000 })

    await InvoiceService.update({
      currentUser: makeUser(),
      id: 'inv_1',
      data: { amountUSD: 12000 },
    })

    expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv_1' },
        data: { amountUSD: 12000 },
      }),
    )
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'UPDATE', payload: expect.objectContaining({ before }) }),
      }),
    )
  })

  it('throws NotFoundError when invoice does not exist', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(null)

    await expect(
      InvoiceService.update({
        currentUser: makeUser(),
        id: 'missing',
        data: { notes: 'x' },
      }),
    ).rejects.toThrow(NotFoundError)
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled()
  })
})

describe('InvoiceService.delete', () => {
  it('deletes a DRAFT invoice and writes DELETE audit log', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(makeInvoice({ status: 'DRAFT' }))
    mockPrisma.invoice.delete.mockResolvedValue({})

    await InvoiceService.delete({ currentUser: makeUser(), id: 'inv_1' })

    expect(mockPrisma.invoice.delete).toHaveBeenCalledWith({ where: { id: 'inv_1' } })
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'DELETE' }) }),
    )
  })

  it('throws InvalidStateError for non-DRAFT invoices', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(makeInvoice({ status: 'SENT' }))

    await expect(
      InvoiceService.delete({ currentUser: makeUser(), id: 'inv_1' }),
    ).rejects.toThrow(InvalidStateError)
    expect(mockPrisma.invoice.delete).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when invoice does not exist', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(null)

    await expect(
      InvoiceService.delete({ currentUser: makeUser(), id: 'missing' }),
    ).rejects.toThrow(NotFoundError)
  })
})

describe('InvoiceService.updateStatus', () => {
  it('transitions to SENT and fires the invoice email', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(makeInvoice({ status: 'DRAFT' }))
    mockPrisma.invoice.update.mockResolvedValue(makeInvoice({ status: 'SENT' }))

    await InvoiceService.updateStatus({ currentUser: makeUser(), id: 'inv_1', status: 'SENT' })

    expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'SENT' } }),
    )
    await new Promise((r) => setTimeout(r, 0))
    expect(mockSendInvoiceEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        number: 'INV-0142',
        clientEmail: 'billing@acme.com',
        projectName: 'Tower Renovation',
      }),
    )
  })

  it('sets paidAt when transitioning to PAID with sufficient payments', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(makeInvoice({ status: 'PENDING', amountUSD: 10000 }))
    mockPrisma.payment.findMany.mockResolvedValue([{ amountUSD: 10000 }])
    mockPrisma.invoice.update.mockResolvedValue(makeInvoice({ status: 'PAID', paidAt: new Date() }))

    await InvoiceService.updateStatus({ currentUser: makeUser(), id: 'inv_1', status: 'PAID' })

    expect(mockPrisma.payment.findMany).toHaveBeenCalledWith({
      where: { invoiceId: 'inv_1' },
    })
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID', paidAt: expect.any(Date) }) }),
    )
  })

  it('throws InsufficientPaymentsError when payments are below the amount', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(
      makeInvoice({ status: 'PENDING', amountUSD: 10000 }),
    )
    mockPrisma.payment.findMany.mockResolvedValue([{ amountUSD: 4000 }])

    await expect(
      InvoiceService.updateStatus({ currentUser: makeUser(), id: 'inv_1', status: 'PAID' }),
    ).rejects.toThrow(InsufficientPaymentsError)
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled()
  })

  it('promotes PENDING with past due date to OVERDUE', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(
      makeInvoice({ status: 'PENDING', dueDate: new Date('2025-01-01') }),
    )
    mockPrisma.invoice.update.mockResolvedValue(
      makeInvoice({ status: 'OVERDUE', dueDate: new Date('2025-01-01') }),
    )
    mockPrisma.user.findMany.mockResolvedValue([])
    mockPrisma.notification.createMany.mockResolvedValue({ count: 0 })

    await InvoiceService.updateStatus({ currentUser: makeUser(), id: 'inv_1', status: 'PENDING' })

    expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'OVERDUE' } }),
    )
  })

  it('notifies all ADMIN users when the invoice becomes OVERDUE', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(
      makeInvoice({ status: 'PENDING', dueDate: new Date('2025-01-01') }),
    )
    mockPrisma.invoice.update.mockResolvedValue(
      makeInvoice({ status: 'OVERDUE', dueDate: new Date('2025-01-01') }),
    )
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'admin_1' }, { id: 'admin_2' }])
    mockPrisma.notification.createMany.mockResolvedValue({ count: 2 })

    await InvoiceService.updateStatus({ currentUser: makeUser(), id: 'inv_1', status: 'PENDING' })

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: { role: 'ADMIN' },
      select: { id: true },
    })
    expect(mockPrisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'admin_1', type: 'OVERDUE_INVOICE' }),
          expect.objectContaining({ userId: 'admin_2', type: 'OVERDUE_INVOICE' }),
        ]),
      }),
    )
  })
})

describe('InvoiceService.recordPayment', () => {
  it('records a partial payment without promoting the invoice', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(makeInvoice({ status: 'SENT', amountUSD: 10000 }))
    mockPrisma.payment.findMany.mockResolvedValue([{ amountUSD: 3000 }])
    mockPrisma.payment.create.mockResolvedValue({ id: 'pay_1', amountUSD: 2500 })
    mockPrisma.invoice.update.mockResolvedValue(makeInvoice())

    await InvoiceService.recordPayment({
      currentUser: makeUser(),
      id: 'inv_1',
      data: { amountUSD: 2500 },
    })

    expect(mockPrisma.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invoiceId: 'inv_1', amountUSD: 2500 }),
      }),
    )
    // 3000 + 2500 < 10000 -> invoice is NOT updated
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled()
  })

  it('auto-promotes to PAID when cumulative payments reach the amount', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(makeInvoice({ status: 'SENT', amountUSD: 10000 }))
    mockPrisma.payment.findMany.mockResolvedValue([{ amountUSD: 7000 }])
    mockPrisma.payment.create.mockResolvedValue({ id: 'pay_1', amountUSD: 3000 })

    await InvoiceService.recordPayment({
      currentUser: makeUser(),
      id: 'inv_1',
      data: { amountUSD: 3000 },
    })

    expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv_1' },
        data: expect.objectContaining({ status: 'PAID', paidAt: expect.any(Date) }),
      }),
    )
  })

  it('rejects overpayments with ValidationError', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(makeInvoice({ amountUSD: 10000 }))
    mockPrisma.payment.findMany.mockResolvedValue([{ amountUSD: 9000 }])

    await expect(
      InvoiceService.recordPayment({
        currentUser: makeUser(),
        id: 'inv_1',
        data: { amountUSD: 2000 },
      }),
    ).rejects.toThrow(ValidationError)
    expect(mockPrisma.payment.create).not.toHaveBeenCalled()
  })

  it('writes audit log and emails the client', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(makeInvoice({ amountUSD: 10000 }))
    mockPrisma.payment.findMany.mockResolvedValue([])
    mockPrisma.payment.create.mockResolvedValue({ id: 'pay_1', amountUSD: 5000 })
    mockPrisma.invoice.update.mockResolvedValue(makeInvoice())

    await InvoiceService.recordPayment({
      currentUser: makeUser(),
      id: 'inv_1',
      data: { amountUSD: 5000 },
    })

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CREATE',
          entityType: 'Payment',
          payload: { invoiceId: 'inv_1', amount: 5000 },
        }),
      }),
    )
    await new Promise((r) => setTimeout(r, 0))
    expect(mockSendPaymentEmail).toHaveBeenCalledWith(
      expect.objectContaining({ number: 'INV-0142', clientEmail: 'billing@acme.com' }),
    )
  })

  it('throws NotFoundError when invoice does not exist', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(null)

    await expect(
      InvoiceService.recordPayment({
        currentUser: makeUser(),
        id: 'missing',
        data: { amountUSD: 100 },
      }),
    ).rejects.toThrow(NotFoundError)
  })
})

describe('InvoiceService.getPdf', () => {
  it('generates PDF, persists pdfUrl, and returns the buffer', async () => {
    const invoice = makeInvoice()
    mockPrisma.invoice.findUnique.mockResolvedValue(invoice)
    mockGeneratePdf.mockResolvedValue(new Uint8Array([1, 2, 3]))

    const result = await InvoiceService.getPdf({ currentUser: makeUser(), id: 'inv_1' })

    expect(mockGeneratePdf).toHaveBeenCalledWith(invoice)
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inv_1' },
        data: { pdfUrl: '/api/invoices/inv_1/pdf' },
      }),
    )
    expect(result.pdfBuffer).toBeInstanceOf(Uint8Array)
  })

  it('throws NotFoundError when invoice does not exist', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue(null)

    await expect(
      InvoiceService.getPdf({ currentUser: makeUser(), id: 'missing' }),
    ).rejects.toThrow(NotFoundError)
    expect(mockGeneratePdf).not.toHaveBeenCalled()
  })
})