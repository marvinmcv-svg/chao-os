import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { LeadService } from '@/services/LeadService'

// PATCH /api/leads/:id/stage — update pipeline stage (optionally sortOrder);
// WON auto-forces closeProbability to 100
export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    const body = await req.json()
    return LeadService.updateStage({
      currentUser: user,
      id: params.id,
      pipelineStage: body.pipelineStage,
      sortOrder: body.sortOrder,
    })
  },
)