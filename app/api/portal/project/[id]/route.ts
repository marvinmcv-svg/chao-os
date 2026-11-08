import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { PortalService } from '@/services/PortalService'

// GET /api/portal/project/:id?token=XXX — client-safe project view
export const GET = withApiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const token = new URL(req.url).searchParams.get('token') ?? undefined
  return PortalService.getProjectForClient({ token, projectId: params.id })
})
