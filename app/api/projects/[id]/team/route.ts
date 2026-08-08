import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { ProjectService } from '@/services/ProjectService'

// GET /api/projects/:id/team — list team members on a project
export const GET = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    return ProjectService.listTeamMembers({
      currentUser: user,
      projectId: params.id,
    })
  },
)

// POST /api/projects/:id/team — add team member to project
export const POST = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    const body = await req.json()
    return ProjectService.addTeamMember({
      currentUser: user,
      projectId: params.id,
      userId: body.userId,
      role: body.role,
    })
  },
  { status: 201 },
)