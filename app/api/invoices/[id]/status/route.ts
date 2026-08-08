import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { InvoiceService } from '@/services/InvoiceService'
import { UpdateInvoiceStatusSchema } from '@/lib/validations'

// PATCH /api/invoices/:id/status — advance status state machine
// (PAID requires payments; PENDING past due auto-promotes to OVERDUE)
export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    const body = UpdateInvoiceStatusSchema.parse(await req.json())
    return InvoiceService.updateStatus({
      currentUser: user,
      id: params.id,
      status: body.status,
    })
  },
)