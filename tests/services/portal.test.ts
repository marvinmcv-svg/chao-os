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
const mockDocumentFindFirst = vi.fn()
const mockDocumentUpdate = vi.fn()
const mockPresign = vi.fn()

vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: {
      findFirst: (...args: unknown[]) => mockClientFindFirst(...args),
      update: (...args: unknown[]) => mockClientUpdate(...args),
    },
    project: {
      findFirst: (...args: unknown[]) => mockProjectFindFirst(...args),
    },
    document: {
      findFirst: (...args: unknown[]) => mockDocumentFindFirst(...args),
      update: (...args: unknown[]) => mockDocumentUpdate(...args),
    },
  },
}))

vi.mock('@/lib/s3', async () => {
  const { DomainError } = await import('@/lib/result')
  class StorageUnavailableError extends DomainError {
    constructor() {
      super('STORAGE_UNAVAILABLE', 'no storage')
    }
  }
  return { getPresignedViewUrl: (...args: unknown[]) => mockPresign(...args), StorageUnavailableError }
})

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
      totalBudgetUSD: 43500,
      changeOrders: [
        { id: 'co1', status: 'APPROVED', feeUSD: 3500, scheduleImpactDays: 0 },
        { id: 'co2', status: 'SENT', feeUSD: 900, scheduleImpactDays: 0 },
      ],
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

    // Change orders: drafts/voided never reach the client, and the
    // contract summary separates the original fee from approved changes.
    const query = mockProjectFindFirst.mock.calls[0][0]
    expect(query.include.changeOrders.where).toEqual({ status: { in: ['SENT', 'APPROVED', 'REJECTED'] } })
    expect(query.include.changeOrders.select).not.toHaveProperty('hours')
    expect(query.include.phases.select).not.toHaveProperty('spentUSD')
    expect(result.contract).toEqual({ originalFeeUSD: 40000, approvedUSD: 3500, pendingUSD: 900, currentFeeUSD: 43500, pendingCount: 1 })
    // Internal total is not exposed as a project field
    expect(result.project).not.toHaveProperty('totalBudgetUSD')
  })
})

describe('PortalService.decideChangeOrder', () => {
  it('throws UnauthorizedError for a bad token before touching change orders', async () => {
    mockClientFindFirst.mockResolvedValueOnce(null)
    await expect(
      PortalService.decideChangeOrder({ token: 'bad', projectId: 'p1', changeOrderId: 'co1', decision: 'approve', name: 'Ana', note: '' })
    ).rejects.toThrow(UnauthorizedError)
  })
})

describe('PortalService.getDocumentDownload', () => {
  const DOC = { id: 'd1', url: 'projects/p1/documents/abc-plano.pdf', filename: 'Planta N8 (DD).pdf', mimeType: 'application/pdf' }

  it('resolves only APPROVED documents of the token client\'s project and counts the download', async () => {
    mockClientFindFirst.mockResolvedValueOnce({ id: 'c1', name: 'Ana' })
    mockDocumentFindFirst.mockResolvedValueOnce(DOC)
    mockPresign.mockResolvedValueOnce('https://bucket.s3/signed?X-Amz-Expires=300')
    const r = await PortalService.getDocumentDownload({ token: 'good', projectId: 'p1', documentId: 'd1' })
    expect(r).toEqual({ url: 'https://bucket.s3/signed?X-Amz-Expires=300' })
    // Ownership is enforced in the query: token client → project → approved doc
    expect(mockDocumentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'd1', projectId: 'p1', status: 'APPROVED', project: { clientId: 'c1' } } })
    )
    expect(mockPresign).toHaveBeenCalledWith(DOC.url, DOC.filename, 'application/pdf', { disposition: 'inline' })
    expect(mockDocumentUpdate).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { portalDownloadCount: { increment: 1 }, portalLastDownloadAt: expect.any(Date) },
    })
  })

  it('CAD and other files download as attachments', async () => {
    mockClientFindFirst.mockResolvedValueOnce({ id: 'c1', name: 'Ana' })
    mockDocumentFindFirst.mockResolvedValueOnce({ ...DOC, filename: 'Fachada.dwg', mimeType: 'application/octet-stream' })
    mockPresign.mockResolvedValueOnce('https://signed')
    await PortalService.getDocumentDownload({ token: 'good', projectId: 'p1', documentId: 'd1' })
    expect(mockPresign.mock.calls[0][3]).toEqual({ disposition: 'attachment' })
  })

  it('404 for documents that are not approved or not this client\'s (no counter bump)', async () => {
    mockClientFindFirst.mockResolvedValueOnce({ id: 'c1', name: 'Ana' })
    mockDocumentFindFirst.mockResolvedValueOnce(null)
    await expect(PortalService.getDocumentDownload({ token: 'good', projectId: 'p1', documentId: 'other' })).rejects.toThrow(NotFoundError)
    expect(mockPresign).not.toHaveBeenCalled()
    expect(mockDocumentUpdate).not.toHaveBeenCalled()
  })

  it('401 for a bad or disabled token before any document lookup', async () => {
    mockClientFindFirst.mockResolvedValueOnce(null)
    await expect(PortalService.getDocumentDownload({ token: 'bad', projectId: 'p1', documentId: 'd1' })).rejects.toThrow(UnauthorizedError)
    await expect(PortalService.getDocumentDownload({ token: undefined, projectId: 'p1', documentId: 'd1' })).rejects.toThrow(UnauthorizedError)
    expect(mockDocumentFindFirst).not.toHaveBeenCalled()
  })

  it('storage not configured surfaces as STORAGE_UNAVAILABLE and does not count', async () => {
    const { StorageUnavailableError } = await import('@/lib/s3')
    mockClientFindFirst.mockResolvedValueOnce({ id: 'c1', name: 'Ana' })
    mockDocumentFindFirst.mockResolvedValueOnce(DOC)
    mockPresign.mockRejectedValueOnce(new StorageUnavailableError())
    await expect(PortalService.getDocumentDownload({ token: 'good', projectId: 'p1', documentId: 'd1' })).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' })
    expect(mockDocumentUpdate).not.toHaveBeenCalled()
  })

  it('the project payload selects documents without the storage key', async () => {
    mockClientFindFirst.mockResolvedValueOnce({ id: 'c1' })
    mockProjectFindFirst.mockResolvedValueOnce(null)
    await expect(PortalService.getProjectForClient({ token: 'good', projectId: 'p1' })).rejects.toThrow(NotFoundError)
    const q = mockProjectFindFirst.mock.calls[0][0]
    expect(q.include.documents.where).toEqual({ status: 'APPROVED' })
    expect(q.include.documents.select).not.toHaveProperty('url')
    expect(q.include.documents.select).toMatchObject({ mimeType: true, sizeBytes: true })
  })
})

