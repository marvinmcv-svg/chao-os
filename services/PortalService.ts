/**
 * PortalService — client-facing portal access (no employee auth).
 *
 * Clients of the architecture firm use a portal token (NOT NextAuth
 * credentials) to view their project status, milestones, invoices, and
 * approved documents. The raw token is shared in a URL; the SHA-256
 * hash is stored on `Client.portalTokenHash`. See `lib/portal-auth.ts`.
 *
 * Two routes consume this service:
 *   - POST /api/portal/auth  -> authenticate()
 *   - GET  /api/portal/project/:id?token=...  -> getProjectForClient()
 *
 * Error model: throws DomainError subclasses. `withApiHandler()` maps
 * them to HTTP status codes (401/403/404/400). We throw rather than
 * return Result<T, E> because every caller uses withApiHandler, which
 * already catches thrown errors.
 */
import { prisma } from '@/lib/prisma'
import { hashPortalToken } from '@/lib/portal-auth'
import { UnauthorizedError } from '@/lib/require-auth'
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
} from '@/lib/result'
import type { Milestone, ProjectPhase } from '@prisma/client'
import { getPresignedViewUrl } from '@/lib/s3'
import {
  ChangeOrderService,
  PORTAL_VISIBLE_STATUSES,
  changeOrderPortalSelect,
  summarize,
  type PortalChangeOrder,
} from './ChangeOrderService'

/** Session info returned by authenticate() and used by the portal UI. */
export type PortalAuthSession = {
  clientId: string
  clientName: string
  company: string
  projectId: string
}

/**
 * Sanitized project data returned by getProjectForClient().
 * The `project` field is a curated subset; the relations are returned
 * with portal-safe filters already applied (no draft/rejected items,
 * no PII beyond what the client provided).
 */
export type PortalProjectData = {
  project: {
    id: string
    code: string
    name: string
    type: string
    currentPhase: string
    overallProgressPercent: number
    status: string
    startDate: Date
    estimatedEndDate: Date
  }
  phases: Array<{
    id: string
    phase: ProjectPhase
    label: string
    budgetUSD: number
    progressPercent: number
    status: string
    startDate: Date | null
    endDate: Date | null
  }>
  // Milestone has no `select` in the query, so we return the full Prisma
  // payload. Routes that need a leaner shape can pick what they expose.
  milestones: Milestone[]
  invoices: Array<{
    id: string
    number: string
    amountUSD: number
    status: string
    issuedAt: Date
    dueDate: Date
  }>
  /** Approved documents only. The storage key never leaves the server:
   *  downloads go through /api/portal/project/:id/documents/:docId. */
  documents: Array<{
    id: string
    filename: string
    mimeType: string | null
    sizeBytes: number | null
    uploadedAt: Date
    phase: ProjectPhase | null
  }>
  /** Change orders awaiting or past client decision (never drafts). */
  changeOrders: PortalChangeOrder[]
  contract: {
    originalFeeUSD: number
    approvedUSD: number
    pendingUSD: number
    currentFeeUSD: number
    pendingCount: number
  }
}

/** Resolve the client behind a portal token (Spanish messages: client-facing). */
async function clientForToken(token?: string) {
  if (!token) throw new UnauthorizedError('Token de acceso requerido')
  const client = await prisma.client.findFirst({
    where: { portalTokenHash: hashPortalToken(token), portalAccessEnabled: true },
    select: { id: true, name: true },
  })
  if (!client) throw new UnauthorizedError('Enlace de acceso inválido o desactivado')
  return client
}

export const PortalService = {
  /**
   * Authenticate a client via portal token and verify they have access
   * to the requested project.
   *
   * Side effect: bumps `Client.portalLastLogin` to now() on success.
   *
   * @throws ValidationError  when token or projectId is missing
   * @throws UnauthorizedError  when no client matches the token
   * @throws ForbiddenError  when the project does not belong to the client
   */
  async authenticate(args: {
    token?: string
    projectId?: string
  }): Promise<PortalAuthSession> {
    const { token, projectId } = args

    if (!token || !projectId) {
      throw new ValidationError(
        'Token y proyecto requeridos',
        !token ? 'token' : 'projectId'
      )
    }

    const tokenHash = hashPortalToken(token)

    // Find the client whose stored hash matches AND has portal access enabled.
    // We include a single-row `projects` filter to check ownership in one query.
    const client = await prisma.client.findFirst({
      where: { portalTokenHash: tokenHash, portalAccessEnabled: true },
      include: {
        projects: { where: { id: projectId }, select: { id: true } },
      },
    })

    if (!client) {
      throw new UnauthorizedError('Enlace de acceso inválido o desactivado')
    }

    if (client.projects.length === 0) {
      // Token is valid for this client, but the projectId is not theirs.
      throw new ForbiddenError('Este proyecto no pertenece a este cliente')
    }

    // Bump last login (best-effort, doesn't need to block the response).
    await prisma.client.update({
      where: { id: client.id },
      data: { portalLastLogin: new Date() },
    })

    return {
      clientId: client.id,
      clientName: client.name,
      company: client.company,
      projectId,
    }
  },

  /**
   * Get the project data visible to a client via portal token.
   *
   * Returns a sanitized subset of the project (no internal team info,
   * no draft/rejected items, no PII beyond what the client already
   * provided). The project query enforces ownership by filtering on
   * `clientId` from the token lookup — a client cannot see another
   * client's project even if they guess the projectId.
   *
   * @throws UnauthorizedError  when token is missing or invalid
   * @throws NotFoundError  when the project does not exist OR is not owned
   *                        by this client (we don't distinguish to avoid
   *                        leaking which projectIds exist)
   */
  async getProjectForClient(args: {
    token?: string
    projectId: string
  }): Promise<PortalProjectData> {
    const { token, projectId } = args
    const client = await clientForToken(token)

    const project = await prisma.project.findFirst({
      where: { id: projectId, clientId: client.id },
      include: {
        // Curated: never expose internal cost (spentUSD) to the client.
        phases: {
          orderBy: { phase: 'asc' },
          select: { id: true, phase: true, label: true, budgetUSD: true, progressPercent: true, status: true, startDate: true, endDate: true },
        },
        milestones: {
          where: { status: { not: 'rejected' } },
          orderBy: { dueDate: 'asc' },
        },
        invoices: {
          where: { status: { in: ['SENT', 'PENDING', 'OVERDUE', 'PAID'] } },
          orderBy: { issuedAt: 'desc' },
          select: {
            id: true,
            number: true,
            amountUSD: true,
            status: true,
            issuedAt: true,
            dueDate: true,
          },
        },
        documents: {
          where: { status: 'APPROVED' },
          orderBy: { uploadedAt: 'desc' },
          select: {
            id: true,
            filename: true,
            mimeType: true,
            sizeBytes: true,
            uploadedAt: true,
            phase: true,
          },
        },
        changeOrders: {
          where: { status: { in: [...PORTAL_VISIBLE_STATUSES] } },
          orderBy: { sequence: 'desc' },
          select: changeOrderPortalSelect,
        },
      },
    })

    if (!project) {
      throw new NotFoundError('Proyecto', projectId)
    }

    const { pendingCount, originalFeeUSD, approvedUSD, pendingUSD, currentFeeUSD } = summarize(
      project,
      project.changeOrders
    )

    return {
      project: {
        id: project.id,
        code: project.code,
        name: project.name,
        type: project.type,
        currentPhase: project.currentPhase,
        overallProgressPercent: project.overallProgressPercent,
        status: project.status,
        startDate: project.startDate,
        estimatedEndDate: project.estimatedEndDate,
      },
      phases: project.phases,
      milestones: project.milestones,
      invoices: project.invoices,
      documents: project.documents,
      changeOrders: project.changeOrders,
      contract: { originalFeeUSD, approvedUSD, pendingUSD, currentFeeUSD, pendingCount },
    }
  },

  /**
   * Client approves or rejects a change order from the portal. Ownership is
   * enforced through the token's client → project → change order chain.
   *
   * @throws UnauthorizedError  bad / disabled token
   * @throws NotFoundError      change order not visible to this client
   * @throws InvalidStateError  already decided
   */
  /**
   * Resolve a short-lived (5 min) signed download URL for one APPROVED
   * document of the client's project, and count the download.
   * Ownership chain: token → client → project → approved document. Any
   * miss is a 404 (no hint about which documents exist).
   *
   * @throws UnauthorizedError        bad / disabled token
   * @throws NotFoundError            not this client's, or not approved
   * @throws StorageUnavailableError  S3 not configured (503)
   */
  async getDocumentDownload(args: { token?: string; projectId: string; documentId: string }) {
    const client = await clientForToken(args.token)
    const doc = await prisma.document.findFirst({
      where: { id: args.documentId, projectId: args.projectId, status: 'APPROVED', project: { clientId: client.id } },
      select: { id: true, url: true, filename: true, mimeType: true },
    })
    if (!doc) throw new NotFoundError('Documento', args.documentId)
    // PDFs and images open in the browser; CAD and other files download.
    const inline = !!doc.mimeType && (doc.mimeType === 'application/pdf' || doc.mimeType.startsWith('image/'))
    const url = await getPresignedViewUrl(doc.url, doc.filename, doc.mimeType ?? 'application/octet-stream', {
      disposition: inline ? 'inline' : 'attachment',
    })
    await prisma.document.update({
      where: { id: doc.id },
      data: { portalDownloadCount: { increment: 1 }, portalLastDownloadAt: new Date() },
    })
    return { url }
  },

  async decideChangeOrder(args: {
    token: string
    projectId: string
    changeOrderId: string
    decision: 'approve' | 'reject'
    name: string
    note: string
  }) {
    const client = await clientForToken(args.token)
    return ChangeOrderService.decideFromPortal({ ...args, clientId: client.id })
  },
}
