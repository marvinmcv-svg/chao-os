/**
 * InvoiceService — invoice CRUD + status transitions + payments + PDF.
 *
 * All routes under /api/invoices/* eventually delegate here. The service:
 *   - Derives clientId from the project when omitted (keeps the create
 *     modal simple: just projectId).
 *   - Auto-generates the invoice number (INV-XXXX, sequential, seeded
 *     at 141 to match the pre-existing numbering).
 *   - Enforces the DRAFT-only rule for `delete()` (InvoiceStatusError →
 *     InvalidStateError → HTTP 422).
 *   - Encapsulates the PAID state machine on `updateStatus()`:
 *       * transitioning to PAID requires payments >= amountUSD
 *         (throws InsufficientPaymentsError, HTTP 400)
 *       * sets paidAt when PAID
 *       * PENDING with a past dueDate silently promotes to OVERDUE
 *       * OVERDUE fans out notifications to all ADMIN users
 *       * SENT fires the client invoice email (fire-and-forget)
 *   - `recordPayment()` rejects overpayments (ValidationError), then
 *     auto-promotes the invoice to PAID when cumulative payments reach
 *     the invoice amount, and emails the client (fire-and-forget).
 *   - Every mutation writes an audit log entry.
 *
 * Permission model:
 *   - Every method takes `currentUser: AuthUser` for audit + checks.
 *   - All methods are available to any authenticated user, matching
 *     the current route behavior.
 *
 * Transactions:
 *   - `recordPayment()` and `updateStatus()` intentionally use plain
 *     sequential writes (payment first, then status), preserving the
 *     original route semantics: the payment is the source of truth —
 *     if the status update fails, the payment still exists and the
 *     invoice remains consistently payable.
 */
import type { z } from 'zod'
import type {
  CreateInvoiceSchema,
  CreatePaymentSchema,
  UpdateInvoiceSchema,
} from '@/lib/validations'
import { prisma } from '@/lib/prisma'
import type { AuthUser } from '@/lib/auth'
import { sendInvoiceEmail, sendPaymentReceivedEmail } from '@/lib/email'
import { generateInvoicePdf } from '@/lib/pdf/generateInvoicePdf'
import {
  InsufficientPaymentsError,
  InvalidStateError,
  NotFoundError,
  ValidationError,
} from '@/lib/result'

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>
export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceSchema>
export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>

export const InvoiceService = {
  // ─── list ──────────────────────────────────────────────────────────────

  /**
   * List invoices, optionally filtered by status and/or project.
   * Each row carries a computed paidAmount (sum of its payments) so the
   * UI can show outstanding balances without an extra round-trip.
   */
  async list(args: {
    currentUser: AuthUser
    status?: string
    projectId?: string
  }) {
    const where: Record<string, unknown> = {}
    if (args.status) where.status = args.status
    if (args.projectId) where.projectId = args.projectId

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        project: { select: { id: true, code: true, name: true } },
        client: { select: { id: true, name: true, company: true } },
        lineItems: true,
        payments: { orderBy: { paidAt: 'desc' } },
      },
      orderBy: { issuedAt: 'desc' },
    })

    return invoices.map((inv) => ({
      ...inv,
      paidAmount: inv.payments.reduce((sum, p) => sum + p.amountUSD, 0),
    }))
  },

  // ─── create ────────────────────────────────────────────────────────────

  /**
   * Create a new invoice. clientId is derived from the project when
   * omitted in the payload. The invoice number advances from the last
   * existing one (first-ever invoice gets INV-0142 to continue the
   * historical series). Writes audit log on success.
   */
  async create(args: { currentUser: AuthUser; data: CreateInvoiceInput }) {
    const { currentUser, data } = args

    const clientId =
      data.clientId ??
      (
        await prisma.project.findUnique({
          where: { id: data.projectId },
          select: { clientId: true },
        })
      )?.clientId

    if (!clientId) {
      throw new ValidationError('No se encontró el cliente asociado al proyecto')
    }

    const lastInvoice = await prisma.invoice.findFirst({ orderBy: { number: 'desc' } })
    const lastNum = lastInvoice ? parseInt(lastInvoice.number.split('-')[1], 10) : 141
    const nextNumber = `INV-${String(lastNum + 1).padStart(4, '0')}`

    const invoice = await prisma.invoice.create({
      data: {
        number: nextNumber,
        projectId: data.projectId,
        clientId,
        amountUSD: data.amountUSD,
        currency: data.currency,
        exchangeRate: data.exchangeRate,
        dueDate: new Date(data.dueDate),
        notes: data.notes || '',
        status: 'DRAFT',
        lineItems: data.lineItems
          ? {
              create: data.lineItems.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                unitPriceUSD: item.unitPriceUSD,
                totalUSD: item.quantity * item.unitPriceUSD,
              })),
            }
          : undefined,
      },
      include: {
        project: { select: { code: true, name: true } },
        client: { select: { name: true, company: true } },
        lineItems: true,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: currentUser.id,
        action: 'CREATE',
        entityType: 'Invoice',
        entityId: invoice.id,
        payload: { number: invoice.number },
      },
    })

    return invoice
  },

  // ─── getById ───────────────────────────────────────────────────────────

  /**
   * Get one invoice with the full relation graph used by the detail
   * view, plus the computed paidAmount. Throws NotFoundError if no
   * invoice has that id.
   */
  async getById(args: { currentUser: AuthUser; id: string }) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: args.id },
      include: {
        project: { select: { id: true, code: true, name: true, totalBudgetUSD: true } },
        client: { select: { id: true, name: true, company: true, email: true, phone: true } },
        lineItems: true,
        payments: { orderBy: { paidAt: 'desc' } },
      },
    })
    if (!invoice) throw new NotFoundError('Invoice', args.id)

    return {
      ...invoice,
      paidAmount: invoice.payments.reduce((sum, p) => sum + p.amountUSD, 0),
    }
  },

  // ─── update ────────────────────────────────────────────────────────────

  /**
   * Partial update of an invoice. Captures the full before-state in the
   * audit log for compliance. Throws NotFoundError when missing.
   */
  async update(args: { currentUser: AuthUser; id: string; data: UpdateInvoiceInput }) {
    const existing = await prisma.invoice.findUnique({ where: { id: args.id } })
    if (!existing) throw new NotFoundError('Invoice', args.id)

    const updateData: Record<string, unknown> = { ...args.data }
    if (args.data.dueDate) updateData.dueDate = new Date(args.data.dueDate)

    const invoice = await prisma.invoice.update({
      where: { id: args.id },
      data: updateData,
      include: {
        project: { select: { code: true, name: true } },
        client: { select: { name: true, company: true } },
        lineItems: true,
        payments: true,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: args.currentUser.id,
        action: 'UPDATE',
        entityType: 'Invoice',
        entityId: invoice.id,
        payload: { before: existing, after: invoice },
      },
    })

    return invoice
  },

  // ─── delete ────────────────────────────────────────────────────────────

  /**
   * Delete an invoice, but ONLY while it's a DRAFT. Anything past DRAFT
   * has a financial trail (emails, payments, PDF) and must not be
   * removable. Throws InvalidStateError (HTTP 422) otherwise.
   */
  async delete(args: { currentUser: AuthUser; id: string }) {
    const existing = await prisma.invoice.findUnique({ where: { id: args.id } })
    if (!existing) throw new NotFoundError('Invoice', args.id)

    if (existing.status !== 'DRAFT') {
      throw new InvalidStateError('Solo facturas en estado DRAFT pueden eliminarse')
    }

    await prisma.invoice.delete({ where: { id: args.id } })

    await prisma.auditLog.create({
      data: {
        userId: args.currentUser.id,
        action: 'DELETE',
        entityType: 'Invoice',
        entityId: args.id,
        payload: { before: existing },
      },
    })
  },

  // ─── updateStatus ──────────────────────────────────────────────────────

  /**
   * Advance the invoice through its status state machine.
   *
   *  - PAID: requires cumulative payments >= amountUSD; throws
   *    InsufficientPaymentsError (HTTP 400) otherwise. Sets paidAt.
   *  - PENDING: if the due date is in the past, the invoice is
   *    automatically promoted to OVERDUE (the UI cannot set OVERDUE
   *    directly — it is an emergent status).
   *  - OVERDUE: notifies every ADMIN user so operations acts on it.
   *  - SENT: emails the client a copy (fire-and-forget).
   *
   * Audit log records the status transition (from -> to).
   * Returns the updated invoice (with project + client relations).
   */
  async updateStatus(args: { currentUser: AuthUser; id: string; status: string }) {
    const existing = await prisma.invoice.findUnique({ where: { id: args.id } })
    if (!existing) throw new NotFoundError('Invoice', args.id)

    const newStatus = args.status
    const updateData: Record<string, unknown> = { status: newStatus }

    if (newStatus === 'PAID') {
      const payments = await prisma.payment.findMany({
        where: { invoiceId: args.id },
      })
      const totalPaid = payments.reduce((sum, p) => sum + p.amountUSD, 0)
      if (totalPaid < existing.amountUSD) {
        throw new InsufficientPaymentsError(existing.amountUSD, totalPaid)
      }
      updateData.paidAt = new Date()
    }

    // PENDING + past due date -> OVERDUE (emergent status)
    if (newStatus === 'PENDING' && new Date(existing.dueDate) < new Date()) {
      updateData.status = 'OVERDUE'
    }

    const invoice = await prisma.invoice.update({
      where: { id: args.id },
      data: updateData,
      include: {
        project: { select: { code: true, name: true } },
        client: { select: { name: true, company: true, email: true } },
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: args.currentUser.id,
        action: 'UPDATE',
        entityType: 'Invoice',
        entityId: invoice.id,
        payload: { field: 'status', from: existing.status, to: invoice.status },
      },
    })

    // Trigger notifications for overdue invoices
    if (invoice.status === 'OVERDUE') {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      })
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: 'OVERDUE_INVOICE',
          title: `Factura ${invoice.number} vencida`,
          message: `Factura ${invoice.number} vencida — ${invoice.amountUSD} USD`,
          data: { invoiceId: invoice.id, amount: invoice.amountUSD },
        })),
      })
    }

    // Send invoice email when status changes to SENT (fire-and-forget)
    if (invoice.status === 'SENT') {
      void sendInvoiceEmail({
        number: invoice.number,
        amountUSD: invoice.amountUSD,
        clientName: invoice.client.name,
        clientEmail: invoice.client.email,
        dueDate: invoice.dueDate,
        projectName: invoice.project.name,
      }).catch((err) => console.error('sendInvoiceEmail failed:', err))
    }

    return invoice
  },

  // ─── recordPayment ─────────────────────────────────────────────────────

  /**
   * Record a payment against an invoice.
   *
   *  - Rejects overpayment: total paid (existing + new) may never
   *    exceed the invoice amount (ValidationError, HTTP 400).
   *  - Auto-promotes to PAID + sets paidAt when the cumulative total
   *    reaches the invoice amount.
   *  - Emails the client a payment-received notice (fire-and-forget).
   *  - Writes audit log with payment entity (id + amount + invoiceId).
   */
  async recordPayment(args: {
    currentUser: AuthUser
    id: string
    data: CreatePaymentInput
  }) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: args.id },
      include: {
        client: { select: { name: true, email: true } },
        project: { select: { name: true } },
      },
    })
    if (!invoice) throw new NotFoundError('Invoice', args.id)

    const existingPayments = await prisma.payment.findMany({
      where: { invoiceId: args.id },
    })
    const totalPaid =
      existingPayments.reduce((sum, p) => sum + p.amountUSD, 0) + args.data.amountUSD
    if (totalPaid > invoice.amountUSD) {
      throw new ValidationError('El pago excede el monto de la factura')
    }

    const payment = await prisma.payment.create({
      data: {
        invoiceId: args.id,
        amountUSD: args.data.amountUSD,
        method: args.data.method,
        reference: args.data.reference,
        paidAt: new Date(),
      },
    })

    // Fully paid -> promote the invoice
    if (totalPaid >= invoice.amountUSD) {
      await prisma.invoice.update({
        where: { id: args.id },
        data: { status: 'PAID', paidAt: new Date() },
      })
    }

    await prisma.auditLog.create({
      data: {
        userId: args.currentUser.id,
        action: 'CREATE',
        entityType: 'Payment',
        entityId: payment.id,
        payload: { invoiceId: args.id, amount: payment.amountUSD },
      },
    })

    // Send payment received email to client (fire-and-forget)
    void sendPaymentReceivedEmail({
      number: invoice.number,
      amountUSD: payment.amountUSD,
      clientName: invoice.client.name,
      clientEmail: invoice.client.email,
    }).catch((err) => console.error('sendPaymentReceivedEmail failed:', err))

    return payment
  },

  // ─── getPdf ────────────────────────────────────────────────────────────

  /**
   * Generate the invoice PDF. Fetch the full invoice, render via the
   * pdf generator, persist the pdfUrl back to the record (so the UI
   * can detect "PDF exists"), and return the raw buffer for streaming.
   */
  async getPdf(args: { currentUser: AuthUser; id: string }) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: args.id },
      include: {
        project: { select: { code: true, name: true } },
        client: { select: { name: true, company: true, email: true, phone: true } },
        lineItems: true,
        payments: { orderBy: { paidAt: 'desc' } },
      },
    })
    if (!invoice) throw new NotFoundError('Invoice', args.id)

    const pdfBuffer = await generateInvoicePdf(invoice)

    await prisma.invoice.update({
      where: { id: args.id },
      data: { pdfUrl: `/api/invoices/${args.id}/pdf` },
    })

    return { invoice, pdfBuffer }
  },
}