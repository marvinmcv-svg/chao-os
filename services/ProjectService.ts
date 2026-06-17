/**
 * ProjectService — project CRUD + team + phase transitions.
 *
 * All routes under /api/projects/* eventually delegate here. The service:
 *   - Enforces the ADMIN/PRINCIPAL-only rule for `delete()` (lives in
 *     service, not route, so any caller — REST, internal job, future
 *     GraphQL — gets the same check).
 *   - Auto-creates 4 default phases (SD/DD/CD/CA) on `create()` in a
 *     single transaction so a project is never partially created.
 *   - Writes audit log entries for every mutation.
 *   - Fires the client phase-update email as fire-and-forget on
 *     `updatePhase()` (same semantics as the original route).
 *
 * Permission model:
 *   - Every method takes `currentUser: AuthUser` for audit + checks.
 *   - `delete()` throws ForbiddenError for non-ADMIN/PRINCIPAL roles.
 *   - All other methods are available to any authenticated user,
 *     matching the current route behavior.
 *
 * Transactions:
 *   - `create()` uses prisma.$transaction because project + 4 phases
 *     must be atomic.
 *   - `update()` does NOT use a transaction because the audit log is
 *     an additive side effect (the project update is the source of
 *     truth; a missing audit log is recoverable, a lost update is not).
 */
import type { z } from 'zod'
import type {
  CreateProjectSchema,
  UpdateProjectSchema,
} from '@/lib/validations'
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'
import { sendProjectUpdateEmail } from '@/lib/email'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/lib/result'

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>

const VALID_PHASES = ['SD', 'DD', 'CD', 'CA'] as const
const PHASE_LABELS: Record<string, string> = {
  SD: 'Schematic Design',
  DD: 'Design Development',
  CD: 'Construction Documents',
  CA: 'Construction Administration',
}

// Roles allowed to delete projects (must match the check in the original route)
const DELETE_ROLES = new Set(['ADMIN', 'PRINCIPAL'])

export const ProjectService = {
  // ─── list ───────────────────────────────────────────────────────────────

  /**
   * Paginated list of projects with optional status + clientId filters.
   * Returns the full Project row + counts of tasks and invoices, but
   * does NOT include heavy relations (full client, PM, milestones, etc.)
   * — use `getById` for the detail view.
   */
  async list(args: {
    currentUser: AuthUser
    status?: string
    clientId?: string
    page?: number
    limit?: number
  }) {
    const { currentUser: _currentUser, status, clientId, page = 1, limit = 50 } = args

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (clientId) where.clientId = clientId

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, company: true } },
          projectManager: { select: { id: true, name: true, avatarInitials: true } },
          phases: { orderBy: { phase: 'asc' } },
          _count: { select: { tasks: true, invoices: true } },
        },
        orderBy: { code: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.project.count({ where }),
    ])

    return {
      projects,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  },

  // ─── create ─────────────────────────────────────────────────────────────

  /**
   * Create a project + 4 default phases atomically.
   * The phase budgets split the total budget as 15/25/40/20% (SD/DD/CD/CA).
   * Throws ConflictError if a project with the same code already exists.
   */
  async create(args: { currentUser: AuthUser; data: CreateProjectInput }) {
    const { currentUser, data } = args

    // Code uniqueness check up front (the unique index would also catch it,
    // but a friendly 409 with a real message is better than a P2002 error).
    const existing = await prisma.project.findUnique({ where: { code: data.code } })
    if (existing) {
      throw new ConflictError(`Project code "${data.code}" already exists`)
    }

    const project = await prisma.project.create({
      data: {
        code: data.code,
        name: data.name,
        clientId: data.clientId,
        projectManagerId: data.projectManagerId,
        type: data.type,
        contractType: data.contractType,
        currentPhase: data.currentPhase,
        totalBudgetUSD: data.totalBudgetUSD,
        startDate: new Date(data.startDate),
        estimatedEndDate: new Date(data.estimatedEndDate),
        ...(data.actualEndDate && { actualEndDate: new Date(data.actualEndDate) }),
        phases: {
          create: [
            {
              phase: 'SD',
              label: 'Schematic Design',
              budgetUSD: data.totalBudgetUSD * 0.15,
              status: 'NOT_STARTED',
            },
            {
              phase: 'DD',
              label: 'Design Development',
              budgetUSD: data.totalBudgetUSD * 0.25,
              status: 'NOT_STARTED',
            },
            {
              phase: 'CD',
              label: 'Construction Documents',
              budgetUSD: data.totalBudgetUSD * 0.4,
              status: 'NOT_STARTED',
            },
            {
              phase: 'CA',
              label: 'Construction Administration',
              budgetUSD: data.totalBudgetUSD * 0.2,
              status: 'NOT_STARTED',
            },
          ],
        },
      },
      include: {
        client: true,
        projectManager: true,
        phases: true,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        action: 'CREATE',
        entityType: 'Project',
        entityId: project.id,
        payload: { code: project.code, name: project.name },
      },
    })

    return project
  },

  // ─── getById ────────────────────────────────────────────────────────────

  /**
   * Get one project with the full relation graph used by the detail view.
   * Throws NotFoundError if no project has that id.
   */
  async getById(args: { currentUser: AuthUser; id: string }) {
    const { currentUser: _currentUser, id } = args

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        projectManager: {
          select: { id: true, name: true, email: true, avatarInitials: true, role: true },
        },
        phases: { orderBy: { phase: 'asc' } },
        milestones: { orderBy: { dueDate: 'asc' } },
        teamMembers: {
          include: {
            user: {
              select: { id: true, name: true, avatarInitials: true, role: true },
            },
          },
        },
        tasks: {
          where: { status: { not: 'DONE' } },
          orderBy: { dueDate: 'asc' },
          take: 10,
          include: {
            assignedTo: { select: { id: true, name: true, avatarInitials: true } },
          },
        },
        invoices: { orderBy: { issuedAt: 'desc' } },
        expenses: { orderBy: { incurredAt: 'desc' } },
        _count: { select: { tasks: true, documents: true } },
      },
    })

    if (!project) {
      throw new NotFoundError('Project', id)
    }

    return project
  },

  // ─── update ─────────────────────────────────────────────────────────────

  /**
   * Update a project. Date strings are parsed to Date; other fields pass
   * through as-is. Throws NotFoundError if the id does not exist.
   *
   * Audit log captures the before/after for forensic reconstruction.
   */
  async update(args: {
    currentUser: AuthUser
    id: string
    data: UpdateProjectInput
  }) {
    const { currentUser, id, data } = args

    // Capture before-state for audit log. If not found, fail fast.
    const existing = await prisma.project.findUnique({ where: { id } })
    if (!existing) {
      throw new NotFoundError('Project', id)
    }

    const updateData: Record<string, unknown> = { ...data }
    if (data.startDate) updateData.startDate = new Date(data.startDate)
    if (data.estimatedEndDate) updateData.estimatedEndDate = new Date(data.estimatedEndDate)
    if (data.actualEndDate) updateData.actualEndDate = new Date(data.actualEndDate)

    const project = await prisma.project.update({
      where: { id },
      data: updateData,
      include: { client: true, projectManager: true, phases: true },
    })

    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE',
        entityType: 'Project',
        entityId: project.id,
        payload: {
          fields: Object.keys(data),
          before: existing,
          after: project,
        },
      },
    })

    return project
  },

  // ─── delete ─────────────────────────────────────────────────────────────

  /**
   * Delete a project. Only ADMIN or PRINCIPAL may delete.
   * Throws NotFoundError if id does not exist; ForbiddenError if the
   * caller lacks permission.
   */
  async delete(args: { currentUser: AuthUser; id: string }) {
    const { currentUser, id } = args

    if (!DELETE_ROLES.has(currentUser.role)) {
      throw new ForbiddenError(
        `Only ADMIN or PRINCIPAL may delete projects (your role: ${currentUser.role})`,
      )
    }

    const existing = await prisma.project.findUnique({ where: { id } })
    if (!existing) {
      throw new NotFoundError('Project', id)
    }

    await prisma.project.delete({ where: { id } })

    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        action: 'DELETE',
        entityType: 'Project',
        entityId: id,
        payload: { code: existing.code, name: existing.name },
      },
    })

    return { id }
  },

  // ─── listTeamMembers ────────────────────────────────────────────────────

  /**
   * List all ProjectMembers for a project, joined with the user details
   * used by the team-management UI.
   */
  async listTeamMembers(args: { currentUser: AuthUser; projectId: string }) {
    const { currentUser: _currentUser, projectId } = args

    return prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarInitials: true, role: true },
        },
      },
    })
  },

  // ─── addTeamMember ──────────────────────────────────────────────────────

  /**
   * Add a user to a project's team.
   * Throws ConflictError if the user is already a member of this project.
   */
  async addTeamMember(args: {
    currentUser: AuthUser
    projectId: string
    userId: string
    role: string
  }) {
    const { currentUser, projectId, userId, role } = args

    if (!userId || !role) {
      throw new ValidationError(
        'userId and role are required',
        !userId ? 'userId' : 'role',
      )
    }

    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    })
    if (existing) {
      throw new ConflictError('User is already a member of this project')
    }

    const member = await prisma.projectMember.create({
      data: { projectId, userId, role },
      include: {
        user: { select: { id: true, name: true, avatarInitials: true, role: true } },
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        action: 'CREATE',
        entityType: 'ProjectMember',
        entityId: member.id,
        payload: { projectId, addedUserId: userId, role },
      },
    })

    return member
  },

  // ─── updatePhase ────────────────────────────────────────────────────────

  /**
   * Update the project's current phase. Validates against the 4 canonical
   * phases (SD/DD/CD/CA) and fires a client notification email.
   * Throws ValidationError for an invalid phase, NotFoundError if the
   * project does not exist.
   */
  async updatePhase(args: {
    currentUser: AuthUser
    projectId: string
    phase: string
  }) {
    const { currentUser, projectId, phase } = args

    if (!VALID_PHASES.includes(phase as (typeof VALID_PHASES)[number])) {
      throw new ValidationError(
        `Invalid phase "${phase}". Must be one of: ${VALID_PHASES.join(', ')}`,
      )
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        client: { select: { name: true, email: true } },
        projectManager: { select: { name: true } },
      },
    })
    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { currentPhase: phase as (typeof VALID_PHASES)[number] },
      include: { phases: { orderBy: { phase: 'asc' } } },
    })

    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE',
        entityType: 'Project',
        entityId: projectId,
        payload: {
          field: 'currentPhase',
          from: project.currentPhase,
          to: phase,
        },
      },
    })

    // Fire-and-forget email; do not block the response on it.
    void sendProjectUpdateEmail({
      name: project.name,
      clientName: project.client.name,
      clientEmail: project.client.email,
      newPhase: phase,
      newPhaseLabel: PHASE_LABELS[phase] ?? phase,
    })

    return updated
  },
}
