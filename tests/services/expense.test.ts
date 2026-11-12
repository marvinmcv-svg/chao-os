/**
 * ExpenseService unit tests — mocks @/lib/prisma and S3.
 * Covers input validation (BOB conversion, markup only when billable),
 * auto-approval for approvers, the approval/reimbursement state machine,
 * permissions, invoicing (markup lines, double-billing race) and receipt
 * storage (Postgres fallback vs. S3).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: Record<string, any> = {
    project: { findUnique: vi.fn() },
    expense: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    expenseReceipt: { upsert: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
    invoice: { delete: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return { prisma }
})
vi.mock('@/lib/s3', () => ({
  isS3Configured: vi.fn(() => false),
  putObject: vi.fn(),
  deleteObject: vi.fn(() => Promise.resolve()),
  buildReceiptKey: vi.fn((p: string, e: string, f: string) => `projects/${p}/receipts/${e}-${f}`),
  getPresignedViewUrl: vi.fn(() => Promise.resolve('https://s3.example/signed')),
}))
vi.mock('@/services/InvoiceService', () => ({ InvoiceService: { create: vi.fn() } }))
vi.mock('@/services/NotificationService', () => ({ NotificationService: { create: vi.fn() } }))
vi.mock('@/services/CostService', () => ({ CostService: { refresh: vi.fn() } }))

import { prisma } from '@/lib/prisma'
import * as s3 from '@/lib/s3'
import { ExpenseService, expenseInputSchema, summarize, billedAmount, toUSD } from '@/services/ExpenseService'
import { InvoiceService } from '@/services/InvoiceService'
import { NotificationService } from '@/services/NotificationService'
import { CostService } from '@/services/CostService'
import { DomainError, ForbiddenError, InvalidStateError, NotFoundError } from '@/lib/result'

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const user = (role: string, id = `u_${role}`) => ({ id, role, name: role, email: 'x@x.bo', avatarInitials: 'XX' }) as any
const PRINCIPAL = user('PRINCIPAL')
const ADMIN = user('ADMIN')
const ARCH = user('ARCHITECT', 'u_arch')
const OTHER = user('ARCHITECT', 'u_other')
const PM = user('ARCHITECT_SENIOR', 'u_pm')

const PROJECT = { id: 'p1', code: 'CHA-2026-007', name: 'Casa Urubó', projectManagerId: 'u_pm', clientId: 'c1' }
const exp = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  projectId: 'p1',
  description: 'Ploteo DD',
  category: 'PRINTING',
  vendor: '',
  phase: null,
  amountUSD: 100,
  currency: 'USD',
  amountOriginal: 100,
  exchangeRate: 1,
  incurredAt: new Date('2026-10-01'),
  billable: true,
  markupPercent: 10,
  paidByStaff: false,
  status: 'SUBMITTED',
  submittedById: 'u_arch',
  reviewedById: null,
  reviewedAt: null,
  reviewNote: '',
  reimbursedAt: null,
  receiptKey: null,
  receiptName: null,
  receiptMime: null,
  receiptSize: null,
  invoiceId: null,
  project: PROJECT,
  ...over,
})

const input = (over: Record<string, unknown> = {}) =>
  expenseInputSchema.parse({ description: 'Ploteo DD', category: 'PRINTING', amount: 100, incurredAt: '2026-10-01', billable: true, markupPercent: 10, ...over })

beforeEach(() => {
  vi.clearAllMocks()
  db.project.findUnique.mockResolvedValue(PROJECT)
  db.expense.findUnique.mockResolvedValue(exp())
  db.expense.updateMany.mockResolvedValue({ count: 1 })
  db.expense.deleteMany.mockResolvedValue({ count: 1 })
  db.expense.create.mockImplementation(({ data }: any) => Promise.resolve({ ...exp(), ...data, id: 'e_new' }))
  vi.mocked(s3.isS3Configured).mockReturnValue(false)
})

describe('pure helpers', () => {
  it('billedAmount applies the markup', () => {
    expect(billedAmount({ amountUSD: 120, markupPercent: 10 })).toBe(132)
    expect(billedAmount({ amountUSD: 99.99, markupPercent: 0 })).toBe(99.99)
  })

  it('toUSD converts bolivianos at the given rate', () => {
    expect(toUSD(696, 'BOB', 6.96)).toBe(100)
    expect(toUSD(50.555, 'USD', 6.96)).toBe(50.56)
  })

  it('summarize counts only approved/reimbursed as cost and splits billed vs unbilled', () => {
    const s = summarize([
      { status: 'APPROVED', amountUSD: 100, markupPercent: 10, billable: true, paidByStaff: false, invoiceId: null },
      { status: 'APPROVED', amountUSD: 50, markupPercent: 0, billable: true, paidByStaff: true, invoiceId: 'inv1' },
      { status: 'REIMBURSED', amountUSD: 30, markupPercent: 0, billable: false, paidByStaff: true, invoiceId: null },
      { status: 'SUBMITTED', amountUSD: 999, markupPercent: 0, billable: true, paidByStaff: false, invoiceId: null },
      { status: 'REJECTED', amountUSD: 777, markupPercent: 0, billable: true, paidByStaff: false, invoiceId: null },
    ] as any)
    expect(s.costUSD).toBe(180)
    expect(s.pendingUSD).toBe(999)
    expect(s.pendingCount).toBe(1)
    expect(s.unbilledAmountUSD).toBe(110)
    expect(s.unbilledCount).toBe(1)
    expect(s.billedAmountUSD).toBe(50)
    expect(s.toReimburseUSD).toBe(50)
    expect(s.toReimburseCount).toBe(1)
  })
})

describe('input schema', () => {
  it('drops the markup when the expense is not billable', () => {
    expect(input({ billable: false, markupPercent: 25 }).markupPercent).toBe(0)
  })
  it('rejects future dates, zero amounts and markup > 100%', () => {
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
    expect(() => input({ incurredAt: future })).toThrow()
    expect(() => input({ amount: 0 })).toThrow()
    expect(() => input({ markupPercent: 150 })).toThrow()
  })
})

describe('create', () => {
  it('a team member’s expense is SUBMITTED and notifies the PM', async () => {
    await ExpenseService.create({ currentUser: ARCH, projectId: 'p1', data: input() })
    expect(CostService.refresh).not.toHaveBeenCalled() // not a cost until approved
    const data = db.expense.create.mock.calls[0][0].data
    expect(data.status).toBe('SUBMITTED')
    expect(data.submittedById).toBe('u_arch')
    expect(data.reviewedById).toBeUndefined()
    expect(NotificationService.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u_pm', type: 'EXPENSE_SUBMITTED' }))
  })

  it('the PM’s own expense is approved on creation, no notification', async () => {
    await ExpenseService.create({ currentUser: PM, projectId: 'p1', data: input() })
    const data = db.expense.create.mock.calls[0][0].data
    expect(data.status).toBe('APPROVED')
    expect(data.reviewedById).toBe('u_pm')
    expect(NotificationService.create).not.toHaveBeenCalled()
  })

  it('stores the original BOB amount and the USD conversion', async () => {
    await ExpenseService.create({ currentUser: ADMIN, projectId: 'p1', data: input({ currency: 'BOB', amount: 591.6, exchangeRate: 6.96 }) })
    const data = db.expense.create.mock.calls[0][0].data
    expect(data.amountOriginal).toBe(591.6)
    expect(data.exchangeRate).toBe(6.96)
    expect(data.amountUSD).toBe(85)
  })

  it('USD expenses always store a rate of 1', async () => {
    await ExpenseService.create({ currentUser: ADMIN, projectId: 'p1', data: input({ exchangeRate: 7.5 }) })
    expect(db.expense.create.mock.calls[0][0].data.exchangeRate).toBe(1)
  })

  it('404 for an unknown project', async () => {
    db.project.findUnique.mockResolvedValue(null)
    await expect(ExpenseService.create({ currentUser: ARCH, projectId: 'nope', data: input() })).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('approve / reject / reimburse', () => {
  it('the PM approves; the submitter is notified', async () => {
    await ExpenseService.transition({ currentUser: PM, id: 'e1', input: { action: 'approve' } })
    expect(db.expense.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'e1', status: 'SUBMITTED' }, data: expect.objectContaining({ status: 'APPROVED', reviewedById: 'u_pm' }) })
    )
    expect(NotificationService.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u_arch', type: 'EXPENSE_DECIDED', title: 'Gasto aprobado' }))
    // approval changes project cost
    expect(CostService.refresh).toHaveBeenCalledWith('p1')
  })

  it('reject stores the reason', async () => {
    await ExpenseService.transition({ currentUser: ADMIN, id: 'e1', input: { action: 'reject', note: 'Falta factura' } })
    expect(db.expense.updateMany.mock.calls[0][0].data).toEqual(expect.objectContaining({ status: 'REJECTED', reviewNote: 'Falta factura' }))
  })

  it('an architect who is not the PM cannot approve', async () => {
    await expect(ExpenseService.transition({ currentUser: OTHER, id: 'e1', input: { action: 'approve' } })).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('a PM cannot approve their own expense', async () => {
    db.expense.findUnique.mockResolvedValue(exp({ submittedById: 'u_pm' }))
    await expect(ExpenseService.transition({ currentUser: PM, id: 'e1', input: { action: 'approve' } })).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('a second reviewer loses the race with a 422', async () => {
    db.expense.updateMany.mockResolvedValue({ count: 0 })
    await expect(ExpenseService.transition({ currentUser: PM, id: 'e1', input: { action: 'approve' } })).rejects.toBeInstanceOf(InvalidStateError)
  })

  it('only submitted expenses can be reviewed', async () => {
    db.expense.findUnique.mockResolvedValue(exp({ status: 'APPROVED' }))
    await expect(ExpenseService.transition({ currentUser: PM, id: 'e1', input: { action: 'reject', note: 'xxx' } })).rejects.toBeInstanceOf(InvalidStateError)
  })

  it('admin reimburses an approved out-of-pocket expense', async () => {
    db.expense.findUnique.mockResolvedValue(exp({ status: 'APPROVED', paidByStaff: true }))
    await ExpenseService.transition({ currentUser: ADMIN, id: 'e1', input: { action: 'reimburse' } })
    expect(db.expense.updateMany.mock.calls[0][0]).toEqual(
      expect.objectContaining({ where: { id: 'e1', status: 'APPROVED', paidByStaff: true }, data: expect.objectContaining({ status: 'REIMBURSED' }) })
    )
  })

  it('reimbursement needs finance role, paidByStaff and APPROVED', async () => {
    db.expense.findUnique.mockResolvedValue(exp({ status: 'APPROVED', paidByStaff: true }))
    await expect(ExpenseService.transition({ currentUser: PM, id: 'e1', input: { action: 'reimburse' } })).rejects.toBeInstanceOf(ForbiddenError)
    db.expense.findUnique.mockResolvedValue(exp({ status: 'APPROVED', paidByStaff: false }))
    await expect(ExpenseService.transition({ currentUser: ADMIN, id: 'e1', input: { action: 'reimburse' } })).rejects.toBeInstanceOf(InvalidStateError)
    db.expense.findUnique.mockResolvedValue(exp({ status: 'SUBMITTED', paidByStaff: true }))
    await expect(ExpenseService.transition({ currentUser: ADMIN, id: 'e1', input: { action: 'reimburse' } })).rejects.toBeInstanceOf(InvalidStateError)
  })
})

describe('edit / delete', () => {
  it('editing a rejected expense resubmits it', async () => {
    db.expense.findUnique.mockResolvedValue(exp({ status: 'REJECTED', reviewNote: 'Falta factura' }))
    await ExpenseService.update({ currentUser: ARCH, id: 'e1', data: input() })
    expect(db.expense.updateMany.mock.calls[0][0].data).toEqual(expect.objectContaining({ status: 'SUBMITTED', reviewNote: '' }))
  })

  it('the submitter cannot edit after approval; someone else never can', async () => {
    db.expense.findUnique.mockResolvedValue(exp({ status: 'APPROVED' }))
    await expect(ExpenseService.update({ currentUser: ARCH, id: 'e1', data: input() })).rejects.toBeInstanceOf(InvalidStateError)
    db.expense.findUnique.mockResolvedValue(exp())
    await expect(ExpenseService.update({ currentUser: OTHER, id: 'e1', data: input() })).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('invoiced or reimbursed expenses are locked, even for approvers', async () => {
    db.expense.findUnique.mockResolvedValue(exp({ status: 'APPROVED', invoiceId: 'inv1' }))
    await expect(ExpenseService.update({ currentUser: ADMIN, id: 'e1', data: input() })).rejects.toBeInstanceOf(InvalidStateError)
    await expect(ExpenseService.remove({ currentUser: ADMIN, id: 'e1' })).rejects.toBeInstanceOf(InvalidStateError)
    db.expense.findUnique.mockResolvedValue(exp({ status: 'REIMBURSED' }))
    await expect(ExpenseService.remove({ currentUser: ADMIN, id: 'e1' })).rejects.toBeInstanceOf(InvalidStateError)
  })

  it('deleting removes the S3 receipt (non-fatal)', async () => {
    db.expense.findUnique.mockResolvedValue(exp({ receiptKey: 'projects/p1/receipts/e1-a.pdf' }))
    vi.mocked(s3.deleteObject).mockRejectedValueOnce(new Error('S3 down'))
    await expect(ExpenseService.remove({ currentUser: ARCH, id: 'e1' })).resolves.toEqual({ id: 'e1' })
    expect(s3.deleteObject).toHaveBeenCalledWith('projects/p1/receipts/e1-a.pdf')
  })
})

describe('invoice reimbursables', () => {
  const approved = [
    exp({ id: 'e1', status: 'APPROVED', amountUSD: 120, markupPercent: 10, vendor: 'Ploteos SC' }),
    exp({ id: 'e2', status: 'REIMBURSED', amountUSD: 450, markupPercent: 15 }),
  ]
  beforeEach(() => {
    db.expense.findMany.mockResolvedValue(approved)
    vi.mocked(InvoiceService.create).mockResolvedValue({ id: 'inv9', number: 'INV-0150' } as any)
    db.expense.updateMany.mockResolvedValue({ count: 2 })
  })

  it('creates one draft with a line per expense at cost + markup', async () => {
    const r = await ExpenseService.invoice({ currentUser: PM, projectId: 'p1' })
    const data = vi.mocked(InvoiceService.create).mock.calls[0][0].data
    expect(data.lineItems!.map((l) => l.unitPriceUSD)).toEqual([132, 517.5])
    expect(data.amountUSD).toBe(649.5)
    expect(data.lineItems![0].description).toContain('Ploteos SC')
    expect(db.expense.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ billable: true, invoiceId: null, status: { in: ['APPROVED', 'REIMBURSED'] } })
    )
    expect(db.expense.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['e1', 'e2'] }, invoiceId: null }, data: { invoiceId: 'inv9' } })
    expect(r).toEqual({ invoice: { id: 'inv9', number: 'INV-0150', amountUSD: 649.5 }, count: 2 })
  })

  it('rolls back the draft when another user billed one of them first', async () => {
    db.expense.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 })
    await expect(ExpenseService.invoice({ currentUser: PM, projectId: 'p1' })).rejects.toBeInstanceOf(InvalidStateError)
    expect(db.expense.updateMany).toHaveBeenLastCalledWith({ where: { invoiceId: 'inv9' }, data: { invoiceId: null } })
    expect(db.invoice.delete).toHaveBeenCalledWith({ where: { id: 'inv9' } })
  })

  it('refuses when a selected expense is no longer billable', async () => {
    await expect(ExpenseService.invoice({ currentUser: PM, projectId: 'p1', expenseIds: ['e1', 'e2', 'e3'] })).rejects.toBeInstanceOf(InvalidStateError)
    expect(InvoiceService.create).not.toHaveBeenCalled()
  })

  it('nothing to bill → 422; architects cannot bill', async () => {
    db.expense.findMany.mockResolvedValue([])
    await expect(ExpenseService.invoice({ currentUser: PM, projectId: 'p1' })).rejects.toBeInstanceOf(InvalidStateError)
    await expect(ExpenseService.invoice({ currentUser: ARCH, projectId: 'p1' })).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('receipts', () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46])

  it('stores bytes in Postgres when S3 is not configured', async () => {
    await ExpenseService.attachReceipt({ currentUser: ARCH, id: 'e1', filename: 'factura.pdf', mimeType: 'application/pdf', bytes: pdf })
    expect(db.expenseReceipt.upsert).toHaveBeenCalled()
    expect(s3.putObject).not.toHaveBeenCalled()
    expect(db.expense.update.mock.calls[0][0].data).toEqual({ receiptKey: 'db', receiptName: 'factura.pdf', receiptMime: 'application/pdf', receiptSize: 4 })
  })

  it('uploads to S3 when configured and deletes the replaced object', async () => {
    vi.mocked(s3.isS3Configured).mockReturnValue(true)
    db.expense.findUnique.mockResolvedValue(exp({ receiptKey: 'projects/p1/receipts/e1-old.pdf' }))
    await ExpenseService.attachReceipt({ currentUser: ARCH, id: 'e1', filename: 'factura.pdf', mimeType: 'application/pdf', bytes: pdf })
    expect(s3.putObject).toHaveBeenCalledWith(expect.stringMatching(/^projects\/p1\/receipts\/e1-/), pdf, 'application/pdf')
    expect(db.expenseReceipt.upsert).not.toHaveBeenCalled()
    expect(s3.deleteObject).toHaveBeenCalledWith('projects/p1/receipts/e1-old.pdf')
  })

  it('rejects bad types, oversize files and strangers', async () => {
    await expect(ExpenseService.attachReceipt({ currentUser: ARCH, id: 'e1', filename: 'x.exe', mimeType: 'application/x-msdownload', bytes: pdf })).rejects.toBeInstanceOf(DomainError)
    await expect(
      ExpenseService.attachReceipt({ currentUser: ARCH, id: 'e1', filename: 'x.pdf', mimeType: 'application/pdf', bytes: new Uint8Array(4 * 1024 * 1024 + 1) })
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
    await expect(ExpenseService.attachReceipt({ currentUser: OTHER, id: 'e1', filename: 'x.pdf', mimeType: 'application/pdf', bytes: pdf })).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('getReceipt returns bytes from Postgres or a presigned S3 URL', async () => {
    db.expense.findUnique.mockResolvedValue(exp({ receiptKey: 'db', receiptMime: 'image/jpeg', receiptName: 'r.jpg' }))
    db.expenseReceipt.findUnique.mockResolvedValue({ data: Buffer.from('jpg') })
    expect(await ExpenseService.getReceipt({ currentUser: OTHER, id: 'e1' })).toEqual(expect.objectContaining({ kind: 'bytes', mimeType: 'image/jpeg' }))
    db.expense.findUnique.mockResolvedValue(exp({ receiptKey: 'projects/p1/receipts/e1-r.jpg', receiptMime: 'image/jpeg', receiptName: 'r.jpg' }))
    expect(await ExpenseService.getReceipt({ currentUser: OTHER, id: 'e1' })).toEqual({ kind: 'redirect', url: 'https://s3.example/signed' })
    db.expense.findUnique.mockResolvedValue(exp())
    await expect(ExpenseService.getReceipt({ currentUser: OTHER, id: 'e1' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('never exposes the storage key to the client', async () => {
    db.expense.findUnique.mockResolvedValue(exp({ receiptKey: 'projects/p1/receipts/secret', receiptName: 'a.pdf' }))
    const out = await ExpenseService.transition({ currentUser: PM, id: 'e1', input: { action: 'approve' } })
    expect(out).not.toHaveProperty('receiptKey')
    expect(out.hasReceipt).toBe(true)
  })
})

describe('list scope', () => {
  it('finance roles see everything; others only their own or their projects', async () => {
    db.expense.findMany.mockResolvedValue([])
    await ExpenseService.list({ currentUser: ADMIN, query: { scope: 'all' } })
    expect(db.expense.findMany.mock.calls[0][0].where).toEqual({})
    await ExpenseService.list({ currentUser: PM, query: { scope: 'all' } })
    expect(db.expense.findMany.mock.calls[1][0].where).toEqual({ OR: [{ submittedById: 'u_pm' }, { project: { projectManagerId: 'u_pm' } }] })
    await ExpenseService.list({ currentUser: ARCH, query: { scope: 'mine' } })
    expect(db.expense.findMany.mock.calls[2][0].where).toEqual({ submittedById: 'u_arch' })
  })
})
