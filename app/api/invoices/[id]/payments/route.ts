import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { sendPaymentReceivedEmail } from '@/lib/email'

const CreatePaymentSchema = z.object({
  amountUSD: z.number().positive(),
  method: z.string().optional(),
  reference: z.string().optional(),
})

// POST /api/invoices/:id/payments — record a partial payment
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const body = await req.json()
    const parsed = CreatePaymentSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } }, { status: 400 })
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: {
        client: { select: { name: true, email: true } },
        project: { select: { name: true } },
      },
    })
    if (!invoice) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Factura no encontrada' } }, { status: 404 })
    }

    // Check if already fully paid
    const existingPayments = await prisma.payment.findMany({ where: { invoiceId: params.id } })
    const totalPaid = existingPayments.reduce((sum, p) => sum + p.amountUSD, 0) + parsed.data.amountUSD
    if (totalPaid > invoice.amountUSD) {
      return Response.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'El pago excede el monto de la factura' } }, { status: 400 })
    }

    const payment = await prisma.payment.create({
      data: {
        invoiceId: params.id,
        amountUSD: parsed.data.amountUSD,
        method: parsed.data.method,
        reference: parsed.data.reference,
        paidAt: new Date(),
      },
    })

    // If fully paid, update invoice status
    if (totalPaid >= invoice.amountUSD) {
      await prisma.invoice.update({
        where: { id: params.id },
        data: { status: 'PAID', paidAt: new Date() },
      })
    }

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'Payment',
        entityId: payment.id,
        payload: { invoiceId: params.id, amount: payment.amountUSD },
      },
    })

    // Send payment received email to client (fire-and-forget)
    void sendPaymentReceivedEmail({
      number: invoice.number,
      amountUSD: payment.amountUSD,
      clientName: invoice.client.name,
      clientEmail: invoice.client.email,
    })

    return Response.json({ success: true, data: payment }, { status: 201 })
  } catch (error) {
    console.error('POST /api/invoices/:id/payments error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}