import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { FeeProposalService, proposalActionSchema } from '@/services/FeeProposalService'

// POST /api/proposals/:id/status — { action: send | accept | decline | revise }
export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireAuth()
  const { action } = proposalActionSchema.parse(await req.json())
  return FeeProposalService.transition({ currentUser: user, id: params.id, action })
})
