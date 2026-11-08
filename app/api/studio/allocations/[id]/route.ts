import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { CapacityService, allocationPatchSchema } from '@/services/CapacityService'

// PATCH /api/studio/allocations/:id — edit hours/phase or move to another person/week (merges)
export const PATCH = withApiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireAuth()
  const data = allocationPatchSchema.parse(await req.json())
  return CapacityService.updateAllocation({ currentUser: user, id: params.id, data })
})

// DELETE /api/studio/allocations/:id
export const DELETE = withApiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireAuth()
  return CapacityService.deleteAllocation({ currentUser: user, id: params.id })
})
