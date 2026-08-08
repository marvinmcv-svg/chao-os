import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { InvoiceService } from '@/services/InvoiceService'
import { CreatePaymentSchema } from '@/lib/validations'

// POST /api/invoices/:id/payments — record a (partial) payment
export const POST = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    const body = CreatePaymentSchema.parse(await req.json())
    return InvoiceService.recordPayment({
      currentUser: user,
      id: params.id,
      data: body,
    })
  },
  { status: 201 },
)