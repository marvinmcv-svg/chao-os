import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { ChangeOrderService, changeOrderActionSchema } from '@/services/ChangeOrderService'

// POST /api/change-orders/:id/status
//   { action: send | withdraw | void | invoice }
//   { action: approve | reject, signedBy, note }  — record a signed decision
export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireAuth()
  const input = changeOrderActionSchema.parse(await req.json())
  return ChangeOrderService.transition({ currentUser: user, id: params.id, input })
})
