import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { CapacityService } from '@/services/CapacityService'

// GET /api/studio/planner?weeks=8&from=YYYY-MM-DD — person × week resource plan
export const GET = withApiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const sp = new URL(req.url).searchParams
  const from = sp.get('from')
  return CapacityService.getPlanner({
    currentUser: user,
    weeks: parseInt(sp.get('weeks') || '8', 10) || 8,
    from: from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : undefined,
  })
})
