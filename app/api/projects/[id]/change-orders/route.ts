import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { ChangeOrderService, changeOrderInputSchema } from '@/services/ChangeOrderService'

type Ctx = { params: { id: string } }

// GET /api/projects/:id/change-orders — list + contract summary
export const GET = withApiHandler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireAuth()
  return ChangeOrderService.listForProject({ currentUser: user, projectId: params.id })
})

// POST /api/projects/:id/change-orders — new DRAFT
export const POST = withApiHandler(
  async (req: NextRequest, { params }: Ctx) => {
    const user = await requireAuth()
    const data = changeOrderInputSchema.parse(await req.json())
    return ChangeOrderService.create({ currentUser: user, projectId: params.id, data })
  },
  { status: 201 }
)
