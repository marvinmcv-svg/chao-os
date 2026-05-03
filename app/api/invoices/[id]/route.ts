import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const UpdateInvoiceSchema = z.object({
  milestoneLabel: z.string().optional(),
  amountUSD: z.number().positive().optional(),
  currency: z.enum(['USD', 'BOB']).optional(),
  exchangeRate: z.number().positive().optional(),
  dueDate: z.string().datetime().optional(),
  notes: z.string().optional(),
})

// GET /api/invoices/:id
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: {
        project: { select: { id: true, code: true, name: true, totalBudgetUSD: true } },
        client: { select: { id: true, name: true, company: true, email: true, phone: true } },
        lineItems: true,
        payments: { orderBy: { paidAt: 'desc' } },
      },
    })

    if (!invoice) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Factura no encontrada' } }, { status: 404 })
    }

    const paidAmount = invoice.payments.reduce((sum, p) => sum + p.amountUSD, 0)

    return Response.json({ success: true, data: { ...invoice, paidAmount } })
  } catch (error) {
    console.error('GET /api/invoices/:id error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}

// PUT /api/invoices/:id
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const body = await req.json()
    const parsed = UpdateInvoiceSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } }, { status: 400 })
    }

    const existing = await prisma.invoice.findUnique({ where: { id: params.id } })
    if (!existing) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Factura no encontrada' } }, { status: 404 })
    }

    const updateData: any = { ...parsed.data }
    if (parsed.data.dueDate) updateData.dueDate = new Date(parsed.data.dueDate)

    const invoice = await prisma.invoice.update({
      where: { id: params.id },
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
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Invoice',
        entityId: invoice.id,
        payload: { before: existing, after: invoice },
      },
    })

    return Response.json({ success: true, data: invoice })
  } catch (error) {
    console.error('PUT /api/invoices/:id error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}

// DELETE /api/invoices/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const existing = await prisma.invoice.findUnique({ where: { id: params.id } })
    if (!existing) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Factura no encontrada' } }, { status: 404 })
    }

    // Only DRAFT invoices can be deleted
    if (existing.status !== 'DRAFT') {
      return Response.json({ success: false, error: { code: 'INVALID_STATE', message: 'Solo facturas en estado DRAFT pueden eliminarse' } }, { status: 422 })
    }

    await prisma.invoice.delete({ where: { id: params.id } })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        entityType: 'Invoice',
        entityId: params.id,
        payload: { before: existing },
      },
    })

    return Response.json({ success: true, data: { id: params.id } })
  } catch (error) {
    console.error('DELETE /api/invoices/:id error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}