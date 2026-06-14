/**
 * TEST: portal.test.ts
 *
 * Verifies PortalService with a mocked Prisma client — no DB needed.
 * We check:
 *   - the right Prisma calls are made with the right arguments
 *   - the right DomainError subclasses are thrown for each failure mode
 *   - the portalLastLogin side effect fires on successful authenticate
 *   - the project query is filtered by clientId (ownership enforcement)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Prisma BEFORE importing the service
const mockClientFindFirst = vi.fn()
const mockClientUpdate = vi.fn()
const mockProjectFindFirst = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: {
      findFirst: (...args: unknown[]) => mockClientFindFirst(...args),
      update: (...args: unknown[]) => mockClientUpdate(...args),
    },
    project: {
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
    },
  },
}))

import { PortalService } from '@/services/PortalService'
import { UnauthorizedError } from '@/lib/require-auth'
import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
} from '@/lib/result'

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── authenticate() ──────────────────────────────────────────────────────

describe('PortalService.authenticate', () => {
  it('throws ValidationError on the token field when token is missing', async () => {
    await expect(
      PortalService.authenticate({ token: undefined, projectId: 'p1' })
    ).rejects.toThrow(ValidationError)
    expect(mockClientFindFirst).not.toHaveBeenCalled()
  })

  it('throws ValidationError on the projectId field when projectId is missing', async () => {
    await expect(
      PortalService.authenticate({ token: 'tok', projectId: undefined })
    ).rejects.toThrow(ValidationError)
    expect(mockClientFindFirst).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedError when no client matches the token', async () => {
    mockClientFindFirst.mockResolvedValueOnce(null)
    await expect(
      PortalService.authenticate({ token: 'bad', projectId: 'p1' })
    ).rejects.toThrow(UnauthorizedError)
    expect(mockClientFindFirst).toHaveBeenCalledTimes(1)
    expect(mockClientUpdate).not.toHaveBeenCalled()
  })

  it('throws ForbiddenError when the project does not belong to the client', async () => {
    // Token is valid for c1, but the projects[] filter returns empty
    // because 'wrong-proj' is not theirs.
    mockClientFindFirst.mockResolvedValueOnce({
      id: 'c1',
      name: 'John',
      company: 'Doe Architects',
      portalAccessEnabled: true,
      projects: [],
    })
    await expect(
      PortalService.authenticate({ token: 'good', projectId: 'wrong-proj' })
    ).rejects.toThrow(ForbiddenError)
    expect(mockClientUpdate).not.toHaveBeenCalled()
  })

  it('returns session info and updates portalLastLogin on success', async () => {
    mockClientFindFirst.mockResolvedValueOnce({
      id: 'c1',
      name: 'John Doe',
      company: 'Doe Architects',
      portalAccessEnabled: true,
      projects: [{ id: 'p1' }],
    })
    mockClientUpdate.mockResolvedValueOnce({
      id: 'c1',
      portalLastLogin: new Date(),
    })

    const session = await PortalService.authenticate({
      token: 'good',
      projectId: 'p1',
    })

    expect(session).toEqual({
      clientId: 'c1',
      clientName: 'John Doe',
      company: 'Doe Architects',
      projectId: 'p1',
    })
    expect(mockClientUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { portalLastLogin: expect.any(Date) },
    })
  })
})

// ─── getProjectForClient() ───────────────────────────────────────────────

describe('PortalService.getProjectForClient', () => {
  it('throws UnauthorizedError when token is missing', async () => {
    await expect(
      PortalService.getProjectForClient({ token: undefined, projectId: 'p1' })
    ).rejects.toThrow(UnauthorizedError)
    expect(mockClientFindFirst).not.toHaveBeenCalled()
  })

  it('throws UnauthorizedError when no client matches the token', async () => {
    mockClientFindFirst.mockResolvedValueOnce(null)
    await expect(
      PortalService.getProjectForClient({ token: 'bad', projectId: 'p1' })
    ).rejects.toThrow(UnauthorizedError)
    expect(mockProjectFindFirst).not.toHaveBeenCalled()
  })

  it('throws NotFoundError when the project is not owned by the client', async () => {
    // Token -> c1, but projectId 'missing' returns null from the
    // ownership-filtered project query.
    mockClientFindFirst.mockResolvedValueOnce({ id: 'c1' })
    mockProjectFindFirst.mockResolvedValueOnce(null)
    await expect(
      PortalService.getProjectForClient({ token: 'good', projectId: 'missing' })
    ).rejects.toThrow(NotFoundError)
  })

  it('returns sanitized project data and filters the project query by clientId', async () => {
    mockClientFindFirst.mockResolvedValueOnce({ id: 'c1' })
    const fakeProject = {
      id: 'p1',
      code: 'PRJ-001',
      name: 'Casa Lopez',
      type: 'RESIDENTIAL',
      currentPhase: 'DD',
      overallProgressPercent: 45,
      status: 'ON_TRACK',
      startDate: new Date('2026-01-01'),
      estimatedEndDate: new Date('2026-12-31'),
      phases: [],
      milestones: [],
      invoices: [],
      documents: [],
    }
    mockProjectFindFirst.mockResolvedValueOnce(fakeProject)

    const result = await PortalService.getProjectForClient({
      token: 'good',
      projectId: 'p1',
    })

    // CRITICAL: ownership must be enforced in the project query,
    // not just in a JS check after the fact.
    expect(mockProjectFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1', clientId: 'c1' },
      })
    )

    // The service exposes a curated subset — no internal fields leak.
    expect(result.project).toEqual({
      id: 'p1',
      code: 'PRJ-001',
      name: 'Casa Lopez',
      type: 'RESIDENTIAL',
      currentPhase: 'DD',
      overallProgressPercent: 45,
      status: 'ON_TRACK',
      startDate: new Date('2026-01-01'),
      estimatedEndDate: new Date('2026-12-31'),
    })
    expect(result.phases).toBe(fakeProject.phases)
    expect(result.milestones).toBe(fakeProject.milestones)
    expect(result.invoices).toBe(fakeProject.invoices)
    expect(result.documents).toBe(fakeProject.documents)
  })
})
