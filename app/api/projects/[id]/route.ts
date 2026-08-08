import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { ProjectService } from '@/services/ProjectService'
import { UpdateProjectSchema } from '@/lib/validations'

// GET /api/projects/:id — get single project with full detail
export const GET = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    return ProjectService.getById({ currentUser: user, id: params.id })
  },
)

// PUT /api/projects/:id — full update
export const PUT = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    const body = UpdateProjectSchema.parse(await req.json())
    return ProjectService.update({ currentUser: user, id: params.id, data: body })
  },
)

// DELETE /api/projects/:id — ADMIN/PRINCIPAL only
export const DELETE = withApiHandler(
  async (_req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await requireAuth()
    return ProjectService.delete({ currentUser: user, id: params.id })
  },
)