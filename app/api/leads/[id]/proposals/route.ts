import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { FeeProposalService, proposalCreateSchema } from '@/services/FeeProposalService'

type Ctx = { params: { id: string } }

// GET /api/leads/:id/proposals — every version of the lead's fee proposal
export const GET = withApiHandler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireAuth()
  return FeeProposalService.listForLead({ currentUser: user, leadId: params.id })
})

// POST /api/leads/:id/proposals — start a proposal (or a new version of it)
export const POST = withApiHandler(
  async (req: NextRequest, { params }: Ctx) => {
    const user = await requireAuth()
    const body = proposalCreateSchema.parse(await req.json().catch(() => ({})))
    return FeeProposalService.create({ currentUser: user, leadId: params.id, areaM2: body.areaM2 })
  },
  { status: 201 },
)
