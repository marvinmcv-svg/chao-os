/**
 * ExpenseService — expenses & reimbursables (roadmap item 4).
 *
 * An expense is a project cost outside labour: travel, plotting, renders,
 * consultants, permits, models… Each one can be:
 *   - billable    → rebilled to the client at cost × (1 + markup%)
 *   - paidByStaff → fronted by a team member, who must be paid back
 *
 * Lifecycle:
 *   SUBMITTED ──approve──▶ APPROVED ──reimburse (paidByStaff only)──▶ REIMBURSED
 *       │  ▲                  │
 *       │  └──edit/resubmit───┤
 *       └──reject──▶ REJECTED ┘
 *
 * Managers (PRINCIPAL / ADMIN and the project's PM) approve; their own
 * entries are approved on creation. Only APPROVED / REIMBURSED expenses
 * count as project cost (P&L) and can be invoiced. Invoicing links each
 * expense to the invoice with a conditional update on `invoiceId = null`,
 * so the same cost can never be billed twice. Deleting the draft invoice
 * releases the expenses (FK `onDelete: SetNull`).
 *
 * Receipts are stored in S3 when it is configured, otherwise in Postgres
 * (ExpenseReceipt) — receipts are capped at 4 MB, under Vercel's body limit.
 */
import { z } from 'zod'
import type { Expense, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'
import { DomainError, ForbiddenError, InvalidStateError, NotFoundError, ValidationError } from '@/lib/result'
import { buildReceiptKey, deleteObject, getPresignedViewUrl, isS3Configured, putObject } from '@/lib/s3'
import { InvoiceService } from './InvoiceService'
import { NotificationService } from './NotificationService'

/** Firm-wide approvers. The project's PM can also approve that project's expenses. */
export const EXPENSE_APPROVER_ROLES = new Set(['PRINCIPAL', 'ADMIN'])
/** Who pays people back and sees every expense in Finance. */
export const EXPENSE_FINANCE_ROLES = new Set(['PRINCIPAL', 'ADMIN'])

export const EXPENSE_CATEGORIES = ['TRAVEL', 'PRINTING', 'RENDERING', 'CONSULTANT', 'PERMITS', 'MODELS', 'SURVEY', 'MEALS', 'OTHER'] as const
export const COUNTED_STATUSES = ['APPROVED', 'REIMBURSED'] as const

export const RECEIPT_MAX_BYTES = 4 * 1024 * 1024
export const RECEIPT_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic'])

const round2 = (n: number) => Math.round(n * 100) / 100

export const expenseInputSchema = z
  .object({
    description: z.string().trim().min(3, 'Descripción demasiado corta').max(300),
    category: z.enum(EXPENSE_CATEGORIES).default('OTHER'),
    vendor: z.string().trim().max(160).default(''),
    phase: z.enum(['SD', 'DD', 'CD', 'CA']).nullable().default(null),
    currency: z.enum(['USD', 'BOB']).default('USD'),
    /** Amount as paid, in `currency` */
    amount: z.number().finite().positive('El monto debe ser mayor a cero').max(10_000_000, 'Monto fuera de rango'),
    /** BOB per USD; required (and > 0) when currency is BOB */
    exchangeRate: z.number().finite().positive().max(1000).default(6.96),
    incurredAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}/, 'Fecha inválida')
      .refine((d) => !Number.isNaN(Date.parse(d)), 'Fecha inválida')
      .refine((d) => Date.parse(d) <= Date.now() + 86_400_000, 'La fecha no puede ser futura'),
    billable: z.boolean().default(false),
    markupPercent: z.number().min(0).max(100, 'Recargo máximo 100%').default(0),
    paidByStaff: z.boolean().default(false),
  })
  .transform((v) => ({ ...v, markupPercent: v.billable ? v.markupPercent : 0 }))
export type ExpenseInput = z.infer<typeof expenseInputSchema>

export const expenseActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), note: z.string().trim().min(3, 'Indica el motivo del rechazo').max(1000) }),
  z.object({ action: z.literal('reimburse') }),
])
export type ExpenseAction = z.infer<typeof expenseActionSchema>

export const expenseInvoiceSchema = z.object({
  /** Subset to bill; omitted = every unbilled billable approved expense */
  expenseIds: z.array(z.string().min(1)).min(1).max(200).optional(),
})

export const expenseListQuerySchema = z.object({
  scope: z.enum(['mine', 'all']).default('mine'),
  status: z.enum(['SUBMITTED', 'APPROVED', 'REJECTED', 'REIMBURSED']).optional(),
  /** Approved, paid by staff, not reimbursed yet */
  toReimburse: z.coerce.boolean().optional(),
})

/** Billed amount for one expense: cost × (1 + markup%). */
export function billedAmount(e: Pick<Expense, 'amountUSD' | 'markupPercent'>) {
  return round2(e.amountUSD * (1 + (e.markupPercent || 0) / 100))
}

export function toUSD(amount: number, currency: 'USD' | 'BOB', exchangeRate: number) {
  return currency === 'USD' ? round2(amount) : round2(amount / exchangeRate)
}

type Row = Pick<Expense, 'status' | 'amountUSD' | 'markupPercent' | 'billable' | 'paidByStaff' | 'invoiceId'>

/** Totals shown in the project drawer and used by the invoice action. */
export function summarize(rows: Row[]) {
  const counted = rows.filter((r) => (COUNTED_STATUSES as readonly string[]).includes(r.status))
  const sum = (xs: Row[], f: (r: Row) => number = (r) => r.amountUSD) => round2(xs.reduce((a, r) => a + f(r), 0))
  const unbilled = counted.filter((r) => r.billable && !r.invoiceId)
  return {
    costUSD: sum(counted),
    pendingUSD: sum(rows.filter((r) => r.status === 'SUBMITTED')),
    pendingCount: rows.filter((r) => r.status === 'SUBMITTED').length,
    billableUSD: sum(counted.filter((r) => r.billable)),
    unbilledCostUSD: sum(unbilled),
    unbilledAmountUSD: sum(unbilled, billedAmount),
    unbilledCount: unbilled.length,
    billedAmountUSD: sum(counted.filter((r) => r.billable && r.invoiceId), billedAmount),
    toReimburseUSD: sum(counted.filter((r) => r.paidByStaff && r.status === 'APPROVED')),
    toReimburseCount: counted.filter((r) => r.paidByStaff && r.status === 'APPROVED').length,
  }
}

type ProjectForAuth = { id: string; projectManagerId: string }

export function canApprove(user: AuthUser, project: ProjectForAuth) {
  return EXPENSE_APPROVER_ROLES.has(user.role) || project.projectManagerId === user.id
}

const LIST_INCLUDE = {
  submittedBy: { select: { id: true, name: true, avatarInitials: true } },
  reviewedBy: { select: { id: true, name: true } },
  invoice: { select: { id: true, number: true, status: true } },
  project: { select: { id: true, code: true, name: true, projectManagerId: true } },
} satisfies Prisma.ExpenseInclude

function dto<T extends Expense>(e: T) {
  // Never ship the storage key to the browser — the receipt route resolves it.
  const { receiptKey, ...rest } = e
  return { ...rest, hasReceipt: !!receiptKey, billedAmountUSD: e.billable ? billedAmount(e) : 0 }
}

async function audit(userId: string, action: string, entityId: string, payload: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: { userId, action, entityType: 'Expense', entityId, payload: payload as Prisma.InputJsonValue },
  })
}

function money(n: number) {
  return `US$ ${n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const ExpenseService = {
  async listForProject(args: { currentUser: AuthUser; projectId: string }) {
    const project = await prisma.project.findUnique({
      where: { id: args.projectId },
      select: { id: true, projectManagerId: true },
    })
    if (!project) throw new NotFoundError('Proyecto', args.projectId)
    const items = await prisma.expense.findMany({
      where: { projectId: project.id },
      orderBy: [{ incurredAt: 'desc' }, { createdAt: 'desc' }],
      include: LIST_INCLUDE,
    })
    return {
      items: items.map(dto),
      summary: summarize(items),
      canApprove: canApprove(args.currentUser, project),
      canInvoice: canApprove(args.currentUser, project),
    }
  },

  /**
   * Finance view. `all` is for PRINCIPAL / ADMIN (every project); anyone
   * else gets their own submissions plus what awaits their approval as PM.
   */
  async list(args: { currentUser: AuthUser; query: z.infer<typeof expenseListQuerySchema> }) {
    const { currentUser: user, query } = args
    const isFinance = EXPENSE_FINANCE_ROLES.has(user.role)
    const scope: Prisma.ExpenseWhereInput =
      query.scope === 'all' && isFinance
        ? {}
        : query.scope === 'all'
          ? { OR: [{ submittedById: user.id }, { project: { projectManagerId: user.id } }] }
          : { submittedById: user.id }
    const where: Prisma.ExpenseWhereInput = {
      ...scope,
      ...(query.status ? { status: query.status } : {}),
      ...(query.toReimburse ? { status: 'APPROVED', paidByStaff: true } : {}),
    }
    const items = await prisma.expense.findMany({
      where,
      orderBy: [{ incurredAt: 'desc' }, { createdAt: 'desc' }],
      include: LIST_INCLUDE,
      take: 500,
    })
    return {
      items: items.map((e) => ({ ...dto(e), canApprove: canApprove(user, e.project) })),
      summary: summarize(items),
      canReimburse: isFinance,
      isFinance,
    }
  },

  async create(args: { currentUser: AuthUser; projectId: string; data: ExpenseInput }) {
    const { currentUser: user, data } = args
    const project = await prisma.project.findUnique({
      where: { id: args.projectId },
      select: { id: true, code: true, name: true, projectManagerId: true },
    })
    if (!project) throw new NotFoundError('Proyecto', args.projectId)
    const autoApprove = canApprove(user, project)
    const now = new Date()
    const row = await prisma.expense.create({
      data: {
        projectId: project.id,
        description: data.description,
        category: data.category,
        vendor: data.vendor,
        phase: data.phase,
        currency: data.currency,
        amountOriginal: round2(data.amount),
        exchangeRate: data.currency === 'USD' ? 1 : data.exchangeRate,
        amountUSD: toUSD(data.amount, data.currency, data.exchangeRate),
        incurredAt: new Date(data.incurredAt),
        billable: data.billable,
        markupPercent: data.markupPercent,
        paidByStaff: data.paidByStaff,
        status: autoApprove ? 'APPROVED' : 'SUBMITTED',
        submittedById: user.id,
        ...(autoApprove ? { reviewedById: user.id, reviewedAt: now } : {}),
      },
      include: LIST_INCLUDE,
    })
    await audit(user.id, 'CREATE', row.id, { amountUSD: row.amountUSD, status: row.status })
    if (!autoApprove && project.projectManagerId !== user.id) {
      await NotificationService.create({
        userId: project.projectManagerId,
        type: 'EXPENSE_SUBMITTED',
        title: 'Gasto por aprobar',
        message: `${user.name} registró “${row.description}” (${money(row.amountUSD)}) en ${project.code} · ${project.name}.`,
        linkUrl: `/projects?id=${project.id}`,
        data: { expenseId: row.id },
      })
    }
    return dto(row)
  },

  async load(id: string) {
    const e = await prisma.expense.findUnique({ where: { id }, include: LIST_INCLUDE })
    if (!e) throw new NotFoundError('Gasto', id)
    return e
  },

  /** Owner (or an approver) may edit while not yet counted; edits by the owner resubmit. */
  async update(args: { currentUser: AuthUser; id: string; data: ExpenseInput }) {
    const { currentUser: user, data } = args
    const e = await this.load(args.id)
    const approver = canApprove(user, e.project)
    if (!approver && e.submittedById !== user.id) throw new ForbiddenError('Solo quien registró el gasto puede editarlo')
    if (e.invoiceId) throw new InvalidStateError('El gasto ya fue facturado; elimina o anula la factura primero')
    if (e.status === 'REIMBURSED') throw new InvalidStateError('El gasto ya fue reembolsado')
    if (!approver && e.status === 'APPROVED') throw new InvalidStateError('El gasto ya fue aprobado; pide a dirección que lo corrija')

    const r = await prisma.expense.updateMany({
      where: { id: e.id, status: e.status, invoiceId: null },
      data: {
        description: data.description,
        category: data.category,
        vendor: data.vendor,
        phase: data.phase,
        currency: data.currency,
        amountOriginal: round2(data.amount),
        exchangeRate: data.currency === 'USD' ? 1 : data.exchangeRate,
        amountUSD: toUSD(data.amount, data.currency, data.exchangeRate),
        incurredAt: new Date(data.incurredAt),
        billable: data.billable,
        markupPercent: data.markupPercent,
        paidByStaff: data.paidByStaff,
        // A rejected expense goes back to the approver once corrected
        ...(e.status === 'REJECTED' ? { status: approver ? 'APPROVED' : 'SUBMITTED', reviewNote: '', reviewedAt: approver ? new Date() : null, reviewedById: approver ? user.id : null } : {}),
      },
    })
    if (r.count === 0) throw new InvalidStateError('El gasto cambió mientras lo editabas; recarga')
    await audit(user.id, 'UPDATE', e.id, { amountUSD: toUSD(data.amount, data.currency, data.exchangeRate) })
    return dto(await this.load(e.id))
  },

  async remove(args: { currentUser: AuthUser; id: string }) {
    const { currentUser: user } = args
    const e = await this.load(args.id)
    const approver = canApprove(user, e.project)
    if (!approver && e.submittedById !== user.id) throw new ForbiddenError('Solo quien registró el gasto puede eliminarlo')
    if (e.invoiceId) throw new InvalidStateError('El gasto ya fue facturado')
    if (e.status === 'REIMBURSED') throw new InvalidStateError('El gasto ya fue reembolsado')
    if (!approver && e.status === 'APPROVED') throw new InvalidStateError('El gasto ya fue aprobado')
    const r = await prisma.expense.deleteMany({ where: { id: e.id, invoiceId: null, status: e.status } })
    if (r.count === 0) throw new InvalidStateError('El gasto cambió de estado; recarga')
    if (e.receiptKey && e.receiptKey !== 'db') {
      await deleteObject(e.receiptKey).catch((err) => console.warn('[expenses] receipt delete failed', err))
    }
    await audit(user.id, 'DELETE', e.id, { amountUSD: e.amountUSD, description: e.description })
    return { id: e.id }
  },

  async transition(args: { currentUser: AuthUser; id: string; input: ExpenseAction }) {
    const { currentUser: user, input } = args
    const e = await this.load(args.id)
    const now = new Date()

    switch (input.action) {
      case 'approve':
      case 'reject': {
        if (!canApprove(user, e.project)) throw new ForbiddenError('Solo dirección, administración y el director del proyecto aprueban gastos')
        if (e.submittedById === user.id && !EXPENSE_APPROVER_ROLES.has(user.role)) {
          throw new ForbiddenError('No puedes aprobar tu propio gasto')
        }
        if (e.status !== 'SUBMITTED') throw new InvalidStateError('Solo se revisan gastos pendientes de aprobación')
        const approve = input.action === 'approve'
        const r = await prisma.expense.updateMany({
          where: { id: e.id, status: 'SUBMITTED' },
          data: {
            status: approve ? 'APPROVED' : 'REJECTED',
            reviewedById: user.id,
            reviewedAt: now,
            reviewNote: approve ? '' : (input as { note: string }).note,
          },
        })
        if (r.count === 0) throw new InvalidStateError('Otra persona ya revisó este gasto')
        if (e.submittedById && e.submittedById !== user.id) {
          await NotificationService.create({
            userId: e.submittedById,
            type: 'EXPENSE_DECIDED',
            title: approve ? 'Gasto aprobado' : 'Gasto rechazado',
            message: approve
              ? `${user.name} aprobó “${e.description}” (${money(e.amountUSD)}).`
              : `${user.name} rechazó “${e.description}”: ${(input as { note: string }).note}`,
            linkUrl: `/projects?id=${e.projectId}`,
            data: { expenseId: e.id },
          })
        }
        break
      }
      case 'reimburse': {
        if (!EXPENSE_FINANCE_ROLES.has(user.role)) throw new ForbiddenError('Solo dirección y administración registran reembolsos')
        if (!e.paidByStaff) throw new InvalidStateError('Este gasto lo pagó el estudio; no hay nada que reembolsar')
        if (e.status !== 'APPROVED') throw new InvalidStateError('Solo se reembolsan gastos aprobados')
        const r = await prisma.expense.updateMany({
          where: { id: e.id, status: 'APPROVED', paidByStaff: true },
          data: { status: 'REIMBURSED', reimbursedAt: now },
        })
        if (r.count === 0) throw new InvalidStateError('El gasto ya fue reembolsado')
        break
      }
    }
    await audit(user.id, 'UPDATE', e.id, { action: input.action })
    return dto(await this.load(e.id))
  },

  /**
   * Rebill approved billable expenses on one draft invoice — a line per
   * expense at cost × (1 + markup). Claims each expense with a conditional
   * update; if any was billed concurrently, the draft is rolled back.
   */
  async invoice(args: { currentUser: AuthUser; projectId: string; expenseIds?: string[] }) {
    const { currentUser: user } = args
    const project = await prisma.project.findUnique({
      where: { id: args.projectId },
      select: { id: true, code: true, name: true, clientId: true, projectManagerId: true },
    })
    if (!project) throw new NotFoundError('Proyecto', args.projectId)
    if (!canApprove(user, project)) throw new ForbiddenError('Solo dirección, administración y el director del proyecto facturan gastos')

    const candidates = await prisma.expense.findMany({
      where: {
        projectId: project.id,
        billable: true,
        invoiceId: null,
        status: { in: [...COUNTED_STATUSES] },
        ...(args.expenseIds ? { id: { in: args.expenseIds } } : {}),
      },
      orderBy: { incurredAt: 'asc' },
    })
    if (args.expenseIds && candidates.length !== new Set(args.expenseIds).size) {
      throw new InvalidStateError('Algunos gastos ya no se pueden facturar (no aprobados, no reembolsables o ya facturados); recarga')
    }
    if (candidates.length === 0) throw new InvalidStateError('No hay gastos reembolsables aprobados pendientes de facturar')

    const lines = candidates.map((e) => ({
      description: `Reembolsable · ${e.description}${e.vendor ? ` (${e.vendor})` : ''}${e.markupPercent ? ` · +${e.markupPercent}%` : ''}`,
      quantity: 1,
      unitPriceUSD: billedAmount(e),
    }))
    const total = round2(lines.reduce((a, l) => a + l.unitPriceUSD, 0))
    const due = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
    const invoice = await InvoiceService.create({
      currentUser: user,
      data: {
        projectId: project.id,
        clientId: project.clientId,
        amountUSD: total,
        currency: 'USD',
        exchangeRate: 1,
        dueDate: due,
        milestoneLabel: `Gastos reembolsables — ${project.code}`,
        notes: `Gastos reembolsables (${candidates.length}). Comprobantes disponibles a solicitud.`,
        lineItems: lines,
      },
    })
    const ids = candidates.map((e) => e.id)
    const claimed = await prisma.expense.updateMany({
      where: { id: { in: ids }, invoiceId: null },
      data: { invoiceId: invoice.id },
    })
    if (claimed.count !== ids.length) {
      // Lost a race: release what we claimed and drop the draft.
      await prisma.expense.updateMany({ where: { invoiceId: invoice.id }, data: { invoiceId: null } })
      await prisma.invoice.delete({ where: { id: invoice.id } })
      throw new InvalidStateError('Otra persona facturó estos gastos al mismo tiempo; recarga')
    }
    await audit(user.id, 'INVOICE', project.id, { invoiceId: invoice.id, expenseIds: ids, amountUSD: total })
    return { invoice: { id: invoice.id, number: invoice.number, amountUSD: total }, count: ids.length }
  },

  // ─── Receipts ────────────────────────────────────────────────────────────

  async attachReceipt(args: { currentUser: AuthUser; id: string; filename: string; mimeType: string; bytes: Uint8Array }) {
    const { currentUser: user } = args
    const e = await this.load(args.id)
    if (!canApprove(user, e.project) && e.submittedById !== user.id) {
      throw new ForbiddenError('Solo quien registró el gasto puede adjuntar el comprobante')
    }
    if (!RECEIPT_MIME_TYPES.has(args.mimeType)) {
      throw new DomainError('INVALID_MIME_TYPE', 'Formato no permitido: usa PDF, JPG, PNG, WEBP o HEIC')
    }
    if (args.bytes.byteLength === 0) throw new ValidationError('El archivo está vacío', 'file')
    if (args.bytes.byteLength > RECEIPT_MAX_BYTES) throw new DomainError('FILE_TOO_LARGE', 'El comprobante excede 4 MB')

    const filename = args.filename.slice(-120) || 'comprobante'
    const previous = e.receiptKey
    let key = 'db'
    if (isS3Configured()) {
      key = buildReceiptKey(e.projectId, e.id, `${Date.now()}-${filename}`)
      await putObject(key, args.bytes, args.mimeType)
      await prisma.expenseReceipt.deleteMany({ where: { expenseId: e.id } })
    } else {
      const data = Buffer.from(args.bytes)
      await prisma.expenseReceipt.upsert({ where: { expenseId: e.id }, create: { expenseId: e.id, data }, update: { data } })
    }
    await prisma.expense.update({
      where: { id: e.id },
      data: { receiptKey: key, receiptName: filename, receiptMime: args.mimeType, receiptSize: args.bytes.byteLength },
    })
    if (previous && previous !== 'db' && previous !== key) {
      await deleteObject(previous).catch((err) => console.warn('[expenses] old receipt delete failed', err))
    }
    await audit(user.id, 'RECEIPT', e.id, { filename, size: args.bytes.byteLength, storage: key === 'db' ? 'db' : 's3' })
    return dto(await this.load(e.id))
  },

  /** Resolve a receipt for viewing: a presigned S3 URL, or the bytes. */
  async getReceipt(args: { currentUser: AuthUser; id: string }) {
    const e = await this.load(args.id)
    if (!e.receiptKey || !e.receiptMime) throw new NotFoundError('Comprobante', args.id)
    const filename = e.receiptName ?? 'comprobante'
    if (e.receiptKey === 'db') {
      const r = await prisma.expenseReceipt.findUnique({ where: { expenseId: e.id } })
      if (!r) throw new NotFoundError('Comprobante', args.id)
      return { kind: 'bytes' as const, data: r.data, mimeType: e.receiptMime, filename }
    }
    return { kind: 'redirect' as const, url: await getPresignedViewUrl(e.receiptKey, filename, e.receiptMime) }
  },

  async removeReceipt(args: { currentUser: AuthUser; id: string }) {
    const { currentUser: user } = args
    const e = await this.load(args.id)
    if (!canApprove(user, e.project) && e.submittedById !== user.id) {
      throw new ForbiddenError('Solo quien registró el gasto puede quitar el comprobante')
    }
    if (!e.receiptKey) return dto(e)
    await prisma.expense.update({
      where: { id: e.id },
      data: { receiptKey: null, receiptName: null, receiptMime: null, receiptSize: null },
    })
    if (e.receiptKey === 'db') await prisma.expenseReceipt.deleteMany({ where: { expenseId: e.id } })
    else await deleteObject(e.receiptKey).catch((err) => console.warn('[expenses] receipt delete failed', err))
    await audit(user.id, 'RECEIPT_REMOVE', e.id, {})
    return dto(await this.load(e.id))
  },
}
