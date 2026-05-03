import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const CreateInvoiceSchema = z.object({
  projectId: z.string().cuid(),
  // clientId is optional — if omitted, the API derives it from the project.
  // This keeps the modal simple: it sends projectId, and we extract clientId here.
  clientId: z.string().cuid().optional(),
  milestoneLabel: z.string().min(1),
  amountUSD: z.number().positive(),
  currency: z.enum(['USD', 'BOB']).default('USD'),
  exchangeRate: z.number().positive().default(1),
  dueDate: z.string(),
  notes: z.string().optional(),
  lineItems: z.array(z.object({
    description: z.string(),
    quantity: z.number().positive(),
    unitPriceUSD: z.number().positive(),
  })).optional(),
})

// GET /api/invoices
export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const projectId = searchParams.get('projectId')

    const where: any = {}
    if (status) where.status = status
    if (projectId) where.projectId = projectId

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

    // Compute paid amount from payments
    const withPaidAmount = invoices.map(inv => ({
      ...inv,
      paidAmount: inv.payments.reduce((sum, p) => sum + p.amountUSD, 0),
    }))

    return Response.json({ success: true, data: withPaidAmount })
  } catch (error) {
    console.error('GET /api/invoices error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}

// POST /api/invoices
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const body = await req.json()
    const parsed = CreateInvoiceSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } }, { status: 400 })
    }

    const data = parsed.data

    // Derive clientId from the project when not provided in the request body.
    const clientId = data.clientId
      ?? (await prisma.project.findUnique({ where: { id: data.projectId }, select: { clientId: true } }))?.clientId

    if (!clientId) {
      return Response.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No se encontró el cliente asociado al proyecto' } }, { status: 400 })
    }

    // Generate invoice number: INV-XXXX (next sequential)
    const lastInvoice = await prisma.invoice.findFirst({ orderBy: { number: 'desc' } })
    const lastNum = lastInvoice ? parseInt(lastInvoice.number.split('-')[1]) : 141
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
        lineItems: data.lineItems ? {
          create: data.lineItems.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unitPriceUSD: item.unitPriceUSD,
            totalUSD: item.quantity * item.unitPriceUSD,
          })),
        } : undefined,
      },
      include: {
        project: { select: { code: true, name: true } },
        client: { select: { name: true, company: true } },
        lineItems: true,
      },
    })

    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        entityType: 'Invoice',
        entityId: invoice.id,
        payload: { number: invoice.number },
      },
    })

    return Response.json({ success: true, data: invoice }, { status: 201 })
  } catch (error) {
    console.error('POST /api/invoices error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}