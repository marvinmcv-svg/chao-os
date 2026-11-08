import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { CapacityService, timeOffReviewSchema } from '@/services/CapacityService'

// PATCH /api/studio/time-off/:id — approve or reject (PRINCIPAL / ADMIN)
export const PATCH = withApiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireAuth()
  const { status } = timeOffReviewSchema.parse(await req.json())
  return CapacityService.reviewTimeOff({ currentUser: user, id: params.id, status })
})

// DELETE /api/studio/time-off/:id — owner (while pending) or directors
export const DELETE = withApiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireAuth()
  return CapacityService.deleteTimeOff({ currentUser: user, id: params.id })
})
