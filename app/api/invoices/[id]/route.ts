import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { InvoiceService } from '@/services/InvoiceService'
import { UpdateInvoiceSchema } from '@/lib/validations'

// GET /api/invoices/:id — invoice with paidAmount computed from payments
export const GET = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    return InvoiceService.getById({ currentUser: user, id: params.id })
  },
)

// PUT /api/invoices/:id — update editable invoice fields
export const PUT = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    const body = UpdateInvoiceSchema.parse(await req.json())
    return InvoiceService.update({ currentUser: user, id: params.id, data: body })
  },
)

// DELETE /api/invoices/:id — DRAFT only
export const DELETE = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    await InvoiceService.delete({ currentUser: user, id: params.id })
    return { id: params.id }
  },
)