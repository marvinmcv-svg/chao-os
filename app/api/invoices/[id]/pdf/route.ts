import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateInvoicePdf } from '@/lib/pdf/generateInvoicePdf'

// GET /api/invoices/:id/pdf
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await auth()
    if (!session) {
      return Response.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } }, { status: 401 })
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: {
        project: { select: { code: true, name: true } },
        client: { select: { name: true, company: true, email: true, phone: true } },
        lineItems: true,
        payments: { orderBy: { paidAt: 'desc' } },
      },
    })

    if (!invoice) {
      return Response.json({ success: false, error: { code: 'NOT_FOUND', message: 'Factura no encontrada' } }, { status: 404 })
    }

    const pdfBuffer = await generateInvoicePdf(invoice)

    // Update pdfUrl on the invoice record
    await prisma.invoice.update({
      where: { id: params.id },
      data: { pdfUrl: `/api/invoices/${params.id}/pdf` },
    })

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.number}.pdf"`,
      },
    })
  } catch (error) {
    console.error('GET /api/invoices/:id/pdf error:', error)
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Error interno' } }, { status: 500 })
  }
}