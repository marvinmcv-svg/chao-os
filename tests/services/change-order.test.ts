/**
 * ChangeOrderService unit tests — mocks @/lib/prisma.
 * Covers permissions, numbering, the status machine, the effect of an
 * approval on the contract (fee, phase fee, end date), the approval race
 * (portal vs. staff), invoicing and portal ownership checks.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: Record<string, any> = {
    project: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    phase: { update: vi.fn() },
    changeOrder: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    invoice: { delete: vi.fn() },
    user: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma))
  return { prisma }
})
vi.mock('@/services/InvoiceService', () => ({ InvoiceService: { create: vi.fn() } }))
vi.mock('@/services/NotificationService', () => ({ NotificationService: { create: vi.fn() } }))

import { prisma } from '@/lib/prisma'
import { ChangeOrderService, changeOrderInputSchema, summarize } from '@/services/ChangeOrderService'
import { InvoiceService } from '@/services/InvoiceService'
import { NotificationService } from '@/services/NotificationService'
import { ForbiddenError, InvalidStateError, NotFoundError } from '@/lib/result'

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const user = (role: string, id = `u_${role}`) => ({ id, role, name: role, email: 'x@x.bo', avatarInitials: 'XX' }) as any
const PRINCIPAL = user('PRINCIPAL')
const ARCH = user('ARCHITECT')
const PM = user('ARCHITECT', 'u_pm')

const PROJECT = { id: 'p1', code: 'CHA-2026-007', name: 'Casa Urubó', projectManagerId: 'u_pm', totalBudgetUSD: 40000, clientId: 'c1' }
const co = (over: Record<string, unknown> = {}) => ({
  id: 'co1',
  projectId: 'p1',
  sequence: 1,
  number: 'OC-CHA-2026-007-01',
  kind: 'CHANGE_ORDER',
  title: 'Terraza',
  description: '',
  reason: '',
  phase: 'DD',
  feeUSD: 3500,
  hours: 40,
  scheduleImpactDays: 14,
  status: 'DRAFT',
  invoiceId: null,
  decidedByName: null,
  createdById: 'u_PRINCIPAL',
  project: PROJECT,
  ...over,
})

const input = changeOrderInputSchema.parse({ kind: 'CHANGE_ORDER', title: 'Terraza', feeUSD: 3500, scheduleImpactDays: 14, phase: 'DD' })

beforeEach(() => {
  vi.clearAllMocks()
  db.project.findUnique.mockResolvedValue(PROJECT)
  db.changeOrder.findUnique.mockResolvedValue(co())
  db.changeOrder.findUniqueOrThrow.mockImplementation(() => Promise.resolve(co()))
  db.changeOrder.updateMany.mockResolvedValue({ count: 1 })
  db.changeOrder.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'co_new', ...data }))
  db.user.findMany.mockResolvedValue([{ id: 'u_PRINCIPAL' }])
  db.project.findUniqueOrThrow.mockResolvedValue({
    ...PROJECT,
    currentPhase: 'CD',
    estimatedEndDate: new Date('2027-03-01T00:00:00Z'),
    phases: [
      { id: 'ph_dd', phase: 'DD', budgetUSD: 10000 },
      { id: 'ph_cd', phase: 'CD', budgetUSD: 16000 },
    ],
  })
})

describe('input schema', () => {
  it('rejects a zero fee', () => {
    expect(() => changeOrderInputSchema.parse({ kind: 'CHANGE_ORDER', title: 'Nada', feeUSD: 0 })).toThrow()
  })
  it('accepts a credit (negative fee)', () => {
    expect(changeOrderInputSchema.parse({ kind: 'CHANGE_ORDER', title: 'Menos m2', feeUSD: -1200 }).feeUSD).toBe(-1200)
  })
})

describe('summarize', () => {
  it('derives the original fee from the current fee minus approved changes', () => {
    const s = summarize({ totalBudgetUSD: 43500 }, [
      { status: 'APPROVED', feeUSD: 3500, scheduleImpactDays: 14 },
      { status: 'SENT', feeUSD: 900, scheduleImpactDays: 0 },
      { status: 'REJECTED', feeUSD: 5000, scheduleImpactDays: 0 },
      { status: 'DRAFT', feeUSD: 100, scheduleImpactDays: 0 },
    ] as any)
    expect(s).toMatchObject({ originalFeeUSD: 40000, approvedUSD: 3500, pendingUSD: 900, currentFeeUSD: 43500, approvedDays: 14, pendingCount: 1 })
  })
})

describe('create', () => {
  it('numbers per project: OC-<code>-NN', async () => {
    db.changeOrder.findFirst.mockResolvedValue({ sequence: 2 })
    const row = await ChangeOrderService.create({ currentUser: PRINCIPAL, projectId: 'p1', data: input })
    expect(row).toMatchObject({ sequence: 3, number: 'OC-CHA-2026-007-03' })
  })

  it("lets the project's PM create even without a senior role", async () => {
    db.changeOrder.findFirst.mockResolvedValue(null)
    const row = await ChangeOrderService.create({ currentUser: PM, projectId: 'p1', data: input })
    expect(row.number).toBe('OC-CHA-2026-007-01')
  })

  it('forbids other architects', async () => {
    await expect(ChangeOrderService.create({ currentUser: ARCH, projectId: 'p1', data: input })).rejects.toThrow(ForbiddenError)
  })

  it('404s on unknown project', async () => {
    db.project.findUnique.mockResolvedValue(null)
    await expect(ChangeOrderService.create({ currentUser: PRINCIPAL, projectId: 'nope', data: input })).rejects.toThrow(NotFoundError)
  })
})

describe('edit / delete', () => {
  it('only drafts are editable', async () => {
    db.changeOrder.findUnique.mockResolvedValue(co({ status: 'SENT' }))
    await expect(ChangeOrderService.update({ currentUser: PRINCIPAL, id: 'co1', data: { title: 'X' } })).rejects.toThrow(InvalidStateError)
  })
  it('only drafts can be deleted', async () => {
    db.changeOrder.findUnique.mockResolvedValue(co({ status: 'APPROVED' }))
    await expect(ChangeOrderService.remove({ currentUser: PRINCIPAL, id: 'co1' })).rejects.toThrow(InvalidStateError)
  })
})

describe('transition', () => {
  it('send: DRAFT → SENT', async () => {
    await ChangeOrderService.transition({ currentUser: PRINCIPAL, id: 'co1', input: { action: 'send' } })
    expect(db.changeOrder.update).toHaveBeenCalledWith({ where: { id: 'co1' }, data: expect.objectContaining({ status: 'SENT' }) })
  })

  it('send: refuses a credit larger than the project fee', async () => {
    db.changeOrder.findUnique.mockResolvedValue(co({ feeUSD: -50000 }))
    await expect(ChangeOrderService.transition({ currentUser: PRINCIPAL, id: 'co1', input: { action: 'send' } })).rejects.toThrow(InvalidStateError)
  })

  it('send: architects cannot', async () => {
    await expect(ChangeOrderService.transition({ currentUser: ARCH, id: 'co1', input: { action: 'send' } })).rejects.toThrow(ForbiddenError)
  })

  it('withdraw: SENT → DRAFT, fails if the client already answered', async () => {
    db.changeOrder.findUnique.mockResolvedValue(co({ status: 'SENT' }))
    db.changeOrder.updateMany.mockResolvedValue({ count: 0 })
    await expect(ChangeOrderService.transition({ currentUser: PRINCIPAL, id: 'co1', input: { action: 'withdraw' } })).rejects.toThrow(InvalidStateError)
  })

  it('void: not allowed once decided', async () => {
    db.changeOrder.findUnique.mockResolvedValue(co({ status: 'APPROVED' }))
    await expect(ChangeOrderService.transition({ currentUser: PRINCIPAL, id: 'co1', input: { action: 'void' } })).rejects.toThrow(InvalidStateError)
  })

  it('recorded approval updates project fee, phase fee and end date, and notifies', async () => {
    db.changeOrder.findUnique.mockResolvedValue(co({ status: 'SENT' }))
    await ChangeOrderService.transition({ currentUser: PRINCIPAL, id: 'co1', input: { action: 'approve', signedBy: 'Ana Rojas', note: '' } })

    expect(db.changeOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'co1', status: 'SENT' },
      data: expect.objectContaining({ status: 'APPROVED', decidedByName: 'Ana Rojas', decisionChannel: 'INTERNAL' }),
    })
    expect(db.phase.update).toHaveBeenCalledWith({ where: { id: 'ph_dd' }, data: { budgetUSD: 13500 } })
    expect(db.project.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { totalBudgetUSD: 43500, estimatedEndDate: new Date('2027-03-15T00:00:00Z') },
    })
    // PM, author and principals — deduplicated
    expect(NotificationService.create).toHaveBeenCalledTimes(2)
  })

  it('approval without a phase lands on the current phase', async () => {
    db.changeOrder.findUnique.mockResolvedValue(co({ status: 'SENT', phase: null, scheduleImpactDays: 0 }))
    await ChangeOrderService.transition({ currentUser: PRINCIPAL, id: 'co1', input: { action: 'approve', signedBy: 'Ana', note: '' } })
    expect(db.phase.update).toHaveBeenCalledWith({ where: { id: 'ph_cd' }, data: { budgetUSD: 19500 } })
    expect(db.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { totalBudgetUSD: 43500 } })
  })

  it('a credit reduces the fee', async () => {
    db.changeOrder.findUnique.mockResolvedValue(co({ status: 'SENT', feeUSD: -2000, scheduleImpactDays: -7 }))
    await ChangeOrderService.transition({ currentUser: PRINCIPAL, id: 'co1', input: { action: 'approve', signedBy: 'Ana', note: '' } })
    expect(db.phase.update).toHaveBeenCalledWith({ where: { id: 'ph_dd' }, data: { budgetUSD: 8000 } })
    expect(db.project.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { totalBudgetUSD: 38000, estimatedEndDate: new Date('2027-02-22T00:00:00Z') },
    })
  })

  it('rejection never touches the contract', async () => {
    db.changeOrder.findUnique.mockResolvedValue(co({ status: 'SENT' }))
    await ChangeOrderService.transition({ currentUser: PRINCIPAL, id: 'co1', input: { action: 'reject', signedBy: 'Ana', note: 'caro' } })
    expect(db.project.update).not.toHaveBeenCalled()
    expect(db.phase.update).not.toHaveBeenCalled()
  })

  it('approval race: if the client decided first, nothing is applied twice', async () => {
    db.changeOrder.findUnique.mockResolvedValue(co({ status: 'SENT' }))
    db.changeOrder.updateMany.mockResolvedValue({ count: 0 })
    await expect(
      ChangeOrderService.transition({ currentUser: PRINCIPAL, id: 'co1', input: { action: 'approve', signedBy: 'Ana', note: '' } })
    ).rejects.toThrow(InvalidStateError)
    expect(db.project.update).not.toHaveBeenCalled()
    expect(NotificationService.create).not.toHaveBeenCalled()
  })

  it('invoice: creates a draft invoice for an approved change and links it', async () => {
    db.changeOrder.findUnique.mockResolvedValue(co({ status: 'APPROVED', decidedByName: 'Ana' }))
    ;(InvoiceService.create as any).mockResolvedValue({ id: 'inv1' })
    await ChangeOrderService.transition({ currentUser: PRINCIPAL, id: 'co1', input: { action: 'invoice' } })
    expect(InvoiceService.create).toHaveBeenCalledWith({
      currentUser: PRINCIPAL,
      data: expect.objectContaining({
        projectId: 'p1',
        clientId: 'c1',
        amountUSD: 3500,
        lineItems: [{ description: 'OC-CHA-2026-007-01 — Terraza', quantity: 1, unitPriceUSD: 3500 }],
      }),
    })
    expect(db.changeOrder.updateMany).toHaveBeenCalledWith({ where: { id: 'co1', invoiceId: null }, data: { invoiceId: 'inv1' } })
  })

  it('invoice: refuses credits, unapproved and already-invoiced orders', async () => {
    for (const over of [{ status: 'APPROVED', feeUSD: -10 }, { status: 'SENT' }, { status: 'APPROVED', invoiceId: 'x' }]) {
      db.changeOrder.findUnique.mockResolvedValue(co(over))
      await expect(ChangeOrderService.transition({ currentUser: PRINCIPAL, id: 'co1', input: { action: 'invoice' } })).rejects.toThrow(InvalidStateError)
    }
    expect(InvoiceService.create).not.toHaveBeenCalled()
  })

  it('invoice: a double click drops the duplicate draft', async () => {
    db.changeOrder.findUnique.mockResolvedValue(co({ status: 'APPROVED' }))
    ;(InvoiceService.create as any).mockResolvedValue({ id: 'inv2' })
    db.changeOrder.updateMany.mockResolvedValue({ count: 0 })
    await expect(ChangeOrderService.transition({ currentUser: PRINCIPAL, id: 'co1', input: { action: 'invoice' } })).rejects.toThrow(InvalidStateError)
    expect(db.invoice.delete).toHaveBeenCalledWith({ where: { id: 'inv2' } })
  })
})

describe('decideFromPortal', () => {
  const args = { token: 't', projectId: 'p1', changeOrderId: 'co1', decision: 'approve' as const, name: 'Ana Rojas', note: '', clientId: 'c1' }

  it("scopes the lookup to the token's client and project", async () => {
    db.changeOrder.findFirst.mockResolvedValue(co({ status: 'SENT' }))
    await ChangeOrderService.decideFromPortal(args)
    expect(db.changeOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'co1', projectId: 'p1', project: { clientId: 'c1' } } })
    )
    expect(db.changeOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'co1', status: 'SENT' },
      data: expect.objectContaining({ status: 'APPROVED', decisionChannel: 'PORTAL', decidedByName: 'Ana Rojas' }),
    })
    expect(db.project.update).toHaveBeenCalled()
  })

  it("404s on another client's change order", async () => {
    db.changeOrder.findFirst.mockResolvedValue(null)
    await expect(ChangeOrderService.decideFromPortal(args)).rejects.toThrow(NotFoundError)
  })

  it('hides drafts and voided orders from the client (404, not 422)', async () => {
    for (const status of ['DRAFT', 'VOID']) {
      db.changeOrder.findFirst.mockResolvedValue(co({ status }))
      await expect(ChangeOrderService.decideFromPortal(args)).rejects.toThrow(NotFoundError)
    }
  })

  it('refuses a second decision', async () => {
    db.changeOrder.findFirst.mockResolvedValue(co({ status: 'APPROVED' }))
    await expect(ChangeOrderService.decideFromPortal(args)).rejects.toThrow(InvalidStateError)
    expect(db.project.update).not.toHaveBeenCalled()
  })
})
