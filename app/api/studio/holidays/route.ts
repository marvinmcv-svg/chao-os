import { NextRequest } from 'next/server'
import { withApiHandler } from '@/lib/api-handler'
import { requireAuth } from '@/lib/require-auth'
import { CapacityService, holidayInputSchema } from '@/services/CapacityService'

// GET /api/studio/holidays?from=&to= — Bolivian statutory holidays + studio closures
export const GET = withApiHandler(async (req: NextRequest) => {
  await requireAuth()
  const sp = new URL(req.url).searchParams
  const valid = (k: string) => { const v = sp.get(k); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined }
  return CapacityService.listHolidays({ from: valid('from'), to: valid('to') })
})

// POST /api/studio/holidays — add a studio closure day (PRINCIPAL / ADMIN)
export const POST = withApiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const data = holidayInputSchema.parse(await req.json())
  return CapacityService.createHoliday({ currentUser: user, data })
}, { status: 201 })
