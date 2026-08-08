import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { ProjectService } from '@/services/ProjectService'
import { CreateProjectSchema } from '@/lib/validations'

// GET /api/projects — list projects (status/clientId/page/limit filters)
export const GET = withApiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const { searchParams } = new URL(req.url)
  return ProjectService.list({
    currentUser: user,
    status: searchParams.get('status') ?? undefined,
    clientId: searchParams.get('clientId') ?? undefined,
    page: parseInt(searchParams.get('page') || '1', 10),
    limit: parseInt(searchParams.get('limit') || '50', 10),
  })
})

// POST /api/projects — create project (with 4 default phases)
export const POST = withApiHandler(
  async (req: NextRequest) => {
    const user = await requireAuth()
    const body = CreateProjectSchema.parse(await req.json())
    return ProjectService.create({ currentUser: user, data: body })
  },
  { status: 201 },
)