import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { FeeProposalService, proposalUpdateSchema } from '@/services/FeeProposalService'

type Ctx = { params: { id: string } }

// GET /api/proposals/:id — proposal with computed totals
export const GET = withApiHandler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireAuth()
  return FeeProposalService.get({ currentUser: user, id: params.id })
})

// PUT /api/proposals/:id — edit a DRAFT
export const PUT = withApiHandler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireAuth()
  const data = proposalUpdateSchema.parse(await req.json())
  return FeeProposalService.update({ currentUser: user, id: params.id, data })
})

// DELETE /api/proposals/:id — discard a DRAFT
export const DELETE = withApiHandler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireAuth()
  return FeeProposalService.remove({ currentUser: user, id: params.id })
})
