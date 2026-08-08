import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { LeadService } from '@/services/LeadService'

// POST /api/leads/:id/convert — convert a WON lead to a project
export const POST = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    return LeadService.convertToProject({ currentUser: user, id: params.id })
  },
  { status: 201 },
)