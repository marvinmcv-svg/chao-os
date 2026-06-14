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
    projectId: string
    phase: ProjectPhase
    label: string
    budgetUSD: number
    spentUSD: number
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
  documents: Array<{
    id: string
    filename: string
    url: string
    uploadedAt: Date
    phase: ProjectPhase | null
  }>
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
        'Token and projectId are required',
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
      throw new UnauthorizedError('Invalid token')
    }

    if (client.projects.length === 0) {
      // Token is valid for this client, but the projectId is not theirs.
      throw new ForbiddenError('This project does not belong to this client')
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

    if (!token) {
      throw new UnauthorizedError('Token required')
    }

    const tokenHash = hashPortalToken(token)

    const client = await prisma.client.findFirst({
      where: { portalTokenHash: tokenHash, portalAccessEnabled: true },
      select: { id: true },
    })

    if (!client) {
      throw new UnauthorizedError('Invalid token')
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, clientId: client.id },
      include: {
        phases: { orderBy: { phase: 'asc' } },
        milestones: {
          where: { status: { not: 'rejected' } },
          orderBy: { dueDate: 'asc' },
        },
        invoices: {
          where: { status: { in: ['SENT', 'PENDING', 'PAID'] } },
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
            url: true,
            uploadedAt: true,
            phase: true,
          },
        },
      },
    })

    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

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
    }
  },
}
