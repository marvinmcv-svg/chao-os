import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { proposalStore } from '@/lib/proposal-store'
import { NotFoundError } from '@/lib/result'

// GET /api/ai/draft-proposal/:id — retrieve a previously generated proposal
export const GET = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    await requireAuth()

    const proposal = await proposalStore.findById(params.id)
    if (!proposal) throw new NotFoundError('Proposal', params.id)

    return proposal
  },
)