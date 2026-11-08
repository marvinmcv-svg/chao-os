/**
 * FeeProposalService unit tests — mocks @/lib/prisma.
 * Covers permissions, cost hiding, versioning and the status machine
 * (send / accept / decline / revise) and its effect on the lead.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const prisma: Record<string, any> = {
    lead: { findUnique: vi.fn(), update: vi.fn() },
    feeProposal: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    teamMember: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  prisma.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(prisma))
  return { prisma }
})

import { prisma } from '@/lib/prisma'
import { FeeProposalService } from '@/services/FeeProposalService'
import { buildTemplatePhases } from '@/lib/fees'
import { ConflictError, ForbiddenError, InvalidStateError } from '@/lib/result'

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const user = (role: string) => ({ id: `u_${role}`, role, name: role, email: 'x@x.bo', avatarInitials: 'XX' }) as any
const PRINCIPAL = user('PRINCIPAL')
const ARCH = user('ARCHITECT')

const LEAD = { id: 'lead_1', projectName: 'Casa', projectType: 'RESIDENTIAL', pipelineStage: 'QUALIFIED', closeProbability: 30, convertedToProjectId: null }
const phases = buildTemplatePhases({ areaM2: 500, projectType: 'RESIDENTIAL' })
const row = (over: Record<string, unknown> = {}) => ({
  id: 'fp_1',
  number: 'PRO-2026-001',
  version: 1,
  leadId: 'lead_1',
  status: 'DRAFT',
  contractType: 'FIXED_FEE',
  areaM2: 500,
  discountPercent: 0,
  phases,
  feeUSD: 20000,
  costUSD: 9000,
  hours: 450,
  scope: '',
  exclusions: '',
  paymentTerms: '',
  validUntil: new Date('2026-12-31'),
  sentAt: null,
  decidedAt: null,
  createdById: 'u_PRINCIPAL',
  lead: LEAD,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  db.teamMember.findMany.mockResolvedValue([
    { hourlyRate: 20, user: { role: 'ARCHITECT' } },
    { hourlyRate: 30, user: { role: 'ARCHITECT' } },
  ])
  db.lead.findUnique.mockResolvedValue(LEAD)
  db.feeProposal.findFirst.mockResolvedValue(null)
  db.feeProposal.findMany.mockResolvedValue([])
  db.feeProposal.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'fp_new', status: 'DRAFT', ...data }))
  db.feeProposal.update.mockImplementation(({ data }: any) => Promise.resolve(row(data)))
  db.feeProposal.findUnique.mockResolvedValue(row())
})

describe('getCostRates', () => {
  it('averages team cost rates by role', async () => {
    expect(await FeeProposalService.getCostRates()).toEqual({ ARCHITECT: 25 })
  })
})

describe('create', () => {
  it('numbers the first proposal of the year and fills it from the area template', async () => {
    db.feeProposal.findFirst
      .mockResolvedValueOnce(null) // no previous version for this lead
      .mockResolvedValueOnce({ number: `PRO-${new Date().getUTCFullYear()}-007` })
    const p: any = await FeeProposalService.create({ currentUser: PRINCIPAL, leadId: 'lead_1', areaM2: 500 })
    const data = db.feeProposal.create.mock.calls[0][0].data
    expect(data.number).toBe(`PRO-${new Date().getUTCFullYear()}-008`)
    expect(data.version).toBe(1)
    expect(data.feeUSD).toBeGreaterThan(0)
    expect(data.feeUSD).toBe(p.totals.feeUSD)
    expect(p.canEdit).toBe(true)
  })

  it('opens a new version instead when the lead already has a proposal', async () => {
    db.feeProposal.findFirst.mockResolvedValueOnce({ id: 'fp_1' })
    db.feeProposal.findUnique.mockResolvedValue(row({ status: 'SENT' }))
    db.feeProposal.findMany.mockResolvedValue([{ id: 'fp_1', version: 1, status: 'SENT' }])
    await FeeProposalService.create({ currentUser: PRINCIPAL, leadId: 'lead_1' })
    expect(db.feeProposal.create.mock.calls[0][0].data).toMatchObject({ number: 'PRO-2026-001', version: 2 })
  })

  it('is limited to directors and senior architects', async () => {
    await expect(FeeProposalService.create({ currentUser: ARCH, leadId: 'lead_1' })).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('refuses converted leads', async () => {
    db.lead.findUnique.mockResolvedValue({ ...LEAD, convertedToProjectId: 'p1' })
    await expect(FeeProposalService.create({ currentUser: PRINCIPAL, leadId: 'lead_1' })).rejects.toBeInstanceOf(ConflictError)
  })
})

describe('get / list — cost visibility', () => {
  it('hides cost and margin from non-editors', async () => {
    const p: any = await FeeProposalService.get({ currentUser: ARCH, id: 'fp_1' })
    expect(p.canEdit).toBe(false)
    expect(p.costUSD).toBeUndefined()
    expect(p.totals.costUSD).toBeNull()
    expect(p.totals.marginPercent).toBeNull()
    expect(p.costRates).toBeUndefined()
    expect(p.totals.feeUSD).toBeGreaterThan(0)
  })

  it('shows cost and margin to editors', async () => {
    const p: any = await FeeProposalService.get({ currentUser: PRINCIPAL, id: 'fp_1' })
    expect(p.totals.costUSD).toBeGreaterThan(0)
    expect(p.costRates).toEqual({ ARCHITECT: 25 })
  })

  it('lists versions with margin only for editors', async () => {
    db.lead.findUnique.mockResolvedValue({ id: 'lead_1' })
    db.feeProposal.findMany.mockResolvedValue([row()])
    const [mine] = await FeeProposalService.listForLead({ currentUser: PRINCIPAL, leadId: 'lead_1' })
    const [theirs] = await FeeProposalService.listForLead({ currentUser: ARCH, leadId: 'lead_1' })
    expect(mine).toMatchObject({ costUSD: 9000, marginPercent: 55 })
    expect(theirs).toMatchObject({ costUSD: null, marginPercent: null })
    expect('phases' in theirs).toBe(false)
  })
})

describe('update', () => {
  it('recomputes the denormalised totals on save', async () => {
    await FeeProposalService.update({ currentUser: PRINCIPAL, id: 'fp_1', data: { discountPercent: 10, validUntil: '2027-01-31' } })
    const data = db.feeProposal.update.mock.calls[0][0].data
    expect(data.discountPercent).toBe(10)
    expect(data.validUntil).toEqual(new Date('2027-01-31T00:00:00Z'))
    const gross = phases.flatMap((p) => p.lines).reduce((s, l) => s + l.hours * l.rateUSD, 0)
    expect(data.feeUSD).toBeCloseTo(gross * 0.9, 2)
  })

  it('only edits drafts', async () => {
    db.feeProposal.findUnique.mockResolvedValue(row({ status: 'SENT' }))
    await expect(FeeProposalService.update({ currentUser: PRINCIPAL, id: 'fp_1', data: { scope: 'x' } })).rejects.toBeInstanceOf(InvalidStateError)
  })
})

describe('transition', () => {
  it('send: supersedes other sent versions, records the fee on the lead and advances it to PROPOSAL', async () => {
    await FeeProposalService.transition({ currentUser: PRINCIPAL, id: 'fp_1', action: 'send' })
    expect(db.feeProposal.updateMany.mock.calls[0][0]).toMatchObject({ where: { leadId: 'lead_1', status: 'SENT' }, data: { status: 'SUPERSEDED' } })
    expect(db.feeProposal.update.mock.calls[0][0].data).toMatchObject({ status: 'SENT' })
    expect(db.lead.update.mock.calls[0][0].data).toEqual({ estimatedValueUSD: 20000, pipelineStage: 'PROPOSAL', closeProbability: 50 })
  })

  it('send: does not move a lead that is already further along', async () => {
    db.feeProposal.findUnique.mockResolvedValue(row({ lead: { ...LEAD, pipelineStage: 'NEGOTIATION' } }))
    await FeeProposalService.transition({ currentUser: PRINCIPAL, id: 'fp_1', action: 'send' })
    expect(db.lead.update.mock.calls[0][0].data).toEqual({ estimatedValueUSD: 20000 })
  })

  it('send: refuses an empty proposal', async () => {
    db.feeProposal.findUnique.mockResolvedValue(row({ feeUSD: 0 }))
    await expect(FeeProposalService.transition({ currentUser: PRINCIPAL, id: 'fp_1', action: 'send' })).rejects.toBeInstanceOf(InvalidStateError)
  })

  it('accept: wins the lead at the proposed fee and supersedes open versions', async () => {
    db.feeProposal.findUnique.mockResolvedValue(row({ status: 'SENT' }))
    await FeeProposalService.transition({ currentUser: PRINCIPAL, id: 'fp_1', action: 'accept' })
    expect(db.feeProposal.updateMany.mock.calls[0][0].where.status).toEqual({ in: ['DRAFT', 'SENT'] })
    expect(db.feeProposal.update.mock.calls[0][0].data).toMatchObject({ status: 'ACCEPTED' })
    expect(db.lead.update.mock.calls[0][0].data).toEqual({ pipelineStage: 'WON', closeProbability: 100, estimatedValueUSD: 20000 })
  })

  it('accept / decline only from SENT', async () => {
    await expect(FeeProposalService.transition({ currentUser: PRINCIPAL, id: 'fp_1', action: 'accept' })).rejects.toBeInstanceOf(InvalidStateError)
    await expect(FeeProposalService.transition({ currentUser: PRINCIPAL, id: 'fp_1', action: 'decline' })).rejects.toBeInstanceOf(InvalidStateError)
  })

  it('decline marks the version rejected without touching the lead', async () => {
    db.feeProposal.findUnique.mockResolvedValue(row({ status: 'SENT' }))
    await FeeProposalService.transition({ currentUser: PRINCIPAL, id: 'fp_1', action: 'decline' })
    expect(db.feeProposal.update.mock.calls[0][0].data).toMatchObject({ status: 'DECLINED' })
    expect(db.lead.update).not.toHaveBeenCalled()
  })

  it('revise: refuses when a draft is already open or the proposal was accepted', async () => {
    db.feeProposal.findUnique.mockResolvedValue(row({ status: 'SENT' }))
    db.feeProposal.findMany.mockResolvedValue([{ id: 'fp_2', version: 2, status: 'DRAFT' }])
    await expect(FeeProposalService.transition({ currentUser: PRINCIPAL, id: 'fp_1', action: 'revise' })).rejects.toBeInstanceOf(ConflictError)
    db.feeProposal.findMany.mockResolvedValue([{ id: 'fp_1', version: 1, status: 'ACCEPTED' }])
    await expect(FeeProposalService.transition({ currentUser: PRINCIPAL, id: 'fp_1', action: 'revise' })).rejects.toBeInstanceOf(InvalidStateError)
  })

  it('architects cannot change status', async () => {
    await expect(FeeProposalService.transition({ currentUser: ARCH, id: 'fp_1', action: 'send' })).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('remove', () => {
  it('deletes drafts only', async () => {
    await FeeProposalService.remove({ currentUser: PRINCIPAL, id: 'fp_1' })
    expect(db.feeProposal.delete).toHaveBeenCalledWith({ where: { id: 'fp_1' } })
    db.feeProposal.findUnique.mockResolvedValue(row({ status: 'SENT' }))
    await expect(FeeProposalService.remove({ currentUser: PRINCIPAL, id: 'fp_1' })).rejects.toBeInstanceOf(InvalidStateError)
  })
})
