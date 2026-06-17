/**
 * LeadService unit tests — mocks @/lib/prisma, @/lib/email, @/lib/claude.
 * Mirrors the existing service-test style (notification/portal/project).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Hoisted mocks so the service file picks them up on import.
vi.mock('@/lib/prisma', () => {
  const prisma = {
    lead: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    client: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  }
  return { prisma }
})

vi.mock('@/lib/email', () => ({
  sendLeadConvertedEmail: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/claude', () => ({
  scoreLead: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { sendLeadConvertedEmail } from '@/lib/email'
import { scoreLead } from '@/lib/claude'
import { LeadService } from '@/services/LeadService'
import {
  ConflictError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from '@/lib/result'

// Re-typed mock handles so tests get typed fn references.
const mockPrisma = prisma as unknown as {
  lead: {
    findMany: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    aggregate: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  project: {
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  client: {
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  auditLog: { create: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
}
const mockEmail = sendLeadConvertedEmail as unknown as ReturnType<typeof vi.fn>
const mockScore = scoreLead as unknown as ReturnType<typeof vi.fn>

// Test helpers
function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_1',
    email: 'pm@chao-os.com',
    name: 'Pat Manager',
    role: 'ADMIN',
    avatarInitials: 'PM',
    ...overrides,
  } as any
}

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead_1',
    projectName: 'Tower Renovation',
    company: 'Acme Corp',
    contactName: 'Jane Smith',
    contactEmail: 'jane@acme.com',
    contactPhone: '+1-555-0100',
    estimatedValueUSD: 250000,
    projectType: 'COMMERCIAL',
    pipelineStage: 'PROSPECT',
    closeProbability: 10,
    aiScore: null,
    aiScoreBreakdown: null,
    aiRecommendation: null,
    aiAnalysis: null,
    notes: '',
    sourceType: 'DIRECT',
    sortOrder: 0,
    assignedToId: 'user_1',
    convertedToProjectId: null,
    assignedTo: { id: 'user_1', name: 'Pat Manager', avatarInitials: 'PM' },
    convertedToProject: null,
    ...overrides,
  } as any
}

const VALID_CREATE_DATA = {
  projectName: 'Tower Renovation',
  company: 'Acme Corp',
  contactName: 'Jane Smith',
  contactEmail: 'jane@acme.com',
  contactPhone: '+1-555-0100',
  estimatedValueUSD: 250000,
  projectType: 'COMMERCIAL',
  pipelineStage: 'PROSPECT',
  closeProbability: 10,
  sourceType: 'DIRECT',
  notes: 'initial inquiry',
  assignedToId: 'user_1',
} as any

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LeadService.list', () => {
  it('returns leads without a stage filter', async () => {
    const leads = [makeLead(), makeLead({ id: 'lead_2', pipelineStage: 'QUALIFIED' })]
    mockPrisma.lead.findMany.mockResolvedValue(leads)

    const result = await LeadService.list({ currentUser: makeUser() })

    expect(result).toEqual(leads)
    expect(mockPrisma.lead.findMany).toHaveBeenCalledWith({
      where: {},
      include: expect.objectContaining({ assignedTo: expect.any(Object) }),
      orderBy: [{ pipelineStage: 'asc' }, { sortOrder: 'asc' }],
    })
  })

  it('filters by pipeline stage when provided', async () => {
    mockPrisma.lead.findMany.mockResolvedValue([makeLead()])

    await LeadService.list({ currentUser: makeUser(), stage: 'WON' })

    expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pipelineStage: 'WON' } }),
    )
  })
})

describe('LeadService.create', () => {
  it('creates a lead with sortOrder = 0 when no existing leads in stage', async () => {
    mockPrisma.lead.aggregate.mockResolvedValue({ _max: { sortOrder: null } })
    mockPrisma.lead.create.mockResolvedValue(makeLead({ sortOrder: 0 }))
    mockPrisma.auditLog.create.mockResolvedValue({})

    await LeadService.create({ currentUser: makeUser(), data: VALID_CREATE_DATA })

    expect(mockPrisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sortOrder: 0, contactPhone: '+1-555-0100' }),
      }),
    )
  })

  it('calculates sortOrder as max + 1 for the stage', async () => {
    mockPrisma.lead.aggregate.mockResolvedValue({ _max: { sortOrder: 4 } })
    mockPrisma.lead.create.mockResolvedValue(makeLead({ sortOrder: 5 }))

    await LeadService.create({ currentUser: makeUser(), data: VALID_CREATE_DATA })

    expect(mockPrisma.lead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sortOrder: 5 }) }),
    )
  })

  it('writes a CREATE audit log entry on success', async () => {
    mockPrisma.lead.aggregate.mockResolvedValue({ _max: { sortOrder: null } })
    mockPrisma.lead.create.mockResolvedValue(makeLead())

    await LeadService.create({ currentUser: makeUser(), data: VALID_CREATE_DATA })

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_1',
        action: 'CREATE',
        entityType: 'Lead',
        entityId: 'lead_1',
      }),
    })
  })
})

describe('LeadService.getById', () => {
  it('returns the lead with relations when found', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(makeLead())

    const result = await LeadService.getById({ currentUser: makeUser(), id: 'lead_1' })

    expect(result.id).toBe('lead_1')
    expect(mockPrisma.lead.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'lead_1' } }),
    )
  })

  it('throws NotFoundError when lead does not exist', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(null)

    await expect(
      LeadService.getById({ currentUser: makeUser(), id: 'missing' }),
    ).rejects.toThrow(NotFoundError)
  })
})

describe('LeadService.update', () => {
  it('updates whitelisted fields and writes audit log with before-state', async () => {
    const before = makeLead({ closeProbability: 10 })
    mockPrisma.lead.findUnique.mockResolvedValue(before)
    mockPrisma.lead.update.mockResolvedValue({ ...before, closeProbability: 50 })

    await LeadService.update({
      currentUser: makeUser(),
      id: 'lead_1',
      data: { closeProbability: 50 },
    })

    expect(mockPrisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead_1' },
        data: { closeProbability: 50 },
      }),
    )
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'UPDATE',
          payload: expect.objectContaining({ before, after: expect.any(Object) }),
        }),
      }),
    )
  })

  it('throws NotFoundError when lead does not exist', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(null)

    await expect(
      LeadService.update({
        currentUser: makeUser(),
        id: 'missing',
        data: { closeProbability: 50 },
      }),
    ).rejects.toThrow(NotFoundError)
    expect(mockPrisma.lead.update).not.toHaveBeenCalled()
  })

  it('only writes fields that are present in the input', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(makeLead())
    mockPrisma.lead.update.mockResolvedValue(makeLead())

    await LeadService.update({
      currentUser: makeUser(),
      id: 'lead_1',
      data: { notes: 'updated' },
    })

    expect(mockPrisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { notes: 'updated' },
      }),
    )
  })
})

describe('LeadService.delete', () => {
  it('deletes the lead and writes a DELETE audit log entry', async () => {
    const before = makeLead()
    mockPrisma.lead.findUnique.mockResolvedValue(before)
    mockPrisma.lead.delete.mockResolvedValue(before)

    await LeadService.delete({ currentUser: makeUser(), id: 'lead_1' })

    expect(mockPrisma.lead.delete).toHaveBeenCalledWith({ where: { id: 'lead_1' } })
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DELETE',
          entityId: 'lead_1',
          payload: expect.objectContaining({ before }),
        }),
      }),
    )
  })

  it('throws NotFoundError when lead does not exist', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(null)

    await expect(
      LeadService.delete({ currentUser: makeUser(), id: 'missing' }),
    ).rejects.toThrow(NotFoundError)
    expect(mockPrisma.lead.delete).not.toHaveBeenCalled()
  })
})

describe('LeadService.getFunnel', () => {
  it('returns zero-filled stages and 0% win rate when there are no leads', async () => {
    mockPrisma.lead.findMany.mockResolvedValue([])

    const result = await LeadService.getFunnel({ currentUser: makeUser() })

    expect(result.funnel).toHaveLength(6)
    expect(result.funnel.every((s: any) => s.count === 0 && s.totalValue === 0)).toBe(true)
    expect(result.summary).toEqual({
      totalLeads: 0,
      wonLeads: 0,
      lostLeads: 0,
      winRate: 0,
      avgCycleDays: 0,
    })
  })

  it('computes counts, totals, and weighted values per stage', async () => {
    // 3 per-stage findMany calls + 2 full-collection calls
    mockPrisma.lead.findMany
      .mockResolvedValueOnce([
        { estimatedValueUSD: 100000, closeProbability: 50 },
        { estimatedValueUSD: 200000, closeProbability: 25 },
      ]) // PROSPECT
      .mockResolvedValueOnce([]) // QUALIFIED
      .mockResolvedValueOnce([]) // PROPOSAL
      .mockResolvedValueOnce([]) // NEGOTIATION
      .mockResolvedValueOnce([]) // WON
      .mockResolvedValueOnce([]) // LOST
      .mockResolvedValueOnce([{ pipelineStage: 'PROSPECT', createdAt: new Date(), updatedAt: new Date() }]) // allLeads
      .mockResolvedValueOnce([]) // closedWon

    const result = await LeadService.getFunnel({ currentUser: makeUser() })

    const prospect = result.funnel.find((s: any) => s.stage === 'PROSPECT')
    expect(prospect).toBeDefined()
    expect(prospect!.count).toBe(2)
    expect(prospect!.totalValue).toBe(300000)
    expect(prospect!.weightedValue).toBe(Math.round(100000 * 0.5 + 200000 * 0.25))
  })

  it('computes win rate and average cycle days for converted leads', async () => {
    const created = new Date('2026-01-01')
    const updated = new Date('2026-01-31')
    mockPrisma.lead.findMany
      .mockResolvedValueOnce([]) // PROSPECT
      .mockResolvedValueOnce([]) // QUALIFIED
      .mockResolvedValueOnce([]) // PROPOSAL
      .mockResolvedValueOnce([]) // NEGOTIATION
      .mockResolvedValueOnce([]) // WON
      .mockResolvedValueOnce([]) // LOST
      .mockResolvedValueOnce([
        { pipelineStage: 'WON', createdAt: created, updatedAt: updated },
        { pipelineStage: 'LOST', createdAt: created, updatedAt: updated },
      ]) // allLeads
      .mockResolvedValueOnce([{ createdAt: created, updatedAt: updated }]) // closedWon

    const result = await LeadService.getFunnel({ currentUser: makeUser() })

    expect(result.summary.wonLeads).toBe(1)
    expect(result.summary.lostLeads).toBe(1)
    expect(result.summary.winRate).toBe(50)
    expect(result.summary.avgCycleDays).toBe(30)
  })
})

describe('LeadService.updateStage', () => {
  it('updates the stage and writes audit log with from/to', async () => {
    const before = makeLead({ pipelineStage: 'PROSPECT' })
    mockPrisma.lead.findUnique.mockResolvedValue(before)
    mockPrisma.lead.update.mockResolvedValue({ ...before, pipelineStage: 'QUALIFIED' })

    await LeadService.updateStage({
      currentUser: makeUser(),
      id: 'lead_1',
      pipelineStage: 'QUALIFIED',
    })

    expect(mockPrisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pipelineStage: 'QUALIFIED' } }),
    )
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payload: { field: 'pipelineStage', from: 'PROSPECT', to: 'QUALIFIED' },
        }),
      }),
    )
  })

  it('auto-sets closeProbability=100 when moving to WON', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(makeLead({ closeProbability: 75 }))
    mockPrisma.lead.update.mockResolvedValue(makeLead({ pipelineStage: 'WON', closeProbability: 100 }))

    await LeadService.updateStage({
      currentUser: makeUser(),
      id: 'lead_1',
      pipelineStage: 'WON',
    })

    expect(mockPrisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pipelineStage: 'WON', closeProbability: 100 } }),
    )
  })

  it('throws ValidationError for an invalid stage', async () => {
    await expect(
      LeadService.updateStage({
        currentUser: makeUser(),
        id: 'lead_1',
        pipelineStage: 'BOGUS',
      }),
    ).rejects.toThrow(ValidationError)
    expect(mockPrisma.lead.findUnique).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when lead does not exist', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(null)

    await expect(
      LeadService.updateStage({
        currentUser: makeUser(),
        id: 'missing',
        pipelineStage: 'WON',
      }),
    ).rejects.toThrow(NotFoundError)
  })
})

describe('LeadService.getAiScore', () => {
  it('returns null when the lead has no AI score', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({
      aiScore: null,
      aiScoreBreakdown: null,
      aiRecommendation: null,
      aiAnalysis: null,
    })

    const result = await LeadService.getAiScore({ currentUser: makeUser(), id: 'lead_1' })

    expect(result).toBeNull()
  })

  it('returns the formatted score DTO when a score exists', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue({
      aiScore: 82,
      aiScoreBreakdown: {
        financialScore: 80,
        technicalScore: 85,
        commercialScore: 90,
        legalScore: 75,
        executionScore: 80,
      },
      aiRecommendation: 'GO',
      aiAnalysis: 'Strong financial profile.',
    })

    const result = await LeadService.getAiScore({ currentUser: makeUser(), id: 'lead_1' })

    expect(result).toEqual({
      overallScore: 82,
      breakdown: {
        financialScore: 80,
        technicalScore: 85,
        commercialScore: 90,
        legalScore: 75,
        executionScore: 80,
      },
      recommendation: 'GO',
      summary: 'Strong financial profile.',
      keyStrengths: [],
      keyRisks: [],
      nextSteps: [],
    })
  })

  it('throws NotFoundError when lead does not exist', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(null)

    await expect(
      LeadService.getAiScore({ currentUser: makeUser(), id: 'missing' }),
    ).rejects.toThrow(NotFoundError)
  })
})

describe('LeadService.triggerAiRescore', () => {
  it('calls Claude and persists the result', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(
      makeLead({ assignedTo: { name: 'Pat Manager' } }),
    )
    mockScore.mockResolvedValue({
      overallScore: 88,
      financialScore: 90,
      technicalScore: 85,
      commercialScore: 88,
      legalScore: 90,
      executionScore: 87,
      recommendation: 'GO',
      summary: 'Top-tier opportunity.',
      keyStrengths: ['Strong sponsor'],
      keyRisks: ['Aggressive timeline'],
      nextSteps: ['Schedule partner review'],
    })
    mockPrisma.lead.update.mockResolvedValue(makeLead())

    const result = await LeadService.triggerAiRescore({
      currentUser: makeUser(),
      id: 'lead_1',
    })

    expect(mockScore).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'Tower Renovation' }),
    )
    expect(mockPrisma.lead.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          aiScore: 88,
          aiRecommendation: 'GO',
          aiAnalysis: 'Top-tier opportunity.',
        }),
      }),
    )
    expect(result.overallScore).toBe(88)
    expect(result.keyStrengths).toEqual(['Strong sponsor'])
  })

  it('throws NotFoundError when lead does not exist', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(null)

    await expect(
      LeadService.triggerAiRescore({ currentUser: makeUser(), id: 'missing' }),
    ).rejects.toThrow(NotFoundError)
    expect(mockScore).not.toHaveBeenCalled()
  })
})

describe('LeadService.convertToProject', () => {
  it('runs the full transaction when the lead is WON and unconverted', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(
      makeLead({
        pipelineStage: 'WON',
        contactPhone: '+1-555-9999',
        assignedTo: { email: 'pm@chao-os.com', name: 'Pat Manager' },
      }),
    )
    mockPrisma.project.findFirst.mockResolvedValue({
      code: 'P-2026-004',
    })
    mockPrisma.client.findFirst.mockResolvedValue(null)
    mockPrisma.client.create.mockResolvedValue({ id: 'client_new' })

    const createdProject = { id: 'proj_1', code: 'P-2026-005', name: 'Tower Renovation' }
    // The transaction callback returns the project.
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        project: { create: vi.fn().mockResolvedValue(createdProject) },
        lead: { update: vi.fn().mockResolvedValue(makeLead({ convertedToProjectId: 'proj_1' })) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      }
      return cb(tx)
    })

    const result = await LeadService.convertToProject({
      currentUser: makeUser(),
      id: 'lead_1',
    })

    expect(mockPrisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: { startsWith: 'P-2026-' } } }),
    )
    expect(mockPrisma.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ email: 'jane@acme.com' }, { company: 'Acme Corp' }] },
      }),
    )
    expect(mockPrisma.client.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'ACTIVE' }) }),
    )
    expect(result).toEqual(createdProject)
    // Email is fired fire-and-forget (wait a tick for it)
    await new Promise((r) => setTimeout(r, 0))
    expect(mockEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        company: 'Acme Corp',
        projectName: 'Tower Renovation',
        assignedToEmail: 'pm@chao-os.com',
      }),
    )
  })

  it('uses existing client when one matches by email or company', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(
      makeLead({
        pipelineStage: 'WON',
        assignedTo: { email: 'pm@chao-os.com', name: 'Pat Manager' },
      }),
    )
    mockPrisma.project.findFirst.mockResolvedValue(null)
    mockPrisma.client.findFirst.mockResolvedValue({ id: 'client_existing' })
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const tx = {
        project: { create: vi.fn().mockResolvedValue({ id: 'proj_1', code: 'P-2026-001' }) },
        lead: { update: vi.fn().mockResolvedValue({}) },
        auditLog: { create: vi.fn().mockResolvedValue({}) },
      }
      return cb(tx)
    })

    await LeadService.convertToProject({ currentUser: makeUser(), id: 'lead_1' })

    expect(mockPrisma.client.create).not.toHaveBeenCalled()
  })

  it('throws InvalidStateError when lead is not WON', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(makeLead({ pipelineStage: 'PROSPECT' }))

    await expect(
      LeadService.convertToProject({ currentUser: makeUser(), id: 'lead_1' }),
    ).rejects.toThrow(InvalidStateError)
    expect(mockPrisma.project.findFirst).not.toHaveBeenCalled()
  })

  it('throws ConflictError when lead was already converted', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(
      makeLead({ pipelineStage: 'WON', convertedToProjectId: 'proj_existing' }),
    )

    await expect(
      LeadService.convertToProject({ currentUser: makeUser(), id: 'lead_1' }),
    ).rejects.toThrow(ConflictError)
    expect(mockPrisma.project.findFirst).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when lead does not exist', async () => {
    mockPrisma.lead.findUnique.mockResolvedValue(null)

    await expect(
      LeadService.convertToProject({ currentUser: makeUser(), id: 'missing' }),
    ).rejects.toThrow(NotFoundError)
  })
})
