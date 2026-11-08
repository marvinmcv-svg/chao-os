import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { CapacityService } from '@/services/CapacityService'

// DELETE /api/studio/holidays/:id — remove a studio closure (PRINCIPAL / ADMIN)
export const DELETE = withApiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await requireAuth()
  return CapacityService.deleteHoliday({ currentUser: user, id: params.id })
})
