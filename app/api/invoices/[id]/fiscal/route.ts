import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { FiscalService, annulSchema } from '@/services/FiscalService'

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('issue') }),
  annulSchema.extend({ action: z.literal('annul') }),
])

// POST /api/invoices/:id/fiscal  { action: 'issue' } | { action: 'annul', reasonCode, note }
export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireAuth()
  const input = actionSchema.parse(await req.json())
  const view =
    input.action === 'issue'
      ? await FiscalService.issue({ currentUser: user, invoiceId: params.id })
      : await FiscalService.annul({ currentUser: user, invoiceId: params.id, reasonCode: input.reasonCode, note: input.note })
  return view.invoice
})
