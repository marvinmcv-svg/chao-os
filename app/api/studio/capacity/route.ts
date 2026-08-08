import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { StudioService } from '@/services/StudioService'

// GET /api/studio/capacity — capacity grid for all team members
export const GET = withApiHandler(async (_req: NextRequest) => {
  const user = await requireAuth()
  return StudioService.getCapacity({ currentUser: user })
})