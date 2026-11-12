import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { CostAdmin, openingSchema } from '@/services/CostService'

type Ctx = { params: { id: string } }

// GET /api/projects/:id/costs — derived cost breakdown (labour, expenses, opening; per phase + unphased)
export const GET = withApiHandler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireAuth()
  return CostAdmin.breakdown({ currentUser: user, projectId: params.id })
})

// PUT /api/projects/:id/costs — set opening balances (principal / admin), then recompute
export const PUT = withApiHandler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireAuth()
  const data = openingSchema.parse(await req.json())
  return CostAdmin.setOpening({ currentUser: user, projectId: params.id, data })
})
