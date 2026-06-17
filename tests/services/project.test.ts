/**
 * TEST: project.test.ts
 *
 * Verifies ProjectService with mocked Prisma + mocked email.
 * No DB connection needed — we check the right Prisma calls are made
 * with the right arguments, and the right DomainError subclasses are
 * thrown for each failure mode.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks (must come BEFORE the service import) ─────────────────────────
const mockProjectFindMany = vi.fn()
const mockProjectCount = vi.fn()
const mockProjectFindUnique = vi.fn()
const mockProjectCreate = vi.fn()
const mockProjectUpdate = vi.fn()
const mockProjectDelete = vi.fn()
const mockProjectMemberFindMany = vi.fn()
const mockProjectMemberFindUnique = vi.fn()
const mockProjectMemberCreate = vi.fn()
const mockAuditLogCreate = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findMany: (...args: unknown[]) => mockProjectFindMany(...args),
      count: (...args: unknown[]) => mockProjectCount(...args),
      findUnique: (...args: unknown[]) => mockProjectFindUnique(...args),
      create: (...args: unknown[]) => mockProjectCreate(...args),
      update: (...args: unknown[]) => mockProjectUpdate(...args),
      delete: (...args: unknown[]) => mockProjectDelete(...args),
    },
    projectMember: {
      findMany: (...args: unknown[]) => mockProjectMemberFindMany(...args),
      findUnique: (...args: unknown[]) => mockProjectMemberFindUnique(...args),
      create: (...args: unknown[]) => mockProjectMemberCreate(...args),
    },
    auditLog: {
      create: (...args: unknown[]) => mockAuditLogCreate(...args),
    },
  },
}))

const mockSendEmail = vi.fn()
vi.mock('@/lib/email', () => ({
  sendProjectUpdateEmail: (...args: unknown[]) => mockSendEmail(...args),
}))

import { ProjectService } from '@/services/ProjectService'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/lib/result'
import type { AuthUser } from '@/lib/auth'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Test helpers ────────────────────────────────────────────────────────
function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user_1',
    email: 'admin@chao.test',
    name: 'Admin User',
    role: 'ADMIN',
    avatarInitials: 'AU',
    ...overrides,
  }
}

const VALID_CREATE_INPUT = {
  code: 'P-2026-001',
  name: 'Casa Lopez',
  clientId: 'client_1',
  projectManagerId: 'user_1',
  type: 'RESIDENTIAL',
  contractType: 'FIXED_FEE',
  currentPhase: 'SD',
  totalBudgetUSD: 100000,
  startDate: '2026-01-01T00:00:00.000Z',
  estimatedEndDate: '2026-12-31T00:00:00.000Z',
} as const

// ─── list() ──────────────────────────────────────────────────────────────
describe('ProjectService.list', () => {
  it('returns paginated results with no filters applied', async () => {
    mockProjectFindMany.mockResolvedValueOnce([])
    mockProjectCount.mockResolvedValueOnce(0)

    const result = await ProjectService.list({ currentUser: makeUser() })

    expect(mockProjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 0, take: 50, orderBy: { code: 'desc' } }),
    )
    expect(result).toEqual({
      projects: [],
      total: 0,
      page: 1,
      limit: 50,
      totalPages: 0,
    })
  })

  it('applies status filter to where clause', async () => {
    mockProjectFindMany.mockResolvedValueOnce([])
    mockProjectCount.mockResolvedValueOnce(0)
    await ProjectService.list({ currentUser: makeUser(), status: 'ON_TRACK' })
    expect(mockProjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ON_TRACK' } }),
    )
  })

  it('applies clientId filter to where clause', async () => {
    mockProjectFindMany.mockResolvedValueOnce([])
    mockProjectCount.mockResolvedValueOnce(0)
    await ProjectService.list({ currentUser: makeUser(), clientId: 'client_1' })
    expect(mockProjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clientId: 'client_1' } }),
    )
  })

  it('combines both filters and computes pagination math correctly', async () => {
    mockProjectFindMany.mockResolvedValueOnce([])
    mockProjectCount.mockResolvedValueOnce(123)
    const result = await ProjectService.list({
      currentUser: makeUser(),
      status: 'ON_TRACK',
      clientId: 'client_1',
      page: 3,
      limit: 10,
    })
    expect(mockProjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ON_TRACK', clientId: 'client_1' },
        skip: 20,
        take: 10,
      }),
    )
    expect(result.totalPages).toBe(13) // ceil(123 / 10)
    expect(result.page).toBe(3)
    expect(result.limit).toBe(10)
  })
})

// ─── create() ────────────────────────────────────────────────────────────
describe('ProjectService.create', () => {
  it('creates the project + 4 default phases with 15/25/40/20 budget split', async () => {
    mockProjectFindUnique.mockResolvedValueOnce(null) // no duplicate
    mockProjectCreate.mockResolvedValueOnce({ id: 'p1', code: 'P-2026-001' })
    mockAuditLogCreate.mockResolvedValueOnce({})

    await ProjectService.create({ currentUser: makeUser(), data: VALID_CREATE_INPUT })

    expect(mockProjectCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: 'P-2026-001',
          name: 'Casa Lopez',
          phases: {
            create: [
              expect.objectContaining({ phase: 'SD', budgetUSD: 15000, status: 'NOT_STARTED' }),
              expect.objectContaining({ phase: 'DD', budgetUSD: 25000, status: 'NOT_STARTED' }),
              expect.objectContaining({ phase: 'CD', budgetUSD: 40000, status: 'NOT_STARTED' }),
              expect.objectContaining({ phase: 'CA', budgetUSD: 20000, status: 'NOT_STARTED' }),
            ],
          },
        }),
      }),
    )
  })

  it('throws ConflictError when the code already exists and skips the create call', async () => {
    mockProjectFindUnique.mockResolvedValueOnce({ id: 'existing' })
    await expect(
      ProjectService.create({ currentUser: makeUser(), data: VALID_CREATE_INPUT }),
    ).rejects.toThrow(ConflictError)
    expect(mockProjectCreate).not.toHaveBeenCalled()
    expect(mockAuditLogCreate).not.toHaveBeenCalled()
  })

  it('writes a CREATE audit log entry tagged with the current user', async () => {
    mockProjectFindUnique.mockResolvedValueOnce(null)
    mockProjectCreate.mockResolvedValueOnce({ id: 'p_new', code: 'P-2026-001' })
    mockAuditLogCreate.mockResolvedValueOnce({})

    await ProjectService.create({ currentUser: makeUser(), data: VALID_CREATE_INPUT })

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE',
        entityType: 'Project',
        entityId: 'p_new',
        userId: 'user_1',
      }),
    })
  })
})

// ─── getById() ───────────────────────────────────────────────────────────
describe('ProjectService.getById', () => {
  it('returns the project with the full detail include tree', async () => {
    const fakeProject = { id: 'p1', code: 'P-2026-001', phases: [], milestones: [] }
    mockProjectFindUnique.mockResolvedValueOnce(fakeProject)

    const result = await ProjectService.getById({ currentUser: makeUser(), id: 'p1' })

    expect(mockProjectFindUnique).toHaveBeenCalledWith({
      where: { id: 'p1' },
      include: expect.objectContaining({
        client: true,
        phases: expect.objectContaining({ orderBy: { phase: 'asc' } }),
        milestones: expect.anything(),
        teamMembers: expect.anything(),
        tasks: expect.objectContaining({ where: { status: { not: 'DONE' } } }),
        invoices: expect.anything(),
        expenses: expect.anything(),
      }),
    })
    expect(result).toBe(fakeProject)
  })

  it('throws NotFoundError when the project does not exist', async () => {
    mockProjectFindUnique.mockResolvedValueOnce(null)
    await expect(
      ProjectService.getById({ currentUser: makeUser(), id: 'missing' }),
    ).rejects.toThrow(NotFoundError)
  })
})

// ─── update() ────────────────────────────────────────────────────────────
describe('ProjectService.update', () => {
  it('updates the project and parses date strings to Date', async () => {
    const existing = { id: 'p1', code: 'P-2026-001', name: 'Old name' }
    const updated = { id: 'p1', code: 'P-2026-001', name: 'New name' }
    mockProjectFindUnique.mockResolvedValueOnce(existing)
    mockProjectUpdate.mockResolvedValueOnce(updated)
    mockAuditLogCreate.mockResolvedValueOnce({})

    await ProjectService.update({
      currentUser: makeUser(),
      id: 'p1',
      data: {
        name: 'New name',
        startDate: '2026-06-01T00:00:00.000Z',
        estimatedEndDate: '2027-01-01T00:00:00.000Z',
      },
    })

    expect(mockProjectUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({
          name: 'New name',
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          estimatedEndDate: new Date('2027-01-01T00:00:00.000Z'),
        }),
      }),
    )
  })

  it('throws NotFoundError when the project does not exist (no update, no audit)', async () => {
    mockProjectFindUnique.mockResolvedValueOnce(null)
    await expect(
      ProjectService.update({ currentUser: makeUser(), id: 'missing', data: { name: 'X' } }),
    ).rejects.toThrow(NotFoundError)
    expect(mockProjectUpdate).not.toHaveBeenCalled()
    expect(mockAuditLogCreate).not.toHaveBeenCalled()
  })

  it('audit log captures before-state for forensic reconstruction', async () => {
    const existing = { id: 'p1', code: 'P-2026-001', name: 'Old' }
    const updated = { id: 'p1', code: 'P-2026-001', name: 'New' }
    mockProjectFindUnique.mockResolvedValueOnce(existing)
    mockProjectUpdate.mockResolvedValueOnce(updated)
    mockAuditLogCreate.mockResolvedValueOnce({})

    await ProjectService.update({
      currentUser: makeUser(),
      id: 'p1',
      data: { name: 'New' },
    })

    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE',
        entityType: 'Project',
        entityId: 'p1',
        payload: expect.objectContaining({
          fields: ['name'],
          before: existing,
          after: updated,
        }),
      }),
    })
  })
})

// ─── delete() ────────────────────────────────────────────────────────────
describe('ProjectService.delete', () => {
  it('deletes when called by an ADMIN', async () => {
    mockProjectFindUnique.mockResolvedValueOnce({ id: 'p1', code: 'P-2026-001' })
    mockProjectDelete.mockResolvedValueOnce({ id: 'p1' })
    mockAuditLogCreate.mockResolvedValueOnce({})

    const result = await ProjectService.delete({
      currentUser: makeUser({ role: 'ADMIN' }),
      id: 'p1',
    })

    expect(result).toEqual({ id: 'p1' })
    expect(mockProjectDelete).toHaveBeenCalledWith({ where: { id: 'p1' } })
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'DELETE', entityType: 'Project' }),
    })
  })

  it('deletes when called by a PRINCIPAL', async () => {
    mockProjectFindUnique.mockResolvedValueOnce({ id: 'p1', code: 'P-2026-001' })
    mockProjectDelete.mockResolvedValueOnce({ id: 'p1' })
    mockAuditLogCreate.mockResolvedValueOnce({})

    await ProjectService.delete({
      currentUser: makeUser({ role: 'PRINCIPAL' }),
      id: 'p1',
    })

    expect(mockProjectDelete).toHaveBeenCalled()
  })

  it('throws ForbiddenError when called by an ARCHITECT', async () => {
    await expect(
      ProjectService.delete({
        currentUser: makeUser({ role: 'ARCHITECT' }),
        id: 'p1',
      }),
    ).rejects.toThrow(ForbiddenError)
    expect(mockProjectFindUnique).not.toHaveBeenCalled()
    expect(mockProjectDelete).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the project does not exist', async () => {
    mockProjectFindUnique.mockResolvedValueOnce(null)
    await expect(
      ProjectService.delete({ currentUser: makeUser({ role: 'ADMIN' }), id: 'missing' }),
    ).rejects.toThrow(NotFoundError)
    expect(mockProjectDelete).not.toHaveBeenCalled()
  })
})

// ─── listTeamMembers() ───────────────────────────────────────────────────
describe('ProjectService.listTeamMembers', () => {
  it('returns the project members with user details joined', async () => {
    const members = [{ id: 'pm1', userId: 'u1', user: { id: 'u1', name: 'Alice' } }]
    mockProjectMemberFindMany.mockResolvedValueOnce(members)

    const result = await ProjectService.listTeamMembers({
      currentUser: makeUser(),
      projectId: 'p1',
    })

    expect(mockProjectMemberFindMany).toHaveBeenCalledWith({
      where: { projectId: 'p1' },
      include: expect.objectContaining({ user: expect.anything() }),
    })
    expect(result).toBe(members)
  })

  it('returns an empty array when there are no members', async () => {
    mockProjectMemberFindMany.mockResolvedValueOnce([])
    const result = await ProjectService.listTeamMembers({
      currentUser: makeUser(),
      projectId: 'p1',
    })
    expect(result).toEqual([])
  })
})

// ─── addTeamMember() ─────────────────────────────────────────────────────
describe('ProjectService.addTeamMember', () => {
  it('adds a member and writes an audit log entry', async () => {
    mockProjectMemberFindUnique.mockResolvedValueOnce(null) // not a member yet
    mockProjectMemberCreate.mockResolvedValueOnce({ id: 'pm_new' })
    mockAuditLogCreate.mockResolvedValueOnce({})

    await ProjectService.addTeamMember({
      currentUser: makeUser(),
      projectId: 'p1',
      userId: 'u_new',
      role: 'ARCHITECT',
    })

    expect(mockProjectMemberCreate).toHaveBeenCalledWith({
      data: { projectId: 'p1', userId: 'u_new', role: 'ARCHITECT' },
      include: expect.objectContaining({ user: expect.anything() }),
    })
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE',
        entityType: 'ProjectMember',
        payload: expect.objectContaining({ projectId: 'p1', addedUserId: 'u_new', role: 'ARCHITECT' }),
      }),
    })
  })

  it('throws ConflictError when the user is already a member', async () => {
    mockProjectMemberFindUnique.mockResolvedValueOnce({ id: 'existing' })
    await expect(
      ProjectService.addTeamMember({
        currentUser: makeUser(),
        projectId: 'p1',
        userId: 'u_existing',
        role: 'ARCHITECT',
      }),
    ).rejects.toThrow(ConflictError)
    expect(mockProjectMemberCreate).not.toHaveBeenCalled()
  })

  it('throws ValidationError when userId is missing', async () => {
    await expect(
      ProjectService.addTeamMember({
        currentUser: makeUser(),
        projectId: 'p1',
        userId: '',
        role: 'ARCHITECT',
      }),
    ).rejects.toThrow(ValidationError)
  })
})

// ─── updatePhase() ───────────────────────────────────────────────────────
describe('ProjectService.updatePhase', () => {
  it('updates the phase, writes audit, and fires the client email', async () => {
    mockProjectFindUnique.mockResolvedValueOnce({
      id: 'p1',
      name: 'Casa Lopez',
      currentPhase: 'SD',
      client: { name: 'John Doe', email: 'john@example.com' },
      projectManager: { name: 'Alice PM' },
    })
    mockProjectUpdate.mockResolvedValueOnce({ id: 'p1', currentPhase: 'DD' })
    mockAuditLogCreate.mockResolvedValueOnce({})

    await ProjectService.updatePhase({
      currentUser: makeUser(),
      projectId: 'p1',
      phase: 'DD',
    })

    expect(mockProjectUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { currentPhase: 'DD' },
      include: expect.objectContaining({ phases: expect.anything() }),
    })
    expect(mockAuditLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE',
        payload: expect.objectContaining({
          field: 'currentPhase',
          from: 'SD',
          to: 'DD',
        }),
      }),
    })
    // Email fires with the right args
    expect(mockSendEmail).toHaveBeenCalledWith({
      name: 'Casa Lopez',
      clientName: 'John Doe',
      clientEmail: 'john@example.com',
      newPhase: 'DD',
      newPhaseLabel: 'Design Development',
    })
  })

  it('throws ValidationError for an invalid phase and does not touch the DB', async () => {
    await expect(
      ProjectService.updatePhase({
        currentUser: makeUser(),
        projectId: 'p1',
        phase: 'XX',
      }),
    ).rejects.toThrow(ValidationError)
    expect(mockProjectFindUnique).not.toHaveBeenCalled()
    expect(mockProjectUpdate).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the project does not exist', async () => {
    mockProjectFindUnique.mockResolvedValueOnce(null)
    await expect(
      ProjectService.updatePhase({
        currentUser: makeUser(),
        projectId: 'missing',
        phase: 'DD',
      }),
    ).rejects.toThrow(NotFoundError)
    expect(mockProjectUpdate).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})
