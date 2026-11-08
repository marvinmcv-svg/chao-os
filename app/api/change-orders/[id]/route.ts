import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { ChangeOrderService, changeOrderUpdateSchema } from '@/services/ChangeOrderService'

type Ctx = { params: { id: string } }

// PUT /api/change-orders/:id — edit a DRAFT
export const PUT = withApiHandler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireAuth()
  const data = changeOrderUpdateSchema.parse(await req.json())
  return ChangeOrderService.update({ currentUser: user, id: params.id, data })
})

// DELETE /api/change-orders/:id — discard a DRAFT
export const DELETE = withApiHandler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireAuth()
  return ChangeOrderService.remove({ currentUser: user, id: params.id })
})
