import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { sendInvoiceEmail } from '@/lib/email'

const UpdateStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'PENDING', 'OVERDUE', 'PAID']),
})

// PATCH /api/invoices/:id/status
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const body = await req.json()
    const parsed = UpdateStatusSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Estado inválido' } }, { status: 400 })
    }

    const existing = await prisma.invoice.findUnique({ where: { id: params.id } })
    if (!existing) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Factura no encontrada' } }, { status: 404 })
    }

    const newStatus = parsed.data.status
    const updateData: any = { status: newStatus }

    // Validate payments when transitioning to PAID
    if (newStatus === 'PAID') {
      const payments = await prisma.payment.findMany({
        where: { invoiceId: params.id },
      })
      const totalPaid = payments.reduce((sum, p) => sum + p.amountUSD, 0)
      if (totalPaid < existing.amountUSD) {
        return Response.json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PAYMENTS',
            message: 'No se puede marcar como pagado sin pagos registrados',
          },
        }, { status: 400 })
      }
      updateData.paidAt = new Date()
    }

    // Check for overdue when setting to PENDING
    if (newStatus === 'PENDING' && new Date(existing.dueDate) < new Date()) {
      updateData.status = 'OVERDUE'
    }

    const invoice = await prisma.invoice.update({
      where: { id: params.id },
      data: updateData,
      include: {
        project: { select: { code: true, name: true } },
        client: { select: { name: true, company: true, email: true } },
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Invoice',
        entityId: invoice.id,
        payload: { field: 'status', from: existing.status, to: invoice.status },
      },
    })

    // Trigger notification for overdue
    if (invoice.status === 'OVERDUE') {
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
      })
      await prisma.notification.createMany({
        data: admins.map(admin => ({
          userId: admin.id,
          type: 'OVERDUE_INVOICE',
          message: `Factura ${invoice.number} vencida — ${invoice.amountUSD} USD`,
          data: { invoiceId: invoice.id, amount: invoice.amountUSD },
        })),
      })
    }

    // Send invoice email when status changes to SENT
    if (newStatus === 'SENT') {
      void sendInvoiceEmail({
        number: invoice.number,
        amountUSD: invoice.amountUSD,
        clientName: invoice.client.name,
        clientEmail: invoice.client.email,
        dueDate: invoice.dueDate,
        projectName: invoice.project.name,
      })
    }

    return Response.json({ success: true, data: invoice })
  } catch (error) {
    console.error('PATCH /api/invoices/:id/status error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}