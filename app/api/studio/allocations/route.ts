import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { CapacityService, allocationInputSchema } from '@/services/CapacityService'

// POST /api/studio/allocations — create/replace hours for person × project × week(s); hours 0 removes
export const POST = withApiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const data = allocationInputSchema.parse(await req.json())
  return CapacityService.upsertAllocation({ currentUser: user, data })
})
