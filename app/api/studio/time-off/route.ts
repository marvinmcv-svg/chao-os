import { NextRequest } from 'next/server'
import { TimeOffStatus } from '@prisma/client'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { CapacityService, timeOffInputSchema } from '@/services/CapacityService'

// GET /api/studio/time-off?from=&to=&status= — absences overlapping the range
export const GET = withApiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const sp = new URL(req.url).searchParams
  const valid = (k: string) => { const v = sp.get(k); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined }
  const status = sp.get('status')
  return CapacityService.listTimeOff({
    currentUser: user,
    from: valid('from'),
    to: valid('to'),
    status: status && status in TimeOffStatus ? (status as TimeOffStatus) : undefined,
  })
})

// POST /api/studio/time-off — request (or, for directors, register) an absence
export const POST = withApiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const data = timeOffInputSchema.parse(await req.json())
  return CapacityService.createTimeOff({ currentUser: user, data })
}, { status: 201 })
