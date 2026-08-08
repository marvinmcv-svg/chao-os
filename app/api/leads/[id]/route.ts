import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { LeadService } from '@/services/LeadService'

// GET /api/leads/:id — lead with full detail relation graph
export const GET = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    return LeadService.getById({ currentUser: user, id: params.id })
  },
)

// PUT /api/leads/:id — partial update (whitelisted fields only;
// pipelineStage is managed via PATCH /api/leads/:id/stage)
export const PUT = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    const body = await req.json()
    return LeadService.update({ currentUser: user, id: params.id, data: body })
  },
)

// DELETE /api/leads/:id
export const DELETE = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    return LeadService.delete({ currentUser: user, id: params.id })
  },
)