import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { ProjectService } from '@/services/ProjectService'

// PATCH /api/projects/:id/phase — update current phase (SD/DD/CD/CA)
export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    const body = await req.json()
    return ProjectService.updatePhase({
      currentUser: user,
      projectId: params.id,
      phase: body.phase,
    })
  },
)