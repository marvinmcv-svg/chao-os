/**
 * ChangeOrderService — change orders & additional services (roadmap item 3).
 *
 * Lifecycle:
 *   DRAFT ──send──▶ SENT ──approve (portal or recorded)──▶ APPROVED ──invoice──▶ (linked invoice)
 *     ▲               │──reject──▶ REJECTED
 *     └──withdraw─────┘
 *   DRAFT / SENT ──void──▶ VOID
 *
 * Approval is what changes the contract: the project fee grows (or shrinks,
 * for a credit) by `feeUSD`, the fee of the affected phase follows, and the
 * estimated end date moves by `scheduleImpactDays`. Approval runs as a
 * conditional update on `status = SENT`, so a client clicking in the portal
 * and a staff member recording a signed copy can never both apply it.
 *
 * Permissions: PRINCIPAL / ADMIN / ARCHITECT_SENIOR and the project's PM
 * manage change orders. Everyone can read them. The client sees SENT,
 * APPROVED and REJECTED ones in the portal (never drafts or voided ones).
 */
import { z } from 'zod'
import type { ChangeOrder, Prisma, ProjectPhase } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'
import { ForbiddenError, InvalidStateError, NotFoundError, ValidationError } from '@/lib/result'
import { InvoiceService } from './InvoiceService'
import { NotificationService } from './NotificationService'

export const CHANGE_ORDER_MANAGER_ROLES = new Set(['PRINCIPAL', 'ADMIN', 'ARCHITECT_SENIOR'])

const PHASES = ['SD', 'DD', 'CD', 'CA'] as const

export const changeOrderInputSchema = z.object({
  kind: z.enum(['CHANGE_ORDER', 'ADDITIONAL_SERVICE']),
  title: z.string().trim().min(3, 'Título demasiado corto').max(200),
  description: z.string().max(5000).default(''),
  reason: z.string().max(2000).default(''),
  phase: z.enum(PHASES).nullable().default(null),
  feeUSD: z
    .number()
    .finite()
    .refine((v) => v !== 0, 'El honorario no puede ser cero')
    .refine((v) => Math.abs(v) <= 10_000_000, 'Monto fuera de rango'),
  hours: z.number().min(0).max(100_000).default(0),
  scheduleImpactDays: z.number().int().min(-365).max(730).default(0),
})
export const changeOrderUpdateSchema = changeOrderInputSchema.partial()
export type ChangeOrderInput = z.infer<typeof changeOrderInputSchema>

export const changeOrderActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send') }),
  z.object({ action: z.literal('withdraw') }),
  z.object({ action: z.literal('void') }),
  z.object({ action: z.literal('invoice') }),
  z.object({
    action: z.enum(['approve', 'reject']),
    /** Who signed on the client side (recorded approval, e.g. a signed PDF) */
    signedBy: z.string().trim().min(2, 'Indica quién firmó por el cliente').max(120),
    note: z.string().max(2000).default(''),
  }),
])
export type ChangeOrderAction = z.infer<typeof changeOrderActionSchema>

export const portalDecisionSchema = z.object({
  token: z.string().min(1),
  decision: z.enum(['approve', 'reject']),
  name: z.string().trim().min(2, 'Escribe tu nombre completo').max(120),
  note: z.string().max(2000).default(''),
})

/** Fields the client is allowed to see. */
const PORTAL_SELECT = {
  id: true,
  number: true,
  kind: true,
  title: true,
  description: true,
  reason: true,
  phase: true,
  feeUSD: true,
  scheduleImpactDays: true,
  status: true,
  sentAt: true,
  decidedAt: true,
  decidedByName: true,
  decisionNote: true,
} satisfies Prisma.ChangeOrderSelect
export type PortalChangeOrder = Prisma.ChangeOrderGetPayload<{ select: typeof PORTAL_SELECT }>
export const PORTAL_VISIBLE_STATUSES = ['SENT', 'APPROVED', 'REJECTED'] as const
export const changeOrderPortalSelect = PORTAL_SELECT

type ProjectForAuth = { id: string; projectManagerId: string }

function canManage(user: AuthUser, project: ProjectForAuth) {
  return CHANGE_ORDER_MANAGER_ROLES.has(user.role) || project.projectManagerId === user.id
}

function assertManager(user: AuthUser, project: ProjectForAuth) {
  if (!canManage(user, project)) {
    throw new ForbiddenError('Solo dirección, arquitectos senior y el director del proyecto gestionan órdenes de cambio')
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Contract summary: original fee, approved changes, pending exposure. */
export function summarize(project: { totalBudgetUSD: number }, rows: Pick<ChangeOrder, 'status' | 'feeUSD' | 'scheduleImpactDays'>[]) {
  const sum = (s: string) => round2(rows.filter((r) => r.status === s).reduce((a, r) => a + r.feeUSD, 0))
  const approvedUSD = sum('APPROVED')
  const pendingUSD = sum('SENT')
  const currentFeeUSD = round2(project.totalBudgetUSD)
  return {
    originalFeeUSD: round2(currentFeeUSD - approvedUSD),
    approvedUSD,
    pendingUSD,
    currentFeeUSD,
    approvedDays: rows.filter((r) => r.status === 'APPROVED').reduce((a, r) => a + r.scheduleImpactDays, 0),
    pendingCount: rows.filter((r) => r.status === 'SENT').length,
  }
}

/**
 * Apply an approved change to the contract, inside a transaction.
 * Returns false if the change order was no longer SENT (someone else
 * decided it first); nothing is written in that case.
 */
async function applyDecision(
  tx: Prisma.TransactionClient,
  co: ChangeOrder,
  decision: 'approve' | 'reject',
  meta: { name: string; note: string; channel: 'PORTAL' | 'INTERNAL' }
): Promise<boolean> {
  const now = new Date()
  const claimed = await tx.changeOrder.updateMany({
    where: { id: co.id, status: 'SENT' },
    data: {
      status: decision === 'approve' ? 'APPROVED' : 'REJECTED',
      decidedAt: now,
      decidedByName: meta.name,
      decisionNote: meta.note,
      decisionChannel: meta.channel,
    },
  })
  if (claimed.count === 0) return false
  if (decision === 'reject') return true

  const project = await tx.project.findUniqueOrThrow({
    where: { id: co.projectId },
    include: { phases: true },
  })
  const newTotal = round2(project.totalBudgetUSD + co.feeUSD)
  if (newTotal < 0) throw new InvalidStateError('El crédito supera el honorario del proyecto')

  const phaseKey: ProjectPhase = co.phase ?? project.currentPhase
  const phase = project.phases.find((p) => p.phase === phaseKey)
  if (phase) {
    await tx.phase.update({
      where: { id: phase.id },
      data: { budgetUSD: Math.max(0, round2(phase.budgetUSD + co.feeUSD)) },
    })
  }

  const end = new Date(project.estimatedEndDate)
  if (co.scheduleImpactDays) end.setUTCDate(end.getUTCDate() + co.scheduleImpactDays)
  await tx.project.update({
    where: { id: project.id },
    data: { totalBudgetUSD: newTotal, ...(co.scheduleImpactDays ? { estimatedEndDate: end } : {}) },
  })
  return true
}

async function notifyDecision(co: ChangeOrder & { project: { name: string; code: string; projectManagerId: string } }, decision: 'approve' | 'reject', name: string) {
  const title = decision === 'approve' ? `${co.number} aprobada` : `${co.number} rechazada`
  const message = `${name} ${decision === 'approve' ? 'aprobó' : 'rechazó'} “${co.title}” (${co.project.code} · ${co.project.name}).`
  const linkUrl = `/projects?id=${co.projectId}`
  const principals = await prisma.user.findMany({ where: { role: 'PRINCIPAL' }, select: { id: true } })
  const recipients = new Set([co.project.projectManagerId, co.createdById, ...principals.map((p) => p.id)])
  await Promise.all(
    Array.from(recipients).map((userId) =>
      NotificationService.create({ userId, type: 'CHANGE_ORDER_DECIDED', title, message, linkUrl, data: { changeOrderId: co.id } })
    )
  )
}

async function audit(userId: string | null, action: string, entityId: string, payload: Record<string, unknown>) {
  if (!userId) return
  await prisma.auditLog.create({
    data: { userId, action, entityType: 'ChangeOrder', entityId, payload: payload as Prisma.InputJsonValue },
  })
}

export const ChangeOrderService = {
  async listForProject(args: { currentUser: AuthUser; projectId: string }) {
    const project = await prisma.project.findUnique({
      where: { id: args.projectId },
      select: { id: true, projectManagerId: true, totalBudgetUSD: true },
    })
    if (!project) throw new NotFoundError('Proyecto', args.projectId)
    const items = await prisma.changeOrder.findMany({
      where: { projectId: project.id },
      orderBy: { sequence: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true } },
        invoice: { select: { id: true, number: true, status: true } },
      },
    })
    return { items, summary: summarize(project, items), canManage: canManage(args.currentUser, project) }
  },

  async create(args: { currentUser: AuthUser; projectId: string; data: ChangeOrderInput }) {
    const project = await prisma.project.findUnique({
      where: { id: args.projectId },
      select: { id: true, code: true, projectManagerId: true },
    })
    if (!project) throw new NotFoundError('Proyecto', args.projectId)
    assertManager(args.currentUser, project)

    const last = await prisma.changeOrder.findFirst({
      where: { projectId: project.id },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    })
    const sequence = (last?.sequence ?? 0) + 1
    const row = await prisma.changeOrder.create({
      data: {
        ...args.data,
        projectId: project.id,
        sequence,
        number: `OC-${project.code}-${String(sequence).padStart(2, '0')}`,
        createdById: args.currentUser.id,
      },
    })
    await audit(args.currentUser.id, 'CREATE', row.id, { number: row.number, feeUSD: row.feeUSD })
    return row
  },

  async update(args: { currentUser: AuthUser; id: string; data: Partial<ChangeOrderInput> }) {
    const co = await this.load(args.id)
    assertManager(args.currentUser, co.project)
    if (co.status !== 'DRAFT') throw new InvalidStateError('Solo se puede editar un borrador. Retíralo primero.')
    return prisma.changeOrder.update({ where: { id: co.id }, data: args.data })
  },

  async remove(args: { currentUser: AuthUser; id: string }) {
    const co = await this.load(args.id)
    assertManager(args.currentUser, co.project)
    if (co.status !== 'DRAFT') throw new InvalidStateError('Solo se pueden eliminar borradores; anula la orden en su lugar')
    await prisma.changeOrder.delete({ where: { id: co.id } })
    await audit(args.currentUser.id, 'DELETE', co.id, { number: co.number })
    return { id: co.id }
  },

  async load(id: string) {
    const co = await prisma.changeOrder.findUnique({
      where: { id },
      include: {
        project: { select: { id: true, code: true, name: true, projectManagerId: true, totalBudgetUSD: true, clientId: true } },
      },
    })
    if (!co) throw new NotFoundError('Orden de cambio', id)
    return co
  },

  async transition(args: { currentUser: AuthUser; id: string; input: ChangeOrderAction }) {
    const { currentUser, input } = args
    const co = await this.load(args.id)
    assertManager(currentUser, co.project)
    const now = new Date()

    switch (input.action) {
      case 'send': {
        if (co.status !== 'DRAFT') throw new InvalidStateError('Solo se puede enviar un borrador')
        if (co.project.totalBudgetUSD + co.feeUSD < 0) throw new InvalidStateError('El crédito supera el honorario del proyecto')
        await prisma.changeOrder.update({ where: { id: co.id }, data: { status: 'SENT', sentAt: now } })
        break
      }
      case 'withdraw': {
        if (co.status !== 'SENT') throw new InvalidStateError('Solo se puede retirar una orden enviada')
        const r = await prisma.changeOrder.updateMany({ where: { id: co.id, status: 'SENT' }, data: { status: 'DRAFT', sentAt: null } })
        if (r.count === 0) throw new InvalidStateError('El cliente ya respondió a esta orden')
        break
      }
      case 'void': {
        if (!['DRAFT', 'SENT'].includes(co.status)) throw new InvalidStateError('Solo se pueden anular órdenes sin decisión')
        const r = await prisma.changeOrder.updateMany({ where: { id: co.id, status: co.status }, data: { status: 'VOID' } })
        if (r.count === 0) throw new InvalidStateError('La orden cambió de estado; recarga')
        break
      }
      case 'approve':
      case 'reject': {
        if (co.status !== 'SENT') throw new InvalidStateError('Solo se puede decidir una orden enviada al cliente')
        const ok = await prisma.$transaction((tx) =>
          applyDecision(tx, co, input.action as 'approve' | 'reject', { name: input.signedBy, note: input.note, channel: 'INTERNAL' })
        )
        if (!ok) throw new InvalidStateError('El cliente ya respondió a esta orden')
        await notifyDecision(co, input.action, input.signedBy)
        break
      }
      case 'invoice': {
        if (co.status !== 'APPROVED') throw new InvalidStateError('Solo se facturan órdenes aprobadas')
        if (co.feeUSD <= 0) throw new InvalidStateError('Un crédito no se factura; aplícalo en la próxima factura')
        if (co.invoiceId) throw new InvalidStateError('Esta orden ya tiene factura')
        const due = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10)
        const invoice = await InvoiceService.create({
          currentUser,
          data: {
            projectId: co.projectId,
            clientId: co.project.clientId,
            amountUSD: co.feeUSD,
            currency: 'USD',
            exchangeRate: 1,
            dueDate: due,
            milestoneLabel: `${co.number} — ${co.title}`,
            notes: `${co.kind === 'ADDITIONAL_SERVICE' ? 'Servicio adicional' : 'Orden de cambio'} aprobada por ${co.decidedByName ?? 'el cliente'}`,
            lineItems: [{ description: `${co.number} — ${co.title}`, quantity: 1, unitPriceUSD: co.feeUSD }],
          },
        })
        const r = await prisma.changeOrder.updateMany({ where: { id: co.id, invoiceId: null }, data: { invoiceId: invoice.id } })
        if (r.count === 0) {
          // Lost a race with a second click: drop the duplicate draft.
          await prisma.invoice.delete({ where: { id: invoice.id } })
          throw new InvalidStateError('Esta orden ya tiene factura')
        }
        break
      }
    }

    await audit(currentUser.id, 'UPDATE', co.id, { action: input.action, number: co.number })
    return prisma.changeOrder.findUniqueOrThrow({
      where: { id: co.id },
      include: { invoice: { select: { id: true, number: true, status: true } } },
    })
  },

  /**
   * Client decision from the portal. The token must belong to the client
   * that owns the project, and the change order must belong to that
   * project and be awaiting approval.
   */
  async decideFromPortal(args: {
    token: string
    projectId: string
    changeOrderId: string
    decision: 'approve' | 'reject'
    name: string
    note: string
    clientId: string
  }) {
    const co = await prisma.changeOrder.findFirst({
      where: { id: args.changeOrderId, projectId: args.projectId, project: { clientId: args.clientId } },
      include: { project: { select: { id: true, code: true, name: true, projectManagerId: true } } },
    })
    if (!co || !PORTAL_VISIBLE_STATUSES.includes(co.status as (typeof PORTAL_VISIBLE_STATUSES)[number])) {
      throw new NotFoundError('Orden de cambio', args.changeOrderId)
    }
    if (co.status !== 'SENT') throw new InvalidStateError('Esta orden ya fue respondida')
    if (!args.name.trim()) throw new ValidationError('Escribe tu nombre completo', 'name')

    const ok = await prisma.$transaction((tx) =>
      applyDecision(tx, co, args.decision, { name: args.name.trim(), note: args.note, channel: 'PORTAL' })
    )
    if (!ok) throw new InvalidStateError('Esta orden ya fue respondida')
    await notifyDecision(co, args.decision, args.name.trim())
    return prisma.changeOrder.findUniqueOrThrow({ where: { id: co.id }, select: PORTAL_SELECT })
  },
}
