import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { CapacityService } from '@/services/CapacityService'

/**
 * GET /api/studio/workload?past=6&future=4
 * Person × week heatmap. Past = logged hours, future = allocated hours;
 * capacity per cell excludes holidays and approved absences.
 */
export const GET = withApiHandler(async (req: NextRequest) => {
  await requireAuth()
  const sp = new URL(req.url).searchParams
  return CapacityService.getWorkload({
    past: parseInt(sp.get('past') || '6', 10) || 6,
    future: parseInt(sp.get('future') ?? '4', 10) || 0,
  })
})
