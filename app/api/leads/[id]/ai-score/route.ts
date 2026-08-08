import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { LeadService } from '@/services/LeadService'

// GET /api/leads/:id/ai-score — current AI score (null if never scored)
export const GET = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    return LeadService.getAiScore({ currentUser: user, id: params.id })
  },
)

// POST /api/leads/:id/ai-score — trigger a fresh AI re-score
export const POST = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    return LeadService.triggerAiRescore({ currentUser: user, id: params.id })
  },
)