import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { LeadService } from '@/services/LeadService'
import { CreateLeadSchema } from '@/lib/validations'

// GET /api/leads — list leads (optionally by pipeline stage, kanban order)
export const GET = withApiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const { searchParams } = new URL(req.url)
  return LeadService.list({
    currentUser: user,
    stage: searchParams.get('stage') ?? undefined,
  })
})

// POST /api/leads — create lead (auto sortOrder at bottom of its stage)
export const POST = withApiHandler(
  async (req: NextRequest) => {
    const user = await requireAuth()
    const body = CreateLeadSchema.parse(await req.json())
    return LeadService.create({ currentUser: user, data: body })
  },
  { status: 201 },
)